/**
 * Runs the real egress proxy as a child process and drives it like Chromium does:
 * CONNECT with Basic proxy auth, then TLS through the tunnel.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import tls from "node:tls";
import https from "node:https";

const PROXY_PORT = 38128, CONTROL_PORT = 38129, FIXTURE_PORT = 38443;
const TOKEN = "control-token-for-tests-0123456789";
let proxy: ChildProcess;
let fixture: https.Server;
let hits = 0;

const control = (method: string, path: string, body?: unknown, host = "[::1]") =>
  fetch(`http://${host}:${CONTROL_PORT}${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

function connect(target: string, auth: string | null): Promise<{ status: number; reason: string | null; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const s = net.connect(PROXY_PORT, "127.0.0.1", () => {
      s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth ? `Proxy-Authorization: Basic ${Buffer.from(auth).toString("base64")}\r\n` : ""}\r\n`);
    });
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString("latin1");
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      s.off("data", onData);
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buf)?.[1]);
      resolve({ status, reason: /X-Wallio-Denied: (\w+)/i.exec(buf)?.[1] ?? null, socket: s });
    };
    s.on("data", onData);
    s.on("error", reject);
  });
}

function getThrough(socket: net.Socket, servername: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket, servername, rejectUnauthorized: false }, () => {
      t.write(`GET /hello HTTP/1.1\r\nHost: ${servername}\r\nConnection: close\r\n\r\n`);
    });
    let out = "";
    t.on("data", (d) => (out += d));
    t.on("end", () => resolve(out));
    t.on("error", reject);
  });
}

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-test-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=fixture.wallio.test"], { stdio: "ignore" });
  fixture = https.createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    hits++;
    res.end(req.url === "/big" ? "x".repeat(300_000) : "hello from fixture");
  });
  await new Promise<void>((r) => fixture.listen(FIXTURE_PORT, "127.0.0.1", r));
  proxy = spawn(process.execPath, ["src/egress/proxy.ts"], {
    env: {
      PATH: process.env.PATH, PROXY_JOBS_IP: "127.0.0.1", PROXY_LISTEN_HOST: "::", PROXY_PORT: String(PROXY_PORT), PROXY_CONTROL_PORT: String(CONTROL_PORT),
      PROXY_CONTROL_TOKEN: TOKEN, PROXY_TEST_MODE: "1", PROXY_TEST_HOSTS: JSON.stringify({ "fixture.wallio.test": `127.0.0.1:${FIXTURE_PORT}` }),
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await control("GET", "/healthz")).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const reg = await control("PUT", "/jobs/juser1", { jobId: "job_1", pass: "p4ss", allowedHosts: ["fixture.wallio.test", "localhost"], byteCap: 200_000 });
  assert.equal(reg.status, 200);
});

after(() => { proxy?.kill(); fixture?.close(); });

test("allowed host: tunnel opens and HTTPS works through it", async () => {
  const r = await connect("fixture.wallio.test:443", "juser1:p4ss");
  assert.equal(r.status, 200);
  assert.match(await getThrough(r.socket, "fixture.wallio.test"), /hello from fixture/);
});

test("no credentials → 407 challenge; wrong password → 407", async () => {
  assert.equal((await connect("fixture.wallio.test:443", null)).status, 407);
  assert.equal((await connect("fixture.wallio.test:443", "juser1:wrong")).status, 407);
  assert.equal((await connect("fixture.wallio.test:443", "nobody:p4ss")).status, 407);
});

test("denies hosts off the list, IP literals, private targets, other ports", async () => {
  const cases: Array<[string, string]> = [
    ["example.com:443", "host_not_allowed"],
    ["169.254.169.254:443", "private_range"],
    ["10.0.0.5:443", "private_range"],
    ["[::1]:443", "private_range"],
    ["1.1.1.1:443", "ip_literal"],
    ["fixture.wallio.test:80", "bad_port"],
  ];
  for (const [target, reason] of cases) {
    const r = await connect(target, "juser1:p4ss");
    assert.equal(r.status, 403, target);
    assert.equal(r.reason, reason, target);
  }
});

test("an allowlisted name that resolves to a private address is denied (rebinding)", async () => {
  const r = await connect("localhost:443", "juser1:p4ss");
  assert.equal(r.status, 403);
  assert.equal(r.reason, "private_range");
});

test("plain HTTP proxying is denied as non_https", async () => {
  const res = await new Promise<{ status: number; reason: string | undefined }>((resolve) => {
    const s = net.connect(PROXY_PORT, "127.0.0.1", () => s.write(`GET http://fixture.wallio.test/ HTTP/1.1\r\nHost: fixture.wallio.test\r\nProxy-Authorization: Basic ${Buffer.from("juser1:p4ss").toString("base64")}\r\n\r\n`));
    s.on("data", (d) => resolve({ status: Number(/HTTP\/1\.1 (\d+)/.exec(d.toString())?.[1]), reason: /x-wallio-denied: (\w+)/i.exec(d.toString())?.[1] }));
  });
  assert.equal(res.status, 403);
  assert.equal(res.reason, "non_https");
});

test("byte cap stops a job that downloads too much", async () => {
  const before = hits;
  const r = await connect("fixture.wallio.test:443", "juser1:p4ss");
  await getThrough(r.socket, "fixture.wallio.test").catch(() => "");
  const big = await connect("fixture.wallio.test:443", "juser1:p4ss");
  const t = tls.connect({ socket: big.socket, servername: "fixture.wallio.test", rejectUnauthorized: false }, () => t.write("GET /big HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
  t.resume();
  await new Promise((r) => { t.on("close", r); t.on("error", r); });
  assert.ok(hits > before);
  const after = await connect("fixture.wallio.test:443", "juser1:p4ss");
  assert.equal(after.reason, "byte_cap");
});

test("denials are recorded per job and paged with ?since", async () => {
  const all = await (await control("GET", "/jobs/juser1/denials?since=0")).json();
  assert.ok(all.denials.length >= 8);
  assert.ok(all.denials.every((d: any) => d.url && d.reason && d.at));
  const tail = await (await control("GET", `/jobs/juser1/denials?since=${all.next}`)).json();
  assert.equal(tail.denials.length, 0);
});

test("control API: wrong token refused; not reachable on the jobs-side address", async () => {
  const bad = await fetch(`http://[::1]:${CONTROL_PORT}/healthz`, { headers: { authorization: "Bearer nope" } });
  assert.equal(bad.status, 401);
  await assert.rejects(control("GET", "/healthz", undefined, "127.0.0.1"));
});

test("unregistering closes the job: its credential stops working", async () => {
  const del = await control("DELETE", "/jobs/juser1");
  assert.equal(del.status, 200);
  assert.equal((await connect("fixture.wallio.test:443", "juser1:p4ss")).status, 407);
});
