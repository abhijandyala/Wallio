/**
 * wallio-egress: the only way out of the jobs network (PRD §14 "enforcing egress proxy").
 * Runs in its own container, attached to the internal jobs network and to an
 * outbound network. Node built-ins only.
 *
 *  :3128  proxy for job containers (only accepted on the jobs-network address)
 *  :3129  control API for the daemon (bearer token; refused on the jobs-network address)
 *
 * Every job authenticates with its own proxy credential, so denials are
 * recorded per job and one job's allowlist never applies to another.
 */
import http from "node:http";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { checkResolved, checkTarget, normalizeHost, type DenyReason } from "./ip-policy.ts";

const JOBS_IP = required("PROXY_JOBS_IP");
const CONTROL_TOKEN = required("PROXY_CONTROL_TOKEN");
const TEST_HOSTS: Record<string, string> = process.env.PROXY_TEST_MODE === "1" ? JSON.parse(process.env.PROXY_TEST_HOSTS || "{}") : {};
const MAX_DENIALS = 500;
/** "0.0.0.0" in the container; tests use "::" so jobs-side and control-side can be told apart on one host. */
const LISTEN = process.env.PROXY_LISTEN_HOST || "0.0.0.0";

interface Denial { url: string; reason: DenyReason; at: string }
interface Job {
  jobId: string;
  passHash: Buffer;
  allowed: Set<string>;
  byteCap: number;
  bytes: number;
  denials: Denial[];
  /** url|reason already recorded: repeats (e.g. 150 assets from one host) are counted, not listed. */
  seen: Map<string, number>;
  dropped: number;
  conns: Set<net.Socket>;
}
const jobs = new Map<string, Job>();

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(JSON.stringify({ level: "fatal", msg: `${name} is not set` }));
    process.exit(1);
  }
  return v;
}

const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...o }));
const sha = (s: string) => createHash("sha256").update(s).digest();
const local = (s: net.Socket) => (s.localAddress ?? "").replace(/^::ffff:/, "");

function deny(job: Job, url: string, reason: DenyReason) {
  const key = `${url}|${reason}`;
  const n = job.seen.get(key);
  job.seen.set(key, (n ?? 0) + 1);
  if (n !== undefined) return;
  if (job.denials.length < MAX_DENIALS) job.denials.push({ url: url.slice(0, 500), reason, at: new Date().toISOString() });
  else job.dropped++;
  log({ level: "warn", msg: "egress denied", jobId: job.jobId, host: safeHost(url), reason });
}

const safeHost = (u: string) => { try { return new URL(u).host; } catch { return "?"; } };

function authJob(header: string | undefined): Job | null {
  const m = /^Basic\s+(.+)$/i.exec(header ?? "");
  if (!m) return null;
  const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 1) return null;
  const job = jobs.get(decoded.slice(0, i));
  if (!job) return null;
  return timingSafeEqual(sha(decoded.slice(i + 1)), job.passHash) ? job : null;
}

function parseAuthority(a: string): { host: string; port: number } | null {
  const m = /^\[([^\]]+)\]:(\d{1,5})$/.exec(a) ?? /^([^:]+):(\d{1,5})$/.exec(a);
  if (!m) return null;
  return { host: normalizeHost(m[1]!), port: Number(m[2]) };
}

const NEED_AUTH = 'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="wallio"\r\nContent-Length: 0\r\n\r\n';
const refuse = (reason: DenyReason) => `HTTP/1.1 403 Forbidden\r\nX-Wallio-Denied: ${reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;

// ───────────── proxy (jobs network only) ─────────────

const proxy = http.createServer((req, res) => {
  // Plain-HTTP proxying (absolute-URI GET etc.) is never allowed.
  if (local(req.socket) !== JOBS_IP) return void req.socket.destroy();
  const job = authJob(req.headers["proxy-authorization"]);
  if (!job) {
    res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="wallio"', "Content-Length": "0" }).end();
    return;
  }
  deny(job, req.url ?? "http://?/", "non_https");
  res.writeHead(403, { "X-Wallio-Denied": "non_https", "Content-Length": "0", Connection: "close" }).end();
});

proxy.on("connect", async (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
  client.on("error", () => {});
  if (local(client) !== JOBS_IP) return void client.destroy();
  const job = authJob(req.headers["proxy-authorization"]);
  if (!job) return void client.end(NEED_AUTH);

  const target = parseAuthority(req.url ?? "");
  if (!target) {
    deny(job, `https://${req.url}/`, "host_not_allowed");
    return void client.end(refuse("host_not_allowed"));
  }
  const url = `https://${target.host.includes(":") ? `[${target.host}]` : target.host}${target.port === 443 ? "" : `:${target.port}`}/`;
  let reason = checkTarget(target.host, target.port, job.allowed);
  let addresses: string[] = [];
  let connectPort = target.port;
  if (!reason) {
    // Test mode only: fixture hostnames map to "ip" or "ip:port" of a local fixture server.
    const mapped = TEST_HOSTS[target.host];
    if (mapped) {
      const [ip, p] = mapped.split(/:(?=\d+$)/);
      addresses = [ip!];
      if (p) connectPort = Number(p);
    }
    else {
      try {
        addresses = (await lookup(target.host, { all: true, verbatim: true })).map((a) => a.address);
        reason = checkResolved(addresses);
      } catch {
        reason = "dns_failed";
      }
    }
  }
  if (!reason && job.bytes >= job.byteCap) reason = "byte_cap";
  if (reason) {
    deny(job, url, reason);
    return void client.end(refuse(reason));
  }

  // Connect to the address we checked, not the name, so DNS can't change underneath us.
  const upstream = net.connect({ host: addresses[0]!, port: connectPort, timeout: 10_000 });
  job.conns.add(client);
  const close = () => { job.conns.delete(client); client.destroy(); upstream.destroy(); };
  upstream.once("connect", () => {
    upstream.setTimeout(0);
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) upstream.write(head);
    upstream.on("data", (chunk: Buffer) => {
      job.bytes += chunk.length;
      if (job.bytes > job.byteCap) {
        deny(job, url, "byte_cap");
        return close();
      }
      if (!client.write(chunk)) upstream.pause();
    });
    client.on("drain", () => upstream.resume());
    client.pipe(upstream);
  });
  upstream.once("timeout", () => { client.end("HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\n\r\n"); close(); });
  upstream.once("error", () => { if (!client.destroyed) client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n"); close(); });
  upstream.once("close", close);
  client.once("close", close);
});

// ───────────── control API (daemon only) ─────────────

const controlHash = sha(CONTROL_TOKEN);
const control = http.createServer(async (req, res) => {
  const json = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body)); };
  if (local(req.socket) === JOBS_IP) return void req.socket.destroy();
  const token = /^Bearer\s+(.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
  if (!timingSafeEqual(sha(token), controlHash)) return json(401, { error: "unauthorized" });

  const u = new URL(req.url ?? "/", "http://control");
  const m = /^\/jobs\/([A-Za-z0-9_-]{1,64})(\/denials)?$/.exec(u.pathname);
  if (req.method === "GET" && u.pathname === "/healthz") return json(200, { ok: true, jobs: jobs.size });
  if (!m) return json(404, { error: "not_found" });
  const user = m[1]!;

  if (req.method === "PUT" && !m[2]) {
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 32_768) return json(413, { error: "too_large" }); }
    const b = JSON.parse(raw) as { jobId: string; pass: string; allowedHosts: string[]; byteCap: number };
    jobs.set(user, {
      jobId: b.jobId, passHash: sha(b.pass), allowed: new Set(b.allowedHosts.map(normalizeHost)), byteCap: b.byteCap,
      bytes: 0, denials: [], seen: new Map(), dropped: 0, conns: new Set(),
    });
    log({ level: "info", msg: "job registered", jobId: b.jobId, hosts: b.allowedHosts.length });
    return json(200, { ok: true });
  }
  const job = jobs.get(user);
  if (!job) return json(404, { error: "unknown_job" });
  if (req.method === "GET" && m[2]) {
    const since = Math.max(0, Number(u.searchParams.get("since")) || 0);
    return json(200, { denials: job.denials.slice(since), next: job.denials.length, attempts: Object.fromEntries(job.seen), dropped: job.dropped, bytes: job.bytes });
  }
  if (req.method === "DELETE" && !m[2]) {
    for (const s of job.conns) s.destroy();
    jobs.delete(user);
    log({ level: "info", msg: "job removed", jobId: job.jobId, bytes: job.bytes, denials: job.denials.length });
    return json(200, { denials: job.denials, attempts: Object.fromEntries(job.seen), dropped: job.dropped, bytes: job.bytes });
  }
  return json(405, { error: "method_not_allowed" });
});

proxy.listen(Number(process.env.PROXY_PORT) || 3128, LISTEN, () => log({ level: "info", msg: "egress proxy listening", jobsIp: JOBS_IP, testHosts: Object.keys(TEST_HOSTS).length }));
control.listen(Number(process.env.PROXY_CONTROL_PORT) || 3129, LISTEN);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => process.exit(0));
