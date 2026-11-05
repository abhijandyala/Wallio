/**
 * Orchestrator tests (P4): queue claiming, leases, deadlines, cancellation,
 * recovery, cleanup failure and spend controls. Live mode with fake executors.
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDatabase } from "../scripts/db-setup.ts";
import { createDb, type Db } from "../src/db/pool.ts";
import { createApp } from "../src/http/app.ts";
import { MockCleaner } from "../src/runs/executors.ts";
import { Worker, type Cleaner, type CleanupReport, type ExecResult, type RunContext, type RunExecutor } from "../src/runs/worker.ts";
import { ADMIN, APP, asAdmin, sleep, testConfig, until, Visitor } from "./helpers.ts";

class FakeExecutor implements RunExecutor {
  calls: string[] = [];
  exited: string[] = [];
  impl: (ctx: RunContext) => Promise<ExecResult> = async () => ({ outcome: "succeeded" });
  async execute(ctx: RunContext) {
    this.calls.push(ctx.runId);
    try {
      return await this.impl(ctx);
    } finally {
      this.exited.push(ctx.runId);
    }
  }
}

class FakeCleaner implements Cleaner {
  fail = false;
  calls = 0;
  async cleanup(): Promise<CleanupReport> {
    this.calls++;
    if (this.fail) throw new Error("runner unreachable");
    return { result: "cleaned", containerRemoved: true, volumeRemoved: true, detail: "Browser container removed and verified" };
  }
}

const cfg = testConfig({ runMode: "live" });
const fake = new FakeExecutor();
const cleaner = new FakeCleaner();
let db: Db;
let worker: Worker;
let app: ReturnType<typeof createApp>;
const newWorker = (executor: RunExecutor = fake) => new Worker({ db, config: cfg, executors: { live: executor }, cleaners: { mock: new MockCleaner(), live: cleaner } });

before(async () => {
  await setupDatabase(ADMIN, APP, { reset: true, log: () => {} });
  db = createDb(APP);
  worker = newWorker();
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
});
after(async () => {
  await worker?.stop();
  await db?.close();
});
beforeEach(() => {
  fake.impl = async () => ({ outcome: "succeeded" });
  cleaner.fail = false;
});

const statuses = async (v: Visitor, runId: string) => (await v.events(runId)).filter((e) => e.type === "status_changed").map((e) => e.data.to);

test("a live run is claimed, reserves spend, succeeds and is cleaned up; lease released", async () => {
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  const done = await v.waitFinished(runId);
  assert.equal(done.status, "CLEANED");
  assert.equal(done.outcome, "succeeded");
  assert.equal(done.spend.reservedMinor, 5, "estimate reserved before dispatch");
  assert.deepEqual(await statuses(v, runId), ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "SUCCEEDED", "CLEANING", "CLEANED"]);
  const [row] = await asAdmin("SELECT lease_owner, attempt FROM runs WHERE id = $1", [runId]);
  assert.equal(row.lease_owner, null);
  assert.equal(row.attempt, 1);
});

test("cancel mid-run: CANCELLED → CLEANED, executor stops and writes nothing more", async () => {
  fake.impl = async (ctx) => {
    for (;;) {
      await ctx.sleep(30);
      await ctx.emit({ type: "warning", message: "still working", data: { detail: "tick" } });
    }
  };
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  await until(async () => (await v.run(runId)).status === "RUNNING");
  await sleep(100);
  const c = await v.json("POST", `/api/runs/${runId}/cancel`, {});
  assert.equal(c.body.status, "CLEANED");
  assert.equal(c.body.outcome, "cancelled");
  await until(async () => fake.exited.includes(runId), 3000);
  const before = (await v.events(runId)).length;
  await sleep(150);
  assert.equal((await v.events(runId)).length, before, "no events after cancellation");
  assert.deepEqual((await statuses(v, runId)).slice(-3), ["CANCELLED", "CLEANING", "CLEANED"]);
});

test("deadline: an executor that hangs and ignores its signal is timed out from outside", async () => {
  cfg.worker.execDeadlineSecs = 1;
  fake.impl = () => new Promise(() => {});
  try {
    const v = new Visitor(app);
    const { runId } = (await v.startRun()).body;
    const done = await v.waitFinished(runId, 6000);
    assert.equal(done.status, "CLEANED");
    assert.equal(done.outcome, "timed_out");
    assert.equal(done.error.code, "runner_timeout");
    assert.ok((await statuses(v, runId)).includes("TIMED_OUT"));
  } finally {
    cfg.worker.execDeadlineSecs = 30;
  }
});

test("lost worker: an expired lease is recovered as FAILED with partial evidence and never re-run", async () => {
  await worker.stop();
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  await asAdmin("UPDATE runs SET status = 'RUNNING', lease_owner = 'ghost', lease_expires_at = now() - interval '1 second', evidence_count = 1 WHERE id = $1", [runId]);
  const callsBefore = fake.calls.length;
  worker = newWorker();
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
  const done = await new Visitor(app).run(runId).catch(() => null);
  void done;
  const final = await until(async () => {
    const [r] = await asAdmin("SELECT status, outcome, error FROM runs WHERE id = $1", [runId]);
    return r.status === "CLEANED" ? r : null;
  });
  assert.equal(final.outcome, "partial");
  assert.match(final.error.message, /not re-run/);
  assert.equal(fake.calls.length, callsBefore, "the executor was not called again");
});

test("requeue: a run claimed but never started goes back to the queue and runs once", async () => {
  await worker.stop();
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  await asAdmin("UPDATE runs SET lease_owner = 'ghost', lease_expires_at = now() - interval '1 second' WHERE id = $1", [runId]);
  worker = newWorker();
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
  const final = await until(async () => {
    const [r] = await asAdmin("SELECT status, outcome FROM runs WHERE id = $1", [runId]);
    return r.status === "CLEANED" ? r : null;
  });
  assert.equal(final.outcome, "succeeded");
  assert.equal(fake.calls.filter((id) => id === runId).length, 1);
});

test("queue timeout: a run that waits too long fails with a clear message", async () => {
  await worker.stop();
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  await asAdmin("UPDATE runs SET queued_at = now() - interval '1 hour' WHERE id = $1", [runId]);
  worker = newWorker();
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
  const final = await until(async () => {
    const [r] = await asAdmin("SELECT status, outcome, error FROM runs WHERE id = $1", [runId]);
    return r.status === "CLEANED" ? r : null;
  });
  assert.equal(final.outcome, "failed");
  assert.equal(final.error.code, "rate_limited");
  assert.ok(!fake.calls.includes(runId));
});

test("executor error: FAILED with outcome partial when evidence exists", async () => {
  fake.impl = async (ctx) => {
    await ctx.q((q) => q("UPDATE runs SET evidence_count = evidence_count + 1 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId]));
    throw new Error("boom");
  };
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  const done = await v.waitFinished(runId);
  assert.equal(done.status, "CLEANED");
  assert.equal(done.outcome, "partial");
  assert.equal(done.error.code, "internal");
  assert.ok(!done.error.message.includes("boom"), "internal error text is not shown to users");
});

test("per-run spend cap: usage past the cap stops the run with budget_exceeded", async () => {
  fake.impl = async (ctx) => {
    await ctx.recordInference({
      correlationId: "c", purpose: "plan", model: "qwen3.8-flash-next", ok: true, errorCode: null, attempts: 1, repairAttempted: false,
      latencyMs: 10, promptTokens: 100, completionTokens: 50, estimatedCostMicroUsd: 600_000, at: new Date().toISOString(),
    });
    return { outcome: "succeeded" };
  };
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  const done = await v.waitFinished(runId);
  assert.equal(done.error.code, "budget_exceeded");
  assert.equal(done.spend.actualMinor, 60);
  const [u] = await asAdmin("SELECT count(*)::int AS n FROM inference_usage WHERE run_id = $1", [runId]);
  assert.equal(u.n, 1);
  assert.ok((await v.events(runId)).some((e) => e.type === "inference_call"));
});

test("daily spend ceiling refuses new comparisons (kill switch)", async () => {
  cfg.dailySpendCapMinor = 1;
  try {
    const r = await new Visitor(app).startRun();
    assert.equal(r.status, 402);
    assert.equal(r.body.code, "budget_exceeded");
  } finally {
    cfg.dailySpendCapMinor = 100_000;
  }
});

test("a full queue refuses new comparisons", async () => {
  await worker.stop();
  cfg.worker.maxQueued = 1;
  try {
    const a = await new Visitor(app).startRun();
    assert.equal(a.status, 202);
    const b = await new Visitor(app).startRun();
    assert.equal(b.status, 429);
    assert.equal(b.body.code, "quota_exceeded");
  } finally {
    cfg.worker.maxQueued = 50;
    worker = newWorker();
    worker.start();
    app = createApp({ config: cfg, db, runs: worker });
  }
  await until(async () => Number((await asAdmin("SELECT count(*) AS n FROM runs WHERE status NOT IN ('CLEANED','CLEANUP_FAILED')"))[0].n) === 0);
});

test("cleanup failure: CLEANUP_FAILED keeps the outcome, pauses live runs, refuses new ones", async () => {
  cleaner.fail = true;
  const v = new Visitor(app);
  const { runId } = (await v.startRun()).body;
  const done = await v.waitFinished(runId);
  assert.equal(done.status, "CLEANUP_FAILED");
  assert.equal(done.outcome, "succeeded", "a cleanup error doesn't hide a completed test");
  assert.equal(done.cleanup, "failed");
  assert.ok(worker.pausedReason("live"));
  const refused = await new Visitor(app).startRun();
  assert.equal(refused.status, 503);
  assert.equal(refused.body.code, "runner_unavailable");
  worker.resume("live");
});

test("two workers never claim the same run (FOR UPDATE SKIP LOCKED)", async () => {
  await worker.stop();
  const seen: string[] = [];
  const slowFake: RunExecutor = { execute: async (ctx) => { seen.push(ctx.runId); await ctx.sleep(40); return { outcome: "succeeded" }; } };
  const runIds: string[] = [];
  for (let i = 0; i < 6; i++) runIds.push((await new Visitor(app).startRun()).body.runId);
  const a = newWorker(slowFake), b = newWorker(slowFake);
  await Promise.all([a.tick(), b.tick(), a.tick(), b.tick()]);
  a.start();
  b.start();
  await until(async () => Number((await asAdmin("SELECT count(*) AS n FROM runs WHERE id = ANY($1) AND status = 'CLEANED'", [runIds]))[0].n) === 6, 10_000);
  await Promise.all([a.stop(), b.stop()]);
  assert.equal(seen.length, 6);
  assert.equal(new Set(seen).size, 6, "each run executed exactly once");
  worker = newWorker();
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
});
