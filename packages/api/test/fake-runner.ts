/**
 * TEST DOUBLE ONLY. A contract-faithful stand-in for Adhvik's runner daemon so
 * the API side can be tested before the real runner exists. It does not run a
 * browser; it serves scripted pages. It is not deployed and is not a competing
 * runner implementation.
 */
import { createHash, createHmac } from "node:crypto";
import { Hono } from "hono";
import { runner as rc } from "@wallio/contracts";
import { markerPng, randomMarker } from "../scripts/marker-png.ts";

export const RUNNER_TOKEN = "test-runner-token-0123456789abcdef";
const sha = (b: Buffer | string) => `sha256:${createHash("sha256").update(b).digest("hex")}`;

export interface FakePage {
  title?: string;
  text: string;
  blocked?: { reason: "captcha" | "mfa" | "login_required" | "access_denied"; detail: string };
  redirectChain?: string[];
  finalUrl?: string;
  /** Fail with a retryable navigation error this many times first. */
  failTimes?: number;
  deniedRequests?: Array<{ url: string; reason: string }>;
  /** Visible elements returned by inspect (forms and the hostile page). */
  elements?: rc.Observation["elements"];
  /** Submitting the page's form: receives field values by element name, returns the next page. */
  submit?: (values: Record<string, string>) => Promise<FakePage>;
}

interface Job {
  spec: rc.RunnerJobCreate;
  results: Map<string, unknown>;
  actionsUsed: number;
  screenshotsUsed: number;
  current: { url: string; page: FakePage } | null;
  state: "ready" | "finished" | "cleaned";
  /** Field values by element ref on the current page. */
  values: Record<string, string>;
  denied: Array<{ url: string; reason: string; at: string }>;
  inspects: number;
}

export class FakeRunner {
  pages = new Map<string, FakePage>();
  jobs = new Map<string, Job>();
  artifacts = new Map<string, Buffer>();
  /** Every action the runner was asked to execute (after idempotency), in order. */
  log: Array<{ jobId: string; type: string; url?: string }> = [];
  /** Dynamic pages (e.g. the owned eval page), consulted before `pages`. */
  resolve: ((url: string) => Promise<FakePage | undefined>) | null = null;
  failCreate = false;
  failCleanup = false;
  /** Like the real runner: verifies approval tokens on submit clicks with this key. */
  approvalKey: string | null = null;
  usedNonces = new Set<string>();
  /** Called after each inspect; tests use it to change a field (a page that changes after approval). */
  onInspect: ((job: { values: Record<string, string>; inspects: number }) => void) | null = null;
  /** Submit clicks that reached the page, after token checks. */
  submits = 0;
  readonly app = new Hono();
  private failCounts = new Map<string, number>();

  constructor() {
    const app = this.app;
    app.use("*", async (c, next) => {
      if (c.req.header("authorization") !== `Bearer ${RUNNER_TOKEN}`) return c.json({ code: "unauthorized", message: "bad token" }, 401);
      await next();
    });

    app.post("/jobs", async (c) => {
      if (this.failCreate) return c.json({ code: "busy", message: "no capacity" }, 503);
      const spec = rc.RunnerJobCreate.parse(await c.req.json());
      // Like the real daemon: one active job per runner.
      if ([...this.jobs.values()].some((j) => j.state === "ready")) return c.json({ code: "busy", message: "a job is already active" }, 409);
      this.jobs.set(spec.jobId, { spec, results: new Map(), actionsUsed: 0, screenshotsUsed: 0, current: null, state: "ready", values: {}, denied: [], inspects: 0 });
      return c.json(this.status(spec.jobId), 201);
    });

    app.get("/jobs/:id", (c) => (this.jobs.has(c.req.param("id")) ? c.json(this.status(c.req.param("id"))) : c.json({ code: "job_not_found", message: "no job" }, 404)));

    app.post("/jobs/:id/actions", async (c) => {
      const job = this.jobs.get(c.req.param("id"));
      if (!job) return c.json({ code: "job_not_found", message: "no job" }, 404);
      const req = rc.RunnerActionRequest.parse(await c.req.json());
      if (job.results.has(req.actionId)) return c.json(job.results.get(req.actionId)); // idempotent
      const result = await this.execute(c.req.param("id"), job, req);
      job.results.set(req.actionId, result);
      return c.json(result);
    });

    app.post("/jobs/:id/finish", (c) => {
      const job = this.jobs.get(c.req.param("id"));
      if (!job) return c.json({ code: "job_not_found", message: "no job" }, 404);
      if (job.state !== "ready") return c.json({ code: "job_not_ready", message: "already finished" }, 409);
      job.state = this.failCleanup ? "finished" : "cleaned";
      return c.json(this.cleanup(c.req.param("id")));
    });
    app.post("/jobs/:id/cancel", (c) => c.json({}, 202));
    app.get("/jobs/:id/cleanup", (c) => (this.jobs.has(c.req.param("id")) ? c.json(this.cleanup(c.req.param("id"))) : c.json({ code: "job_not_found", message: "no job" }, 404)));
    app.get("/artifacts/:id", (c) => {
      const a = this.artifacts.get(c.req.param("id"));
      return a ? c.body(new Uint8Array(a), 200, { "content-type": "image/png", "x-content-sha256": sha(a) }) : c.json({ code: "job_not_found", message: "no artifact" }, 404);
    });
  }

  /** fetch-compatible handler for RunnerClient. */
  fetch = ((input: string | URL | Request, init?: RequestInit) => this.app.request(String(input), init)) as unknown as typeof fetch;

  private status(jobId: string): rc.RunnerJobStatus {
    const j = this.jobs.get(jobId)!;
    return { jobId, state: j.state === "cleaned" ? "cleaned" : j.state, actionsUsed: j.actionsUsed, screenshotsUsed: j.screenshotsUsed, startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + j.spec.limits.deadlineMs).toISOString(), imageDigest: `sha256:${"0".repeat(64)}` };
  }

  private cleanup(jobId: string): rc.CleanupReport {
    const j = this.jobs.get(jobId);
    const ok = j?.state === "cleaned";
    if (j?.state === "ready") return { jobId, status: "pending", containerId: "c0ffee", containerRemoved: false, volumeRemoved: false, verifiedAt: null, actionsExecuted: j.actionsUsed, screenshotsTaken: j.screenshotsUsed, deniedRequests: [], detail: null };
    return { jobId, status: ok ? "cleaned" : "cleanup_failed", containerId: "c0ffee", containerRemoved: ok, volumeRemoved: ok, verifiedAt: ok ? new Date().toISOString() : null, actionsExecuted: j?.actionsUsed ?? 0, screenshotsTaken: j?.screenshotsUsed ?? 0, deniedRequests: j?.denied ?? [], detail: ok ? null : "container still present" };
  }

  private observation(url: string, page: FakePage, screenshot: rc.Observation["screenshot"] = null, values: Record<string, string> = {}, withElements = false): rc.Observation {
    const ordered = Object.keys(values).sort().map((k) => [k, values[k]]);
    return {
      url: page.finalUrl ?? url, title: page.title ?? "Page", httpStatus: 200, redirectChain: page.redirectChain ?? [],
      // Like the real runner: URL + structure + current field values.
      pageFingerprint: sha(url + page.text + JSON.stringify(page.elements ?? []) + JSON.stringify(ordered)), textExcerpt: page.text.slice(0, 4000), textSha256: sha(page.text),
      elements: withElements ? (page.elements ?? []) : null, screenshot, blocked: page.blocked ?? null, deniedRequests: page.deniedRequests ?? [], capturedAt: new Date().toISOString(),
    };
  }

  private async execute(jobId: string, job: Job, req: rc.RunnerActionRequest): Promise<rc.RunnerActionResult> {
    const a = req.action;
    const base = { actionId: req.actionId, stepIndex: req.stepIndex, durationMs: 5 };
    this.log.push({ jobId, type: a.type, ...(a.type === "navigate" ? { url: a.url } : {}) });
    if (job.actionsUsed >= job.spec.limits.maxActions) {
      return { ...base, status: "failed", observation: null, error: { code: "action_limit_reached", message: "limit", retryable: false }, actionsRemaining: 0 };
    }
    job.actionsUsed++;
    const remaining = job.spec.limits.maxActions - job.actionsUsed;
    if (a.type === "navigate") {
      const host = new URL(a.url).hostname;
      if (!job.spec.allowedHosts.includes(host)) {
        return { ...base, status: "denied", observation: null, error: { code: "egress_denied", message: `${host} not allowed`, retryable: false }, actionsRemaining: remaining };
      }
      const page = (this.resolve ? await this.resolve(a.url) : undefined) ?? this.pages.get(a.url);
      if (!page) return { ...base, status: "failed", observation: null, error: { code: "navigation_failed", message: "404", retryable: false }, actionsRemaining: remaining };
      const failed = this.failCounts.get(a.url) ?? 0;
      if (page.failTimes && failed < page.failTimes) {
        this.failCounts.set(a.url, failed + 1);
        return { ...base, status: "failed", observation: null, error: { code: "navigation_failed", message: "timeout", retryable: true }, actionsRemaining: remaining };
      }
      job.current = { url: a.url, page };
      job.values = {};
      for (const d of page.deniedRequests ?? []) job.denied.push({ ...d, at: new Date().toISOString() });
      return { ...base, status: "ok", observation: this.observation(a.url, page), error: null, actionsRemaining: remaining };
    }
    if (a.type === "screenshot") {
      if (!job.current) return { ...base, status: "failed", observation: null, error: { code: "invalid_action", message: "no page", retryable: false }, actionsRemaining: remaining };
      const png = markerPng(randomMarker(4), 4);
      const id = `art_${this.artifacts.size + 1}`;
      this.artifacts.set(id, png);
      job.screenshotsUsed++;
      return { ...base, status: "ok", observation: this.observation(job.current.url, job.current.page, { artifactId: id, sha256: sha(png), width: 100, height: 40, bytes: png.length, mimeType: "image/png" }), error: null, actionsRemaining: remaining };
    }
    const cur = job.current;
    const fail = (code: rc.RunnerActionResult["error"] extends infer E ? E extends { code: infer C } ? C : never : never, message: string, status: "failed" | "denied" = "failed") =>
      ({ ...base, status, observation: null, error: { code, message, retryable: false }, actionsRemaining: remaining }) as rc.RunnerActionResult;
    if (!cur) return fail("invalid_action", "no page");
    const obs = (withElements = true) => this.observation(cur.url, cur.page, null, job.values, withElements);
    if (a.type === "inspect") {
      job.inspects++;
      this.onInspect?.(job);
      return { ...base, status: "ok", observation: obs(), error: null, actionsRemaining: remaining };
    }
    const el = "elementRef" in a ? cur.page.elements?.find((e) => e.ref === a.elementRef) : undefined;
    if (a.type === "fill") {
      if (!el || el.role !== "textbox") return fail("element_not_found", "not a text field");
      job.values[el.ref] = a.value;
      return { ...base, status: "ok", observation: obs(), error: null, actionsRemaining: remaining };
    }
    if (a.type === "click") {
      if (!el) return fail("element_not_found", "no such element");
      if (el.inputType !== "submit" || !cur.page.submit) return fail("invalid_action", "fake runner only scripts form submits");
      // Like the real runner: a submit needs a valid, unused token bound to this job, action, element and current page.
      const fp = obs().pageFingerprint.replace(/^sha256:/, "");
      const parts = (a.approvalToken ?? "").split(".");
      const [, exp, nonce, tokFp, sig] = parts;
      const want = this.approvalKey && parts.length === 5
        ? createHmac("sha256", this.approvalKey).update(["wallio-approval-v1", jobId, req.actionId, el.ref, tokFp, exp, nonce].join("|")).digest("base64url") : null;
      if (!want || want !== sig || tokFp !== fp || Number(exp) * 1000 <= Date.now() || this.usedNonces.has(nonce!)) {
        return fail("approval_token_invalid", "missing, invalid, expired, page changed, or already used", "denied");
      }
      this.usedNonces.add(nonce!);
      this.submits++;
      const byName = Object.fromEntries((cur.page.elements ?? []).filter((e) => job.values[e.ref] !== undefined).map((e) => [e.name, job.values[e.ref]!]));
      const next = await cur.page.submit(byName);
      job.current = { url: cur.url, page: next };
      job.values = {};
      return { ...base, status: "ok", observation: this.observation(cur.url, next), error: null, actionsRemaining: remaining };
    }
    return fail("invalid_action", `fake runner does not script ${a.type}`);
  }
}

/** Opens Wallio's real trial form through the app, the way a browser would (test double). */
export async function ownedFormPage(app: { request: (p: string, i?: RequestInit) => Response | Promise<Response> }, url: string, labels: ReadonlyArray<{ name: string; label: string }>, submitLabel: string): Promise<FakePage | undefined> {
  const u = new URL(url);
  const res = await app.request(u.pathname, { headers: { host: u.host } });
  if (res.status !== 200) return undefined;
  const text = (await res.text()).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const elements = [
    ...labels.map((f, i) => ({ ref: `e${i + 1}`, role: "textbox", name: f.label, tag: f.name === "note" ? "textarea" : "input", text: "", href: null, inputType: f.name === "note" ? null : f.name === "email" ? "email" : "text", targetHost: null })),
    { ref: `e${labels.length + 1}`, role: "button", name: submitLabel, tag: "button", text: submitLabel, href: null, inputType: "submit", targetHost: u.hostname },
  ];
  return {
    title: "Trial request", text, elements,
    submit: async (byLabel) => {
      const form = new URLSearchParams(labels.map((f) => [f.name, byLabel[f.label] ?? ""]));
      const r = await app.request(u.pathname, { method: "POST", headers: { host: u.host, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
      return { title: "Result", text: (await r.text()).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
    },
  };
}

/** A fake Vultr chat-completions endpoint. `planner` and `extractor` produce the assistant's JSON text. */
export function fakeInference(opts: {
  planner?: (userContent: any) => unknown;
  extractor?: (questions: string[], pageText: string) => unknown;
  plannerRaw?: string;
  explainer?: (facts: Array<{ id: string; text: string }>) => unknown;
  fixer?: () => unknown;
}) {
  const calls: string[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const system = body.messages[0].content as string;
    const user = body.messages.at(-1).content as string;
    let content: string;
    if (system.includes("You fix bugs")) {
      calls.push("task");
      content = JSON.stringify(opts.fixer ? opts.fixer() : { code: "function lastN(items, n) {\n  return n === 0 ? [] : items.slice(-n);\n}" });
    } else if (system.includes("explain an AI-tool decision")) {
      calls.push("explain");
      const facts = JSON.parse(user.split("\n\nYour previous answer")[0]).facts as Array<{ id: string; text: string }>;
      content = JSON.stringify(opts.explainer ? opts.explainer(facts) : defaultExplain(facts));
    } else if (system.includes("plan bounded research")) {
      calls.push("plan");
      content = opts.plannerRaw ?? JSON.stringify(opts.planner ? opts.planner(JSON.parse(user)) : { pages: [], questions: [] });
    } else {
      calls.push("extract");
      const questions = [...user.matchAll(/^- (.+)$/gm)].map((m) => m[1]!);
      const text = user.slice(user.indexOf(">\n") + 2, user.lastIndexOf("\n</page_content>"));
      content = JSON.stringify(opts.extractor ? opts.extractor(questions, text) : defaultExtract(questions, text));
    }
    return new Response(JSON.stringify({ model: "qwen3.8-flash-next", choices: [{ message: { content } }], usage: { prompt_tokens: 400, completion_tokens: 120 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

/** Answers "cost" questions with the first sentence quoting a monthly price, verbatim. */
export function defaultExtract(questions: string[], text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const priced = sentences.find((s) => s.includes("$") && /month/i.test(s)) ?? sentences.find((s) => s.includes("$"));
  return {
    findings: questions.map((q) =>
      /cost/i.test(q) && priced
        ? { question: q, answer: "supported", statement: "The page lists the plan price.", quote: priced }
        : { question: q, answer: "not_found", statement: "Not stated on this page.", quote: "" },
    ),
  };
}

/** Restates price facts and the untested-quality fact, citing them. */
export function defaultExplain(facts: Array<{ id: string; text: string }>) {
  const priced = facts.filter((f) => /per month/.test(f.text)).slice(0, 2);
  const untested = facts.find((f) => /not tested/.test(f.text));
  return {
    statements: [
      ...priced.map((f) => ({ text: f.text, role: "supporting", factIds: [f.id] })),
      ...(untested ? [{ text: "Quality on your own task hasn't been tested yet.", role: "uncertainty", factIds: [untested.id] }] : []),
      { text: "Try it on a real bug.", role: "next_step", factIds: [] },
    ],
  };
}
