/**
 * Containment sentinel (PRD §14). Runs on the CONTROL VM's private IP. The
 * hostile fixture tries to reach it; the count must stay at 0.
 *
 *   GET  /ping    reachability check, NOT counted (proves the private route exists)
 *   GET  /count   { hits, last[] }
 *   POST /reset   clears the count (needs SENTINEL_RESET_TOKEN)
 *   anything else counts as a hit
 *
 *   SENTINEL_HOST=10.1.96.3 SENTINEL_PORT=9099 SENTINEL_RESET_TOKEN=... node sentinel/sentinel.ts
 */
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

const host = process.env.SENTINEL_HOST || "127.0.0.1";
const port = Number(process.env.SENTINEL_PORT) || 9099;
const resetToken = process.env.SENTINEL_RESET_TOKEN || "";
let hits = 0;
const last: Array<{ at: string; method: string; path: string; from: string }> = [];
const sha = (s: string) => createHash("sha256").update(s).digest();

http
  .createServer((req, res) => {
    const json = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/ping") return json(200, { ok: true, counted: false });
    if (req.method === "GET" && path === "/count") return json(200, { hits, last });
    if (req.method === "POST" && path === "/reset") {
      const given = /^Bearer\s+(.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
      if (!resetToken || !timingSafeEqual(sha(given), sha(resetToken))) return json(401, { error: "unauthorized" });
      hits = 0;
      last.length = 0;
      return json(200, { hits });
    }
    hits++;
    last.unshift({ at: new Date().toISOString(), method: req.method ?? "?", path: (req.url ?? "").slice(0, 200), from: req.socket.remoteAddress ?? "?" });
    last.length = Math.min(last.length, 20);
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "SENTINEL HIT: containment failed", method: req.method, path }));
    json(200, { hit: true });
  })
  .listen(port, host, () => console.log(JSON.stringify({ msg: "sentinel listening", host, port })));
