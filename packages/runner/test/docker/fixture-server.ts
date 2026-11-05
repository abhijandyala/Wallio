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
