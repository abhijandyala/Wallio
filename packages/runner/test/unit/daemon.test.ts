/**
 * Daemon behaviour through its HTTP API, using the fake driver (no Docker).
 * Every response is checked against @wallio/contracts.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runner as C } from "@wallio/contracts";
import { loadRunnerConfig, type RunnerConfig } from "../../src/config.ts";
import { FakeDriver } from "../../src/drivers/fake.ts";
import { JobService } from "../../src/jobs/service.ts";
import { createRunnerApp } from "../../src/server.ts";
import { signApprovalToken } from "../../src/approval/token.ts";
import { inspectPng } from "../../src/state.ts";

process.env.RUNNER_LOG = "silent";
const TOKEN = "t".repeat(40);
const KEY = "a".repeat(40);

let cfg: RunnerConfig;
let service: JobService;
let app: ReturnType<typeof createRunnerApp>;

function boot(stateDir?: string) {
  cfg = loadRunnerConfig({ RUNNER_DRIVER: "fake", RUNNER_SHARED_TOKEN: TOKEN, RUNNER_APPROVAL_KEY: KEY, RUNNER_STATE_DIR: stateDir ?? mkdtempSync(join(tmpdir(), "runner-")) });
  service = new JobService({ cfg, driver: new FakeDriver() });
  app = createRunnerApp(service, TOKEN);
}

const call = async (method: string, path: string, body?: unknown, token = TOKEN) => {
  const res = await app.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = res.headers.get("content-type") ?? "";
  return { status: res.status, body: ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()), headers: res.headers };
};

const job = (over: Partial<C.RunnerJobCreate> = {}): C.RunnerJobCreate => ({
  jobId: `job_${Math.random().toString(36).slice(2, 8)}`, runId: "run_1", correlationId: "corr_1", purpose: "test",
  allowedHosts: ["github.com", "zed.dev", "forms.wallio.example", "hostile.wallio.example"],
  limits: { deadlineMs: 60_000, maxActions: 20, maxScreenshots: 12 }, ...over,
});

let step = 0;
const act = async (jobId: string, action: unknown, actionId = `act_${step}`) => {
  const r = await call("POST", `/jobs/${jobId}/actions`, { actionId, stepIndex: step++, action });
  if (r.status === 200) C.RunnerActionResult.parse(r.body);
  return r;
};

const waitCleaned = async (jobId: string) => {
  for (let i = 0; i < 100; i++) {
    const r = await call("GET", `/jobs/${jobId}/cleanup`);
    if (r.body.status !== "pending") return C.CleanupReport.parse(r.body);
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error("cleanup never finished");
};

beforeEach(() => { step = 0; boot(); });
afterEach(async () => { await service.close(); });

test("auth: missing or wrong token is refused with RunnerHttpError", async () => {
  for (const t of ["", "wrong"]) {
    const r = await call("GET", "/healthz", undefined, t);
    assert.equal(r.status, 401);
    C.RunnerHttpError.parse(r.body);
  }
  assert.equal((await call("GET", "/healthz")).status, 200);
});

test("malformed bodies are 400 bad_request; oversized bodies are 413", async () => {
  const bad = await call("POST", "/jobs", { jobId: "x" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "bad_request");
  const huge = await call("POST", "/jobs", { ...job(), purpose: "x".repeat(70_000) });
  assert.equal(huge.status, 413);
  const http = await call("POST", "/jobs", job({ allowedHosts: ["http://github.com"] }));
  assert.equal(http.status, 400);
  const weirdId = await call("POST", "/jobs", job({ jobId: "job/../x y" }));
  assert.equal(weirdId.status, 400);
});

test("research happy path: create → navigate → inspect → screenshot → finish → cleaned", async () => {
  const spec = job();
  const created = await call("POST", "/jobs", spec);
  assert.equal(created.status, 201);
  C.RunnerJobStatus.parse(created.body);
  assert.equal(created.body.state, "ready");

  const nav = await act(spec.jobId, { type: "navigate", url: "https://github.com/features/copilot/plans" });
  assert.equal(nav.body.status, "ok");
  assert.match(nav.body.observation.textExcerpt, /fake driver/);
  assert.match(nav.body.observation.textSha256, /^sha256:[a-f0-9]{64}$/);

  const ins = await act(spec.jobId, { type: "inspect" });
  assert.ok(ins.body.observation.elements.length >= 1);
  assert.equal("submits" in ins.body.observation.elements[0], false, "internal fields must not leak");

  const shot = await act(spec.jobId, { type: "screenshot", fullPage: false });
  const meta = shot.body.observation.screenshot;
  assert.equal(meta.mimeType, "image/png");
  const png = await call("GET", `/artifacts/${meta.artifactId}`);
  assert.equal(png.status, 200);
  assert.equal(png.headers.get("content-type"), "image/png");
  assert.deepEqual(inspectPng(png.body as Buffer), { width: meta.width, height: meta.height });

  assert.equal((await act(spec.jobId, { type: "finish" })).body.status, "ok");
  const fin = await call("POST", `/jobs/${spec.jobId}/finish`);
  const report = C.CleanupReport.parse(fin.body);
  assert.equal(report.status, "cleaned");
  assert.equal(report.actionsExecuted, 4);
  assert.equal(report.screenshotsTaken, 1);
  assert.equal((await call("GET", `/jobs/${spec.jobId}`)).body.state, "cleaned");
  // A finished job takes no more actions.
  assert.equal((await act(spec.jobId, { type: "inspect" })).status, 409);
});

test("actionId is idempotent; reuse with a different action is refused", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  const first = await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "a1", stepIndex: 0, action: { type: "navigate", url: "https://zed.dev/pricing" } });
  const again = await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "a1", stepIndex: 0, action: { type: "navigate", url: "https://zed.dev/pricing" } });
  assert.deepEqual(again.body, first.body);
  assert.equal((await call("GET", `/jobs/${spec.jobId}`)).body.actionsUsed, 1, "replay must not re-execute");
  const clash = await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "a1", stepIndex: 0, action: { type: "inspect" } });
  assert.equal(clash.status, 409);
});

test("concurrent duplicate actionIds execute once", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  const body = { actionId: "dup", stepIndex: 0, action: { type: "navigate", url: "https://zed.dev/pricing" } };
  const [a, b] = await Promise.all([call("POST", `/jobs/${spec.jobId}/actions`, body), call("POST", `/jobs/${spec.jobId}/actions`, body)]);
  assert.deepEqual(a.body, b.body);
  assert.equal((await call("GET", `/jobs/${spec.jobId}`)).body.actionsUsed, 1);
});

test("navigate off the allowlist is denied by the runner and recorded", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  const r = await act(spec.jobId, { type: "navigate", url: "https://evil.example/steal" });
  assert.equal(r.body.status, "denied");
  assert.equal(r.body.error.code, "egress_denied");
  assert.equal(r.body.error.retryable, false);
  const report = await waitAfterFinish(spec.jobId);
  assert.ok(report.deniedRequests.some((d) => d.url === "https://evil.example/" && d.reason === "host_not_allowed"));
});

async function waitAfterFinish(jobId: string) {
  const r = await call("POST", `/jobs/${jobId}/finish`);
  return C.CleanupReport.parse(r.body);
}

test("action and screenshot budgets are enforced by the runner", async () => {
  const spec = job({ limits: { deadlineMs: 60_000, maxActions: 3, maxScreenshots: 1 } });
  await call("POST", "/jobs", spec);
  await act(spec.jobId, { type: "navigate", url: "https://zed.dev/pricing" });
  assert.equal((await act(spec.jobId, { type: "screenshot" })).body.status, "ok");
  assert.equal((await act(spec.jobId, { type: "screenshot" })).body.error.code, "screenshot_limit_reached");
  assert.equal((await act(spec.jobId, { type: "inspect" })).body.status, "ok");
  const over = await act(spec.jobId, { type: "inspect" });
  assert.equal(over.body.error.code, "action_limit_reached");
  assert.equal(over.body.actionsRemaining, 0);
});

test("limits above the contract ceilings are rejected", async () => {
  const r = await call("POST", "/jobs", job({ limits: { deadlineMs: 999_999, maxActions: 20, maxScreenshots: 12 } }));
  assert.equal(r.status, 400);
});

test("stepIndex going backwards is invalid", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "s5", stepIndex: 5, action: { type: "navigate", url: "https://zed.dev/pricing" } });
  const back = await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "s2", stepIndex: 2, action: { type: "inspect" } });
  assert.equal(back.body.error.code, "invalid_action");
});

test("approval flow: submit needs a token; valid token works once; changed fields void it", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  await act(spec.jobId, { type: "navigate", url: "https://forms.wallio.example/trial" });
  const ins = await act(spec.jobId, { type: "inspect" });
  const els = ins.body.observation.elements as Array<{ ref: string; inputType: string }>;
  const email = els.find((e) => e.inputType === "email")!.ref;
  const password = els.find((e) => e.inputType === "password")!.ref;
  const submit = els.find((e) => e.inputType === "submit")!.ref;

  // Credentials never go in.
  const pw = await act(spec.jobId, { type: "fill", elementRef: password, value: "hunter2" });
  assert.equal(pw.body.error.code, "invalid_action");

  const filled = await act(spec.jobId, { type: "fill", elementRef: email, value: "demo-dev@wallio.example" });
  const approvedFp = filled.body.observation.pageFingerprint;

  // No token → denied.
  const noTok = await act(spec.jobId, { type: "click", elementRef: submit });
  assert.equal(noTok.body.status, "denied");
  assert.equal(noTok.body.error.code, "approval_token_invalid");

  // Token for a different element → denied.
  const wrongEl = signApprovalToken(KEY, { jobId: spec.jobId, actionId: "click_x", elementRef: email, pageFingerprint: approvedFp });
  const r1 = await act(spec.jobId, { type: "click", elementRef: submit, approvalToken: wrongEl }, "click_x");
  assert.equal(r1.body.error.code, "approval_token_invalid");

  // Fields changed after approval → the page fingerprint no longer matches → denied.
  const tokChanged = signApprovalToken(KEY, { jobId: spec.jobId, actionId: "click_changed", elementRef: submit, pageFingerprint: approvedFp });
  await act(spec.jobId, { type: "fill", elementRef: email, value: "someone-else@wallio.example" });
  const r2 = await act(spec.jobId, { type: "click", elementRef: submit, approvalToken: tokChanged }, "click_changed");
  assert.equal(r2.body.error.code, "approval_token_invalid");
  assert.match(r2.body.error.message, /changed/);

  // Restore the approved values; a fresh token for the exact page works.
  const back = await act(spec.jobId, { type: "fill", elementRef: email, value: "demo-dev@wallio.example" });
  assert.equal(back.body.observation.pageFingerprint, approvedFp);
  const good = signApprovalToken(KEY, { jobId: spec.jobId, actionId: "click_ok", elementRef: submit, pageFingerprint: approvedFp });
  const ok = await act(spec.jobId, { type: "click", elementRef: submit, approvalToken: good }, "click_ok");
  assert.equal(ok.body.status, "ok");
  assert.match(ok.body.observation.title, /received/i);

  // The same token under a new actionId is refused (binding), and replay of the same actionId returns the stored result.
  const reuse = await act(spec.jobId, { type: "click", elementRef: submit, approvalToken: good }, "click_reuse");
  assert.equal(reuse.body.error.code, "approval_token_invalid");
  const replay = await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "click_ok", stepIndex: ok.body.stepIndex, action: { type: "click", elementRef: submit, approvalToken: good } });
  assert.deepEqual(replay.body, ok.body);
});

test("hostile fixture: injected button points at a private host; denial is recorded; job still cleans", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  const nav = await act(spec.jobId, { type: "navigate", url: "https://hostile.wallio.example/" });
  assert.ok(nav.body.observation.deniedRequests.some((d: any) => d.reason === "private_range"));
  const ins = await act(spec.jobId, { type: "inspect" });
  const btn = ins.body.observation.elements[0];
  assert.equal(btn.targetHost, "10.0.0.5", "inspect exposes targetHost so policy can refuse before clicking");
  const report = await waitAfterFinish(spec.jobId);
  assert.equal(report.status, "cleaned");
  assert.ok(report.deniedRequests.length >= 2);
});

test("one job at a time: a second job is refused while the first is active", async () => {
  const a = job();
  await call("POST", "/jobs", a);
  const b = await call("POST", "/jobs", job());
  assert.equal(b.status, 409);
  assert.equal(b.body.code, "busy");
  await call("POST", `/jobs/${a.jobId}/finish`);
  assert.equal((await call("POST", "/jobs", job())).status, 201);
});

test("cancel: 202, further actions report cancelled, cleanup verified", async () => {
  const spec = job();
  await call("POST", "/jobs", spec);
  await act(spec.jobId, { type: "navigate", url: "https://zed.dev/pricing" });
  const c = await call("POST", `/jobs/${spec.jobId}/cancel`, { reason: "user_cancelled" });
  assert.equal(c.status, 202);
  const after = await act(spec.jobId, { type: "inspect" });
  assert.ok(after.status === 409 || after.body.error.code === "cancelled");
  const report = await waitCleaned(spec.jobId);
  assert.equal(report.status, "cleaned");
  assert.match(report.detail ?? "", /Cancelled: user_cancelled/);
});

test("hard deadline: the runner stops the job itself and cleans up", async () => {
  const spec = job({ limits: { deadlineMs: 300, maxActions: 20, maxScreenshots: 12 } });
  await call("POST", "/jobs", spec);
  await new Promise((r) => setTimeout(r, 400));
  const r = await act(spec.jobId, { type: "inspect" });
  assert.ok(r.status === 409 || r.body.error.code === "deadline_exceeded");
  const report = await waitCleaned(spec.jobId);
  assert.equal(report.status, "cleaned");
  assert.match(report.detail ?? "", /deadline/i);
});

test("unknown job is 404 job_not_found", async () => {
  const r = await call("GET", "/jobs/nope");
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "job_not_found");
});

test("restart recovery: a job running when the daemon died is failed and cleaned on startup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "runner-restart-"));
  boot(dir);
  const spec = job();
  await call("POST", "/jobs", spec);
  await act(spec.jobId, { type: "navigate", url: "https://zed.dev/pricing" });
  // Simulate a crash: new daemon on the same state dir, old one never cleaned up.
  boot(dir);
  await service.recover();
  const report = C.CleanupReport.parse((await call("GET", `/jobs/${spec.jobId}/cleanup`)).body);
  assert.equal(report.status, "cleaned");
  assert.match(report.detail ?? "", /restarted/);
  // Stored results are still served for replays.
  const replay = await call("POST", `/jobs/${spec.jobId}/actions`, { actionId: "act_0", stepIndex: 0, action: { type: "navigate", url: "https://zed.dev/pricing" } });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.status, "ok");
});

test("health reports driver, digest and pause state", async () => {
  const h = (await call("GET", "/healthz")).body;
  assert.equal(h.ok, true);
  assert.equal(h.activeJobs, 0);
  assert.match(h.imageDigest, /^sha256:/);
  assert.equal(h.driver, "fake");
});

test("config refuses unsafe settings", () => {
  const base = { RUNNER_SHARED_TOKEN: TOKEN, RUNNER_APPROVAL_KEY: KEY };
  assert.throws(() => loadRunnerConfig({ ...base, RUNNER_SHARED_TOKEN: "short" }));
  assert.throws(() => loadRunnerConfig({ ...base, RUNNER_APPROVAL_KEY: TOKEN }));
  assert.throws(() => loadRunnerConfig({ ...base, NODE_ENV: "production", RUNNER_TEST_MODE: "1" }));
  assert.throws(() => loadRunnerConfig({ ...base, NODE_ENV: "production", RUNNER_DRIVER: "fake" }));
  assert.throws(() => loadRunnerConfig({ ...base, NODE_ENV: "production" }), /TLS/);
  assert.throws(() => loadRunnerConfig({ ...base, RUNNER_BIND_HOST: "0.0.0.0" }));
});
