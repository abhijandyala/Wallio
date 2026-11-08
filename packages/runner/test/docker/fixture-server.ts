/**
 * Test fixtures for the Docker integration tests. Runs in its own container on
 * the proxy's outbound network. Only reachable from jobs through the proxy's
 * test-mode host mapping (RUNNER_TEST_MODE=1, refused in production).
 *
 * :8443  HTTPS pages, routed by Host header
 * :9099  plain-HTTP sentinel: every request except /count is a hit
 */
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";

const dir = process.env.FX_DIR || "/fx";
const sentinelUrl = process.env.FX_SENTINEL || "http://172.31.0.10:9099";
let hits = 0;

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

const routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void> = {
  "/pricing": (_q, s) => s.end(page("Fixture pricing", `<h1>Plans</h1><p>Pro: $10 per month (fixture)</p><a href="/redirect-ok">Compare</a><button type="button">Toggle yearly</button>`)),
  "/redirect-ok": (_q, s) => s.writeHead(302, { location: "/pricing?from=redirect" }).end(),
  "/redirect-offlist": (_q, s) => s.writeHead(302, { location: "https://other.wallio.test/" }).end(),
  "/redirect-private": (_q, s) => s.writeHead(302, { location: "https://169.254.169.254/latest/meta-data/" }).end(),
  "/captcha": (_q, s) => s.end(page("Just a moment...", `<p>Checking your browser</p><iframe src="https://challenges.cloudflare.com/turnstile/v0/x"></iframe>`)),
  "/login": (_q, s) => s.end(page("Sign in", `<form action="/session" method="post"><input name="login"><input type="password" name="password"><button>Sign in</button></form>`)),
  "/forbidden": (_q, s) => s.writeHead(403, { "content-type": "text/html" }).end(page("Forbidden", "<p>Access denied</p>")),
  "/download": (_q, s) => s.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=payload.exe" }).end("MZ fake binary"),
  "/slow": () => { /* never answers */ },
  "/form": (_q, s) => s.end(page("Trial request", `<form action="/submitted" method="get"><input type="email" name="email" aria-label="Email"><input type="password" name="pw" aria-label="Password"><button type="submit">Send request</button></form>`)),
  "/submitted": (q, s) => s.end(page("Request received", `<p>Request received for ${new URL(q.url!, "https://x").searchParams.get("email")?.replace(/[<>&]/g, "") ?? "?"}</p>`)),
  // Vendor-style signup for the prepare-then-confirm flow. "Continue" is a JS button, not a native submit.
  "/plans": (_q, s) => s.end(page("Plans", `<h1>Plans</h1><p>Pro: $10 per month (fixture)</p><a href="/signup?plan=pro">Choose Pro</a>`)),
  "/signup": (_q, s) => s.end(page("Create your account", `<h1>Create your account</h1><form id="f" onsubmit="return false">
<label for="email">Work email</label><input id="email" type="email" name="email" required>
<label for="fullname">Full name</label><input id="fullname" name="fullname" autocomplete="name" required>
<label for="company">Company</label><input id="company" name="company">
<label for="billing">Billing period</label><select id="billing" name="billing"><option value="monthly">Monthly</option><option value="yearly">Yearly (save 20%)</option></select>
<label for="seats">Seats</label><input id="seats" type="number" name="seats" value="1">
<label><input type="checkbox" id="tos" name="tos" required> I agree to the Terms of Service</label>
<button type="button" id="continue">Continue</button></form>
<script>document.getElementById('continue').onclick=()=>{const p=new URLSearchParams(location.search);location.href='/signup/password?plan='+(p.get('plan')||'pro')+'&billing='+document.getElementById('billing').value}</script>`)),
  "/signup/password": (_q, s) => s.end(page("Choose a password", `<form><label for="pw">Choose a password</label><input id="pw" type="password"><button>Create account</button></form>`)),
  // A step with no <form>: once the job has typed something, any button needs approval.
  "/spa": (_q, s) => s.end(page("Profile", `<div><label for="q">Your name</label><input id="q"></div><button type="button" id="next" onclick="document.getElementById('out').textContent='Next clicked'">Next</button><p id="out"></p>`)),
  "/checkout": (_q, s) => s.end(page("Checkout", `<h1>Checkout</h1><label for="cc">Card number</label><input id="cc" autocomplete="cc-number"><iframe src="https://js.stripe.com/v3/elements-inner-card.html" width="300" height="50"></iframe>`)),
  "/checkout-frame": (_q, s) => s.end(page("Pay", `<h1>Pay for Pro</h1><iframe src="https://js.stripe.com/v3/elements-inner-card.html" width="400" height="60"></iframe>`)),
  "/pricing-with-stripe": (_q, s) => s.end(page("Pricing", `<h1>Plans</h1><p>Pro: $10 per month (fixture)</p><iframe src="https://js.stripe.com/v3/m-outer.html" width="0" height="0" style="border:0"></iframe>`)),
  "/verify-email": (_q, s) => s.end(page("Check your email", `<h1>Check your email</h1><p>We sent a link to dev@wallio.example. Click the link in the email to finish creating your account.</p>`)),
  "/eval": (_q, s) => s.end(page("Owned evaluation", `<button type="button" id="run">Run test</button><p data-testid="eval-result" id="r" aria-live="polite">Not run</p><script>const r=document.getElementById('r');document.getElementById('run').onclick=()=>{r.textContent='Running';r.setAttribute('aria-busy','true');setTimeout(()=>{r.textContent='Result: PASS (1/1 assertions)';r.setAttribute('aria-busy','false')},3000)}</script>`)),
};

https
  .createServer({ key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) }, (req, res) => {
    const host = (req.headers.host ?? "").split(":")[0];
    const path = (req.url ?? "/").split("?")[0]!;
    if (host === "hostile.wallio.test") {
      if (path === "/config.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(`window.WALLIO_SENTINEL = ${JSON.stringify(sentinelUrl)};`);
      return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(`${dir}/hostile/index.html`));
    }
    const route = routes[path];
    if (route) {
      if (!res.hasHeader("content-type")) res.setHeader("content-type", "text/html");
      return route(req, res);
    }
    res.writeHead(404).end("not found");
  })
  .listen(8443, "0.0.0.0");

http
  .createServer((req, res) => {
    if (req.url === "/count") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ hits }));
    hits++;
    res.end("hit");
  })
  .listen(9099, "0.0.0.0");

console.log("fixtures ready");
