/**
 * Decisions page: GET /api/decisions, defer / dismiss a recommendation, and the
 * check-in outcome on an accepted one. Runs in demo mode, which produces real
 * recommendation rows and a real approval gate.
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { api } from "@wallio/contracts";
import { setupDatabase } from "../scripts/db-setup.ts";
import { createDb, type Db } from "../src/db/pool.ts";
import { createApp } from "../src/http/app.ts";
import { MockCleaner, MockExecutor } from "../src/runs/executors.ts";
import { Worker } from "../src/runs/worker.ts";
import { ADMIN, APP, asAdmin, testConfig, until, Visitor } from "./helpers.ts";

const cfg = testConfig({ runMode: "mock" });
let db: Db, worker: Worker, app: ReturnType<typeof createApp>;

before(async () => {
  await setupDatabase(ADMIN, APP, { reset: true, log: () => {} });
  db = createDb(APP);
});
after(async () => {
  await worker?.stop();
  await db?.close();
});
beforeEach(async () => {
  await worker?.stop();
  worker = new Worker({ db, config: cfg, executors: { mock: new MockExecutor(1, { approvalTtlSecs: 60 }) }, cleaners: { mock: new MockCleaner() } } as any);
  worker.start();
  app = createApp({ config: cfg, db, runs: worker });
});

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function recommendation(v: Visitor): Promise<string> {
  const { runId } = (await v.startRun()).body;
  const done = await v.waitFinished(runId);
  assert.ok(done.recommendationId, "demo comparison produced a recommendation");
  return done.recommendationId;
}

test("a new recommendation is open; defer hides it until its date; dismiss moves it to history", async () => {
  const v = new Visitor(app);
  const empty = await v.json("GET", "/api/decisions");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, { approvals: [], recommendations: [], deferred: [], history: [] });

  const a = await recommendation(v);
  const b = await recommendation(v);
  let o = (await v.json("GET", "/api/decisions")).body;
  assert.ok(api.DecisionsOverview.safeParse(o).success);
  assert.deepEqual(o.recommendations.map((r: any) => r.id), [b, a], "newest first");

  const deferred = await v.json("POST", `/api/recommendations/${a}/defer`, { until: plusDays(7), reason: "after the renewal email" });
  assert.equal(deferred.status, 201);
  assert.equal(deferred.body.choice, "defer");
  assert.equal(deferred.body.reviewDate, plusDays(7));
  const byDefault = await v.json("POST", `/api/recommendations/${b}/defer`, {});
  assert.equal(byDefault.body.reviewDate, plusDays(14), "defaults to two weeks");

  o = (await v.json("GET", "/api/decisions")).body;
  assert.deepEqual(o.recommendations, []);
  assert.deepEqual(o.deferred.map((d: any) => [d.recommendationId, d.until]).sort(), [[a, plusDays(7)], [b, plusDays(14)]].sort());
  assert.deepEqual(o.history, [], "a deferral is not a decision yet");

  const dismissed = await v.json("POST", `/api/recommendations/${a}/dismiss`, { reason: "not now" });
  assert.equal(dismissed.status, 201);
  o = (await v.json("GET", "/api/decisions")).body;
  assert.deepEqual(o.deferred.map((d: any) => d.recommendationId), [b]);
  assert.equal(o.history.length, 1);
  assert.equal(o.history[0].recommendationId, a);
  assert.equal(o.history[0].choice, "dismiss");
  assert.equal(o.history[0].result, null, "nothing to check in on");
  assert.equal(o.history[0].checkInOn, null);
  assert.equal(o.history[0].estimatedAnnualSavingMinor, null);
});

test("a deferral whose date has come is open again", async () => {
  const v = new Visitor(app);
  const r = await recommendation(v);
  const d = (await v.json("POST", `/api/recommendations/${r}/defer`, { until: plusDays(3) })).body;
  await asAdmin("UPDATE decisions SET review_date = $2 WHERE id = $1", [d.id, today()]);
  const o = (await v.json("GET", "/api/decisions")).body;
  assert.deepEqual(o.recommendations.map((x: any) => x.id), [r]);
  assert.deepEqual(o.deferred, []);
});

test("defer dates must be after today and within a year", async () => {
  const v = new Visitor(app);
  const r = await recommendation(v);
  for (const until of [today(), plusDays(-3), plusDays(400)]) {
    const res = await v.json("POST", `/api/recommendations/${r}/defer`, { until });
    assert.equal(res.status, 400, until);
    assert.equal(res.body.code, "validation_failed");
  }
});

test("accepted: check-in is pending, then records helped; latest answer wins; only for accepted, latest decisions", async () => {
  const v = new Visitor(app);
  const r = await recommendation(v);
  const accepted = (await v.json("POST", "/api/decisions", { recommendationId: r, choice: "accept" })).body;
  let o = (await v.json("GET", "/api/decisions")).body;
  assert.deepEqual(o.recommendations, []);
  const entry = o.history[0];
  assert.equal(entry.id, accepted.id);
  assert.equal(entry.result, "pending");
  assert.equal(entry.checkInOn, plusDays(14));
  assert.equal(entry.resultAt, null);

  const helped = await v.json("POST", `/api/decisions/${accepted.id}/outcome`, { result: "helped" });
  assert.equal(helped.status, 200);
  assert.ok(api.DecisionLogEntry.safeParse(helped.body).success);
  assert.equal(helped.body.result, "helped");
  assert.ok(helped.body.resultAt);
  await v.json("POST", `/api/decisions/${accepted.id}/outcome`, { result: "no_change" });
  o = (await v.json("GET", "/api/decisions")).body;
  assert.equal(o.history[0].result, "no_change", "latest answer wins");

  const bad = await v.json("POST", `/api/decisions/${accepted.id}/outcome`, { result: "great" });
  assert.equal(bad.status, 400);

  // A newer decision replaces the accepted one: the old one can't be checked in any more.
  const dismissed = (await v.json("POST", `/api/recommendations/${r}/dismiss`, {})).body;
  const stale = await v.json("POST", `/api/decisions/${accepted.id}/outcome`, { result: "helped" });
  assert.equal(stale.status, 409);
  const notAccepted = await v.json("POST", `/api/decisions/${dismissed.id}/outcome`, { result: "helped" });
  assert.equal(notAccepted.status, 409);
});

test("waiting approvals appear on the Decisions page until decided", async () => {
  const v = new Visitor(app);
  const r = await recommendation(v);
  const { runId } = (await v.json("POST", "/api/trial-requests", { idempotencyKey: crypto.randomUUID(), recommendationId: r, toolId: "tool_zed" })).body;
  const waiting = await until(async () => {
    const run = await v.run(runId);
    return run.status === "AWAITING_APPROVAL" && run.pendingApprovalId ? run : null;
  }, 8000);
  let o = (await v.json("GET", "/api/decisions")).body;
  assert.deepEqual(o.approvals.map((a: any) => a.id), [waiting.pendingApprovalId]);
  assert.equal(o.approvals[0].status, "pending");

  const intent = o.approvals[0];
  assert.equal((await v.json("POST", `/api/approvals/${intent.id}/decision`, { decision: "decline", intentHash: intent.intentHash })).status, 200);
  o = (await v.json("GET", "/api/decisions")).body;
  assert.deepEqual(o.approvals, []);
});

test("another visitor sees nothing and can't act on someone else's recommendation or decision", async () => {
  const owner = new Visitor(app);
  const r = await recommendation(owner);
  const d = (await owner.json("POST", "/api/decisions", { recommendationId: r, choice: "accept" })).body;
  const other = new Visitor(app);
  assert.deepEqual((await other.json("GET", "/api/decisions")).body.history, []);
  assert.equal((await other.json("POST", `/api/recommendations/${r}/defer`, {})).status, 404);
  assert.equal((await other.json("POST", `/api/recommendations/${r}/dismiss`, {})).status, 404);
  assert.equal((await other.json("POST", `/api/decisions/${d.id}/outcome`, { result: "helped" })).status, 404);
  assert.equal((await other.json("POST", "/api/decisions/not-a-uuid/outcome", { result: "helped" })).status, 404);
  assert.equal((await owner.json("GET", "/api/decisions")).body.history[0].result, "pending", "owner's decision untouched");
});
