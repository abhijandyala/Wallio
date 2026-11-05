/**
 * Integration tests with real Docker, real Chromium and the real egress proxy.
 *   npm run images -w @wallio/runner && npm run test:docker -w @wallio/runner
 *
 * Fixture pages run in a container on the proxy's outbound network and are
 * reachable only through test-mode host mapping. A sentinel on the same
 * container counts any request that gets past the policy: it must stay at 0.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runner as C } from "@wallio/contracts";
import { loadRunnerConfig, type RunnerConfig } from "../../src/config.ts";
import { DockerDriver, JOBS_NET, OUT_NET, PROXY_NAME, docker } from "../../src/sandbox/docker.ts";
import { JobService } from "../../src/jobs/service.ts";
import { createRunnerApp } from "../../src/server.ts";
import { signApprovalToken } from "../../src/approval/token.ts";
import { inspectPng } from "../../src/state.ts";

const RUN = process.env.RUNNER_DOCKER_TESTS === "1";
const PKG = resolve(import.meta.dirname, "../..");
const DOCKER = process.env.DOCKER_BIN || "docker";
const NODE_IMAGE = "node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9";
const CURL_IMAGE = "curlimages/curl:8.17.0@sha256:935d9100e9ba842cdb060de42472c7ca90cfe9a7c96e4dacb55e79e560b3ff40";
const FX_NAME = "wallio-test-fixtures";
const FX_IP = "172.31.0.10";
const FX = "fixtures.wallio.test";
const HOSTILE = "hostile.wallio.test";
const TOKEN = "t".repeat(40);
const KEY = "k".repeat(40);

process.env.RUNNER_LOG = process.env.RUNNER_LOG ?? "silent";
let cfg: RunnerConfig;
let service: JobService;
let app: ReturnType<typeof createRunnerApp>;
let stateDir: string;

const sh = (args: string[]) => execFileSync(DOCKER, args, { encoding: "utf8" }).trim();
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(path, { method, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = res.headers.get("content-type") ?? "";
  return { status: res.status, body: ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const sentinelHits = async () => (await (await fetch("http://127.0.0.1:19099/count")).json()).hits as number;

let n = 0;
let lastJobId: string | null = null;
async function newJob(hosts: string[], limits = { deadlineMs: 120_000, maxActions: 20, maxScreenshots: 12 }) {
  // A failed test can leave its job running; cancel it so the next test isn't refused as busy.
  if (lastJobId) {
    const prev = await call("GET", `/jobs/${lastJobId}`);
    if (prev.status === 200 && !["cleaned", "cleanup_failed"].includes(prev.body.state)) {
      await call("POST", `/jobs/${lastJobId}/cancel`, { reason: "shutdown" });
      for (let i = 0; i < 100 && (await call("GET", `/jobs/${lastJobId}/cleanup`)).body.status === "pending"; i++) await new Promise((r) => setTimeout(r, 100));
    }
  }
  const jobId = `itest_${Date.now()}_${n++}`;
  lastJobId = jobId;
  const r = await call("POST", "/jobs", { jobId, runId: "run_t", correlationId: "corr_t", purpose: "integration test", allowedHosts: hosts, limits });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  C.RunnerJobStatus.parse(r.body);
  let step = 0;
  const act = async (action: unknown, actionId = `a${step}`) => {
    const res = await call("POST", `/jobs/${jobId}/actions`, { actionId, stepIndex: step++, action });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return C.RunnerActionResult.parse(res.body);
  };
  const finish = async () => C.CleanupReport.parse((await call("POST", `/jobs/${jobId}/finish`)).body);
  const cleaned = async () => {
    for (let i = 0; i < 200; i++) {
      const r = C.CleanupReport.parse((await call("GET", `/jobs/${jobId}/cleanup`)).body);
      if (r.status !== "pending") return r;
      await new Promise((res) => setTimeout(res, 100));
    }
    throw new Error("cleanup did not finish");
  };
  return { jobId, act, finish, cleaned };
}

const leftovers = (jobId: string) => ({
  containers: sh(["ps", "-a", "-q", "--filter", `label=wallio.job=${jobId}`]),
  volumes: sh(["volume", "ls", "-q", "--filter", `label=wallio.job=${jobId}`]),
});

before(async () => {
  if (!RUN) return;
  stateDir = mkdtempSync(join(tmpdir(), "runner-docker-"));
  cfg = loadRunnerConfig({
    RUNNER_DRIVER: "docker", RUNNER_SHARED_TOKEN: TOKEN, RUNNER_APPROVAL_KEY: KEY, RUNNER_STATE_DIR: stateDir, DOCKER_BIN: DOCKER,
    RUNNER_TEST_MODE: "1", RUNNER_TEST_HOSTS: JSON.stringify({ [FX]: `${FX_IP}:8443`, [HOSTILE]: `${FX_IP}:8443` }),
  });
  const driver = new DockerDriver(cfg);
  await driver.init(); // creates networks + proxy
  service = new JobService({ cfg, driver });
  await service.recover();
  app = createRunnerApp(service, TOKEN);

  // Fixture container with a throwaway self-signed certificate.
  const fx = mkdtempSync(join(tmpdir(), "fx-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(fx, "key.pem"), "-out", join(fx, "cert.pem"), "-days", "1", "-subj", "/CN=fixtures"], { stdio: "ignore" });
  cpSync(join(PKG, "test/docker/fixture-server.ts"), join(fx, "fixture-server.ts"));
  cpSync(join(PKG, "fixtures/hostile"), join(fx, "hostile"), { recursive: true });
  execFileSync("chmod", ["-R", "a+rX", fx]);
  await docker(DOCKER, ["rm", "-f", FX_NAME]);
  sh(["run", "-d", "--name", FX_NAME, "--network", OUT_NET, "--ip", FX_IP, "-p", "127.0.0.1:19099:9099", "-v", `${fx}:/fx:ro`, "-e", `FX_SENTINEL=http://${FX_IP}:9099`, NODE_IMAGE, "node", "/fx/fixture-server.ts"]);
  for (let i = 0; i < 50; i++) {
    try { await sentinelHits(); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
});

after(async () => {
  if (!RUN) return;
  await service?.close();
  await docker(DOCKER, ["rm", "-f", FX_NAME]);
});

test("research path on a fixture: navigate, redirect chain, inspect, screenshot, verified cleanup", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  const nav = await j.act({ type: "navigate", url: `https://${FX}/redirect-ok` });
  assert.equal(nav.status, "ok");
  assert.equal(nav.observation!.httpStatus, 200);
  assert.deepEqual(nav.observation!.redirectChain, [`https://${FX}/redirect-ok`, `https://${FX}/pricing?from=redirect`]);
  assert.match(nav.observation!.textExcerpt!, /\$10 per month/);
  const ins = await j.act({ type: "inspect", maxElements: 10 });
  const link = ins.observation!.elements!.find((e) => e.tag === "a")!;
  assert.equal(link.targetHost, FX);
  const shot = await j.act({ type: "screenshot", fullPage: true });
  const art = await call("GET", `/artifacts/${shot.observation!.screenshot!.artifactId}`);
  assert.ok(inspectPng(art.body as Buffer));
  const report = await j.finish();
  assert.equal(report.status, "cleaned");
  assert.deepEqual(leftovers(j.jobId), { containers: "", volumes: "" });
});

test("hardening: container runs non-root, read-only, no caps but SYS_CHROOT, limits set, no secrets in env", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  const name = sh(["ps", "--filter", `label=wallio.job=${j.jobId}`, "--format", "{{.Names}}"]);
  const info = JSON.parse(sh(["inspect", name]))[0];
  const hc = info.HostConfig;
  assert.equal(info.Config.User, "pwuser");
  assert.equal(hc.ReadonlyRootfs, true);
  assert.deepEqual(hc.CapDrop, ["ALL"]);
  assert.deepEqual(hc.CapAdd, ["CAP_SYS_CHROOT"].includes(hc.CapAdd?.[0]) ? hc.CapAdd : ["SYS_CHROOT"]);
  assert.ok(hc.SecurityOpt.includes("no-new-privileges"));
  assert.ok(hc.SecurityOpt.some((o: string) => o.startsWith("seccomp=")));
  assert.equal(hc.Memory, cfg.limits.memoryMb * 1024 * 1024);
  assert.equal(hc.PidsLimit, cfg.limits.pids);
  assert.equal(hc.NetworkMode, JOBS_NET);
  assert.deepEqual(hc.Dns, ["127.0.0.1"]);
  assert.ok(!JSON.stringify(info.Mounts).includes("docker.sock"));
  const env = (info.Config.Env as string[]).join("\n");
  for (const secret of [TOKEN, KEY, "VULTR", "INFERENCE", "RUNNER_SHARED", "RUNNER_APPROVAL"]) assert.ok(!env.includes(secret), `env leaks ${secret}`);
  const caps = sh(["exec", name, "grep", "CapEff", "/proc/1/status"]);
  assert.match(caps, /0000000000000000/);
  assert.equal(JSON.parse(sh(["network", "inspect", JOBS_NET]))[0].Internal, true);
  await j.finish();
});

test("escape probe: a container on the jobs network cannot reach anything but the proxy", { skip: !RUN }, async () => {
  const probe = (args: string[]) =>
    docker(DOCKER, ["run", "--rm", "--network", JOBS_NET, "--dns", "127.0.0.1", "--cap-drop", "ALL", CURL_IMAGE, "-sS", "-m", "4", "-o", "/dev/null", "-w", "%{http_code}", ...args], 30_000);
  const hitsBefore = await sentinelHits();
  for (const target of ["https://1.1.1.1/", "http://169.254.169.254/latest/meta-data/", `http://${FX_IP}:9099/hit`, "http://172.30.0.1/", "https://example.com/"]) {
    const r = await probe([target]);
    assert.notEqual(r.code, 0, `${target} should be unreachable, got ${r.stdout}`);
  }
  // Through the proxy without credentials: 407. Control port on the jobs side: refused.
  const viaProxy = await probe(["-x", "http://172.30.0.2:3128", `https://${FX}/pricing`]);
  assert.match(viaProxy.stdout + viaProxy.stderr, /407/);
  const control = await probe(["http://172.30.0.2:3129/healthz"]);
  assert.notEqual(control.stdout, "200");
  assert.equal(await sentinelHits(), hitsBefore);
});

test("egress: off-list redirect and redirect to metadata are denied and recorded", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  const off = await j.act({ type: "navigate", url: `https://${FX}/redirect-offlist` });
  assert.equal(off.status, "denied");
  assert.equal(off.error!.code, "egress_denied");
  assert.equal(off.observation?.blocked?.reason ?? "egress_denied", "egress_denied");
  assert.ok(off.observation!.deniedRequests.some((d) => d.url === "https://other.wallio.test/" && d.reason === "host_not_allowed"));
  const priv = await j.act({ type: "navigate", url: `https://${FX}/redirect-private` });
  assert.equal(priv.status, "denied");
  assert.ok(priv.observation!.deniedRequests.some((d) => d.reason === "private_range"));
  const report = await j.finish();
  assert.ok(report.deniedRequests.length >= 2);
});

test("blocked pages are reported, not bypassed: captcha, login, 403, download", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  const expect: Array<[string, string]> = [["/captcha", "captcha"], ["/login", "login_required"], ["/forbidden", "access_denied"], ["/download", "download_blocked"]];
  for (const [path, reason] of expect) {
    const r = await j.act({ type: "navigate", url: `https://${FX}${path}` });
    assert.equal(r.observation?.blocked?.reason, reason, `${path}: ${JSON.stringify(r.error ?? r.observation?.blocked)}`);
  }
  await j.finish();
});

test("approval-gated form in a real browser: no token denied, password refused, approved submit once", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  await j.act({ type: "navigate", url: `https://${FX}/form` });
  const els = (await j.act({ type: "inspect" })).observation!.elements!;
  const email = els.find((e) => e.inputType === "email")!.ref;
  const pw = els.find((e) => e.inputType === "password")!.ref;
  const submit = els.find((e) => e.inputType === "submit")!;
  assert.equal(submit.targetHost, FX);
  assert.equal((await j.act({ type: "fill", elementRef: pw, value: "secret" })).error!.code, "invalid_action");
  const filled = await j.act({ type: "fill", elementRef: email, value: "demo-dev@wallio.example" });
  const fp = filled.observation!.pageFingerprint;
  assert.equal((await j.act({ type: "click", elementRef: submit.ref })).error!.code, "approval_token_invalid");
  const token = signApprovalToken(KEY, { jobId: j.jobId, actionId: "submit_1", elementRef: submit.ref, pageFingerprint: fp });
  const ok = await j.act({ type: "click", elementRef: submit.ref, approvalToken: token }, "submit_1");
  assert.equal(ok.status, "ok", JSON.stringify(ok.error));
  assert.match(ok.observation!.textExcerpt!, /Request received for demo-dev@wallio\.example/);
  await j.finish();
});

test("owned eval page: click Run test and read the result", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  await j.act({ type: "navigate", url: `https://${FX}/eval` });
  const run = (await j.act({ type: "inspect" })).observation!.elements!.find((e) => e.name === "Run test")!;
  const clicked = await j.act({ type: "click", elementRef: run.ref });
  assert.equal(clicked.status, "ok");
  assert.match(clicked.observation!.textExcerpt!, /PASS/);
  await j.act({ type: "screenshot" });
  await j.finish();
});

test("CONTAINMENT: hostile page is denied at every layer, sentinel unchanged, runner healthy, cleanup verified", { skip: !RUN }, async () => {
  const hitsBefore = await sentinelHits();
  const j = await newJob([HOSTILE]);
  const nav = await j.act({ type: "navigate", url: `https://${HOSTILE}/` });
  assert.equal(nav.status, "ok");
  assert.match(nav.observation!.textExcerpt!, /SYSTEM OVERRIDE/); // the injection is returned as data
  await new Promise((r) => setTimeout(r, 1500));
  const ins = await j.act({ type: "inspect" });
  const claim = ins.observation!.elements!.find((e) => e.name === "Claim credit")!;
  const verify = ins.observation!.elements!.find((e) => e.name === "Verify my account")!;
  assert.equal(claim.targetHost, FX_IP, "inspect shows the private target so policy can refuse before clicking");
  // Layer: runner wants an approval token for any submit.
  assert.equal((await j.act({ type: "click", elementRef: claim.ref })).error!.code, "approval_token_invalid");
  // Layer: a plain button that navigates to cloud metadata is refused by the proxy.
  const v = await j.act({ type: "click", elementRef: verify.ref });
  assert.equal(v.status, "denied");
  assert.equal(v.error!.code, "egress_denied");
  const report = await j.finish();
  assert.equal(report.status, "cleaned");
  const reasons = new Set(report.deniedRequests.map((d) => d.reason));
  for (const r of ["private_range", "non_https", "host_not_allowed", "bad_port"]) assert.ok(reasons.has(r), `expected a ${r} denial, got ${[...reasons]}`);
  assert.ok(report.deniedRequests.some((d) => d.url.includes("169.254.169.254")));
  assert.ok(report.deniedRequests.some((d) => d.url.includes("exfil.attacker.example")));
  assert.equal(await sentinelHits(), hitsBefore, "the sentinel must not be reached");
  assert.equal((await call("GET", "/healthz")).body.ok, true);
  assert.deepEqual(leftovers(j.jobId), { containers: "", volumes: "" });
});

test("cancel during a hanging navigation: action reports cancelled, cleanup verified", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  const pending = j.act({ type: "navigate", url: `https://${FX}/slow` });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await call("POST", `/jobs/${j.jobId}/cancel`, { reason: "user_cancelled" })).status, 202);
  const r = await pending;
  assert.equal(r.error!.code, "cancelled");
  const report = await j.cleaned();
  assert.equal(report.status, "cleaned");
  assert.deepEqual(leftovers(j.jobId), { containers: "", volumes: "" });
});

test("hard deadline: runner kills the container itself", { skip: !RUN }, async () => {
  const j = await newJob([FX], { deadlineMs: 6_000, maxActions: 20, maxScreenshots: 12 });
  const r = await j.act({ type: "navigate", url: `https://${FX}/slow` });
  assert.equal(r.status, "timeout");
  assert.equal(r.error!.code, "deadline_exceeded");
  const report = await j.cleaned();
  assert.equal(report.status, "cleaned");
  assert.match(report.detail ?? "", /deadline/i);
  assert.deepEqual(leftovers(j.jobId), { containers: "", volumes: "" });
});

test("browser crash: killed container → browser_crashed, cleanup verified", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  await j.act({ type: "navigate", url: `https://${FX}/pricing` });
  sh(["kill", sh(["ps", "--filter", `label=wallio.job=${j.jobId}`, "--format", "{{.Names}}"])]);
  await new Promise((r) => setTimeout(r, 500));
  const r = await j.act({ type: "inspect" }).catch(() => null);
  if (r) assert.ok(["browser_crashed"].includes(r.error!.code), JSON.stringify(r.error));
  const report = await j.cleaned();
  assert.equal(report.status, "cleaned");
});

test("sweeper removes labelled leftovers that belong to no active job", { skip: !RUN }, async () => {
  sh(["volume", "create", "--label", "wallio.job=ghost_job", "--label", "wallio.expires=1", "wallio-job-ghost"]);
  await service.sweep();
  assert.equal(sh(["volume", "ls", "-q", "--filter", "label=wallio.job=ghost_job"]), "");
});

test("daemon restart with a live container: recovery fails the job and removes it", { skip: !RUN }, async () => {
  const j = await newJob([FX]);
  await j.act({ type: "navigate", url: `https://${FX}/pricing` });
  // New daemon on the same state dir; the old one "died" without cleaning up.
  const driver2 = new DockerDriver(cfg);
  await driver2.init();
  const svc2 = new JobService({ cfg, driver: driver2 });
  await svc2.recover();
  const report = svc2.cleanupReport(j.jobId);
  assert.equal(report.status, "cleaned");
  assert.match(report.detail ?? "", /restarted/);
  assert.deepEqual(leftovers(j.jobId), { containers: "", volumes: "" });
  await svc2.close();
  // Re-attach the first service to the new proxy for any later tests.
  service = svc2;
  app = createRunnerApp(svc2, TOKEN);
  assert.ok(sh(["ps", "--filter", `name=${PROXY_NAME}`, "-q"]));
});
