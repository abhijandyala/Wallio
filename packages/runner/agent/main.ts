/**
 * In-container browser agent. Reads one AgentRequest per line on stdin,
 * executes it with Playwright, writes one AgentReply per line on stdout.
 *
 * It only knows the fixed action vocabulary. It holds no keys: the only
 * secret it sees is this job's proxy credential, which grants nothing beyond
 * this job's allowlist. Network policy is enforced by the egress proxy and
 * the Docker network, not here.
 */
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type ElementHandle, type JSHandle, type Page, type Response } from "playwright-core";
import { AGENT_CAPS, type AgentElement, type AgentErrorCode, type AgentObservation, type AgentReply, type AgentRequest, type BlockReason } from "./protocol.ts";

const env = process.env;
const TEST_MODE = env.WALLIO_TEST_MODE === "1";
const VIEWPORT = { width: 1280, height: 800 };
const OP_TIMEOUT_MS: Record<string, number> = { navigate: 40_000, click: 20_000, screenshot: 20_000 };

const INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [contenteditable=""], [contenteditable="true"]';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let refs = new Map<string, ElementHandle>();
let lastStatus: number | null = null;
let lastRedirects: string[] = [];
let navDenied: string | null = null;
let downloadBlocked = false;
let crashed = false;

class AgentError extends Error {
  code: AgentErrorCode;
  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const send = (obj: unknown) => process.stdout.write(JSON.stringify(obj) + "\n");
const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

async function launch(): Promise<void> {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    proxy: { server: env.WALLIO_PROXY_SERVER!, username: env.WALLIO_PROXY_USER!, password: env.WALLIO_PROXY_PASS!, bypass: "<-loopback>" },
    args: [
      "--disable-dev-shm-usage",
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-domain-reliability",
      "--no-pings",
      "--dns-prefetch-disable",
    ],
  });
  context = await browser.newContext({
    viewport: VIEWPORT,
    acceptDownloads: false,
    serviceWorkers: "block",
    ignoreHTTPSErrors: TEST_MODE,
    locale: "en-US",
    timezoneId: "UTC",
  });
  context.setDefaultTimeout(10_000);
  page = await context.newPage();
  // One tab only: anything the page opens is closed immediately.
  context.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  page.on("download", (d) => { downloadBlocked = true; d.cancel().catch(() => {}); });
  page.on("crash", () => { crashed = true; });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) refs = new Map(); });
  page.on("response", (r) => {
    if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) {
      lastStatus = r.status();
      lastRedirects = redirectChain(r);
    }
  });
  page.on("requestfailed", (req) => {
    if (!req.isNavigationRequest() || req.frame() !== page.mainFrame()) return;
    if (/TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|ERR_ACCESS_DENIED/.test(req.failure()?.errorText ?? "")) navDenied = req.url();
  });
}

function redirectChain(r: Response): string[] {
  const urls: string[] = [];
  let req = r.request();
  while (req.redirectedFrom()) {
    req = req.redirectedFrom()!;
    urls.unshift(req.url());
  }
  return urls.length ? [...urls, r.url()] : [];
}

async function settle(): Promise<void> {
  await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
}

/**
 * After a click: wait until the page stops changing. Honors aria-busy="true"
 * (pages that run something slow, like the owned eval page, mark their result
 * region busy until done), capped at 15 s; otherwise waits for 1 s without DOM
 * mutations, capped at 6 s.
 */
async function settleAfterClick(): Promise<void> {
  await settle();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 15_000, polling: 250 }).catch(() => {});
  await page.evaluate(
    ({ quietMs, maxMs }) =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(done, quietMs);
        const cap = setTimeout(done, maxMs);
        const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, quietMs); });
        obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
        function done() { obs.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(); }
      }),
    { quietMs: 1_000, maxMs: 6_000 },
  ).catch(() => {});
}

// ───────────── page reading (runs inside the page; must be self-contained) ─────────────

interface Described {
  tag: string; type: string | null; role: string; name: string; text: string; href: string | null;
  targetHost: string | null; submits: boolean; sensitive: boolean; fillable: boolean; value: string | null;
}

/** Describes one element or a list (in document order). Self-contained: Playwright ships its source into the page. */
function describeInPage(input: Element | Element[]): Described | Described[] {
  const one = (el: Element): Described => {
  const h = el as HTMLElement & { value?: string; form?: HTMLFormElement | null; formAction?: string; href?: string; isContentEditable?: boolean };
  const tag = el.tagName.toLowerCase();
  const rawType = el.getAttribute("type");
  const type = tag === "input" ? (rawType || "text").toLowerCase() : tag === "button" ? (rawType || "submit").toLowerCase() : null;
  const implicit: Record<string, string> = { a: "link", button: "button", select: "combobox", textarea: "textbox", summary: "button" };
  let role = el.getAttribute("role") || implicit[tag] || "";
  if (!role && tag === "input") role = ["submit", "button", "reset", "image"].includes(type!) ? "button" : type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : "textbox";
  if (!role) role = "generic";
  const text = ((h.innerText || el.textContent || "") as string).replace(/\s+/g, " ").trim();
  const isButtonLike = tag === "button" || (tag === "input" && ["submit", "button", "reset", "image"].includes(type!));
  const name = (el.getAttribute("aria-label") || text || (isButtonLike ? h.value : "") || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || "").replace(/\s+/g, " ").trim();
  const form = h.form ?? el.closest("form");
  const submits = !!form && ((tag === "button" && type === "submit") || (tag === "input" && (type === "submit" || type === "image")));
  let href: string | null = null;
  let targetHost: string | null = null;
  if (tag === "a" && h.href) {
    href = h.href;
    try { const u = new URL(h.href); if (u.protocol === "http:" || u.protocol === "https:") targetHost = u.hostname; } catch {}
  } else if (submits) {
    // button.formAction falls back to the page URL when the attribute is absent, so only trust it if set.
    const action = el.hasAttribute("formaction") ? h.formAction : (form as HTMLFormElement).action;
    try { targetHost = new URL(action || location.href).hostname; } catch {}
  }
  const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
  const sensitive =
    (tag === "input" && ["password", "file", "hidden"].includes(type!)) ||
    /one-time-code|current-password|new-password|cc-|card|cvc|cvv/.test(ac);
  const fillable = !sensitive && (tag === "textarea" || !!h.isContentEditable ||
    (tag === "input" && ["text", "email", "search", "tel", "url", "number"].includes(type!)));
  const value = (tag === "input" || tag === "textarea" || tag === "select") && type !== "password" ? String(h.value ?? "").slice(0, 200) : null;
  return { tag, type, role, name, text, href, targetHost, submits, sensitive, fillable, value };
  };
  return Array.isArray(input) ? input.slice(0, 400).map(one) : one(input);
}

function collectInPage(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector)).filter((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  });
}

function pageSignalsInPage(): { text: string; iframes: string[]; hasPassword: boolean; hasOtc: boolean; hasTextInput: boolean } {
  const text = (document.body ? document.body.innerText : "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    text,
    iframes: Array.from(document.querySelectorAll("iframe")).map((f) => f.getAttribute("src") || "").slice(0, 50),
    hasPassword: Array.from(document.querySelectorAll('input[type="password"]')).some(vis),
    hasOtc: Array.from(document.querySelectorAll('input[autocomplete="one-time-code"]')).some(vis),
    hasTextInput: Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).some(vis),
  };
}

// ───────────── observations ─────────────

async function collect(): Promise<{ handle: JSHandle<Element[]>; items: Described[] }> {
  const handle = await page.evaluateHandle(collectInPage, INTERACTIVE);
  const items = (await handle.evaluate(describeInPage as (els: Element[]) => Described[])) as Described[];
  return { handle, items };
}

function fingerprint(url: string, items: Described[]): string {
  const u = url.split("#")[0];
  const e = items.slice(0, AGENT_CAPS.fingerprintElements).map((d) => [d.tag, d.type, d.name.slice(0, 80), d.targetHost, d.value]);
  return sha256Hex(JSON.stringify({ u, e }));
}

function detectBlock(sig: Awaited<ReturnType<typeof readSignals>>, title: string): { reason: BlockReason; detail: string } | null {
  if (downloadBlocked) return { reason: "download_blocked", detail: "The page tried to start a download. Downloads are disabled in the runner." };
  const lower = sig.text.slice(0, 3000).toLowerCase();
  if (sig.iframes.some((s) => /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha/i.test(s)) ||
      /verify you are human|are you a robot|unusual traffic|complete the security check|press (&|and) hold/.test(lower) ||
      /just a moment|attention required/i.test(title)) {
    return { reason: "captcha", detail: "The page shows a bot check or CAPTCHA. The runner stops here and does not try to solve it." };
  }
  if (sig.hasOtc || (sig.hasTextInput && /two-factor|2fa|verification code|authentication code|authenticator app/.test(lower))) {
    return { reason: "mfa", detail: "The page asks for a one-time or two-factor code. The runner stops here." };
  }
  if (sig.hasPassword) return { reason: "login_required", detail: "The page asks for a password. The runner never signs in." };
  if (lastStatus === 401) return { reason: "login_required", detail: "The server answered 401 (sign-in required)." };
  if (lastStatus === 403 || lastStatus === 429) return { reason: "access_denied", detail: `The server answered ${lastStatus}.` };
  if (lastStatus !== null && lastStatus >= 400) return { reason: "http_error", detail: `The server answered ${lastStatus}.` };
  return null;
}

async function readSignals() {
  return page.evaluate(pageSignalsInPage).catch(() => ({ text: "", iframes: [] as string[], hasPassword: false, hasOtc: false, hasTextInput: false }));
}

async function observe(opts: { elements?: number; screenshotPng?: string | null } = {}): Promise<AgentObservation> {
  const url = page.url();
  const title = (await page.title().catch(() => "")).slice(0, AGENT_CAPS.titleChars);
  const sig = await readSignals();
  let items: Described[] = [];
  let handle: JSHandle<Element[]> | null = null;
  try {
    ({ handle, items } = await collect());
  } catch {
    items = [];
  }
  let elements: AgentElement[] | null = null;
  if (opts.elements && handle) {
    const props = await handle.getProperties();
    refs = new Map();
    elements = [];
    for (let i = 0; i < Math.min(items.length, opts.elements); i++) {
      const el = props.get(String(i))?.asElement();
      if (!el) continue;
      const d = items[i]!;
      const ref = `e${i + 1}`;
      refs.set(ref, el as ElementHandle);
      elements.push({
        ref, role: d.role.slice(0, 50), name: d.name.slice(0, AGENT_CAPS.nameChars), tag: d.tag,
        text: d.text.slice(0, AGENT_CAPS.elementTextChars), href: d.href ? d.href.slice(0, 2000) : null,
        inputType: d.type, targetHost: d.targetHost, submits: d.submits, sensitive: d.sensitive,
      });
    }
  }
  await handle?.dispose().catch(() => {});
  return {
    url, title,
    httpStatus: lastStatus,
    redirectChain: lastRedirects.slice(0, 20),
    fingerprintHex: fingerprint(url, items),
    textExcerpt: sig.text ? sig.text.slice(0, AGENT_CAPS.textExcerptChars) : null,
    elements,
    screenshotPng: opts.screenshotPng ?? null,
    blocked: detectBlock(sig, title),
    navigationDenied: navDenied,
    capturedAt: new Date().toISOString(),
  };
}

async function lightObservation(): Promise<AgentObservation | null> {
  if (crashed) return null;
  return Promise.race([observe().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3_000))]);
}

// ───────────── actions ─────────────

async function liveHandle(ref: string): Promise<{ h: ElementHandle; d: Described }> {
  const h = refs.get(ref);
  if (!h) {
    throw refs.size === 0
      ? new AgentError("element_stale", "The page changed since the last inspect. Call inspect again.")
      : new AgentError("element_not_found", `No element ${ref} in the last inspect.`);
  }
  const connected = await h.evaluate((e) => e.isConnected).catch(() => false);
  if (!connected) throw new AgentError("element_stale", `${ref} is no longer on the page. Call inspect again.`);
  const d = (await h.evaluate(describeInPage as (el: Node) => Described)) as Described;
  return { h, d };
}

function resetStepFlags() {
  navDenied = null;
  downloadBlocked = false;
}

async function run(req: AgentRequest): Promise<AgentObservation | null> {
  if (crashed && req.op !== "shutdown") throw new AgentError("browser_crashed", "The browser tab crashed.");
  switch (req.op) {
    case "navigate": {
      resetStepFlags();
      try {
        await page.goto(req.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      } catch (err) {
        const msg = (err as Error).message;
        if (navDenied || /TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|ERR_ACCESS_DENIED/.test(msg)) {
          navDenied ??= req.url;
          throw new AgentError("egress_denied", `The egress proxy refused ${hostOf(req.url)}.`);
        }
        if (downloadBlocked) return observe();
        if (/Timeout/i.test(msg)) throw new AgentError("action_timeout", "The page did not load within 30 s.");
        throw new AgentError("navigation_failed", firstLine(msg));
      }
      await settle();
      return observe();
    }
    case "inspect":
      return observe({ elements: req.maxElements });
    case "click": {
      const { h, d } = await liveHandle(req.ref);
      if (d.submits && !req.approved) throw new AgentError("approval_token_invalid", "This control submits a form, so it needs an approval token.");
      if (req.approved && req.expectedFingerprint) {
        const { handle, items } = await collect();
        await handle.dispose().catch(() => {});
        if (fingerprint(page.url(), items) !== req.expectedFingerprint) {
          throw new AgentError("approval_token_invalid", "The page changed after the user approved this action. Prepare a new approval.");
        }
      }
      resetStepFlags();
      await h.click({ timeout: 10_000 });
      await settleAfterClick();
      const obs = await observe();
      if (navDenied) throw Object.assign(new AgentError("egress_denied", `The click tried to open ${hostOf(navDenied)}, which the egress proxy refused.`), { obs });
      return obs;
    }
    case "fill": {
      const { h, d } = await liveHandle(req.ref);
      if (d.sensitive) throw new AgentError("invalid_action", "Refusing to fill a password, payment, one-time-code or file field.");
      if (!d.fillable) throw new AgentError("invalid_action", `${req.ref} is not a text field.`);
      await h.fill(req.value, { timeout: 5_000 });
      return observe();
    }
    case "scroll":
      await page.mouse.wheel(0, req.direction === "down" ? req.pixels : -req.pixels);
      await page.waitForTimeout(400);
      return observe();
    case "screenshot": {
      let png: Buffer;
      if (req.fullPage) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => VIEWPORT.height);
        png = await page.screenshot({
          type: "png", fullPage: true, animations: "disabled", caret: "hide", timeout: 15_000,
          clip: height > AGENT_CAPS.fullPageMaxHeight ? { x: 0, y: 0, width: VIEWPORT.width, height: AGENT_CAPS.fullPageMaxHeight } : undefined,
        });
      } else {
        png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide", timeout: 10_000 });
      }
      return observe({ screenshotPng: png.toString("base64") });
    }
    case "observe":
      return observe();
    case "shutdown":
      await browser.close().catch(() => {});
      return null;
  }
}

const hostOf = (u: string) => { try { return new URL(u).host; } catch { return "that address"; } };
const firstLine = (s: string) => s.split("\n")[0]!.slice(0, 300);

function toCode(err: unknown): { code: AgentErrorCode; message: string } {
  if (err instanceof AgentError) return { code: err.code, message: err.message };
  const msg = (err as Error)?.message ?? String(err);
  if ((err as Error)?.name === "TimeoutError" || /Timeout \d+ms exceeded/.test(msg)) return { code: "action_timeout", message: firstLine(msg) };
  if (/has been closed|Target crashed|Browser closed/i.test(msg) || crashed) return { code: "browser_crashed", message: "The browser closed or crashed." };
  return { code: "internal", message: firstLine(msg) };
}

async function handle(req: AgentRequest): Promise<AgentReply> {
  const limit = OP_TIMEOUT_MS[req.op] ?? 15_000;
  let timer: NodeJS.Timeout | undefined;
  try {
    const observation = await Promise.race([
      run(req),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new AgentError("action_timeout", `The ${req.op} action took longer than ${limit / 1000} s.`)), limit); }),
    ]);
    return { id: req.id, ok: true, observation };
  } catch (err) {
    const { code, message } = toCode(err);
    const observation = (err as { obs?: AgentObservation }).obs ?? (code === "browser_crashed" ? null : await lightObservation());
    return { id: req.id, ok: false, code, message, observation };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  try {
    await launch();
  } catch (err) {
    send({ hello: "failed", message: firstLine((err as Error).message) });
    process.exit(1);
  }
  send({ hello: "ready", browserVersion: browser.version() });

  // Requests are handled strictly one at a time, in arrival order.
  let chain = Promise.resolve();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    chain = chain.then(async () => {
      let req: AgentRequest;
      try {
        req = JSON.parse(line) as AgentRequest;
      } catch {
        return;
      }
      const reply = await handle(req);
      send(reply);
      if (req.op === "shutdown") process.exit(0);
    });
  });
  // Daemon went away: close the browser and exit so the container stops.
  rl.on("close", () => { chain.then(() => browser.close().catch(() => {})).finally(() => process.exit(0)); });
}

void main();
