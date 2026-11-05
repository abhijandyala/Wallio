/**
 * End-to-end API tests against a real Postgres (wallio_test), connecting as the
 * non-superuser app role so row-level security is in force.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { api } from "@wallio/contracts";
import { setupDatabase } from "../scripts/db-setup.ts";
import { createDb, type Db } from "../src/db/pool.ts";
import { createApp } from "../src/http/app.ts";
import { canTransition, transition } from "../src/runs/state.ts";
import { Worker } from "../src/runs/worker.ts";
import { MockCleaner, MockExecutor, NoRunnerCleaner } from "../src/runs/executors.ts";
import { ADMIN, APP, testConfig } from "./helpers.ts";

const config = testConfig;
let db: Db;
let app: ReturnType<typeof createApp>;
let worker: Worker;
const mock = new MockExecutor(5);

before(async () => {
  await setupDatabase(ADMIN, APP, { reset: true, log: () => {} });
  db = createDb(APP);
  worker = new Worker({ db, config: config(), executors: { mock }, cleaners: { mock: new MockCleaner(), live: new NoRunnerCleaner() } });
  worker.start();
  app = createApp({ config: config(), db, runs: worker });
});
after(async () => {
  await worker?.stop();
  await db?.close();
});

/** A browser-like visitor with its own cookie jar. */
class Visitor {
  cookie = "";
  private a: { request: (p: string, i?: RequestInit) => Response | Promise<Response> };
  constructor(a?: { request: (p: string, i?: RequestInit) => Response | Promise<Response> }) {
    this.a = a ?? app;
  }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.a.request(path, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return res;
  }
  async json(method: string, path: string, body?: unknown) {
    const res = await this.req(method, path, body);
    return { status: res.status, body: (await res.json()) as any, headers: res.headers };
  }
}

const comparison = async (v: Visitor, over: Record<string, unknown> = {}) => {
  const profile = (await v.json("GET", "/api/profile")).body;
  return {
    idempotencyKey: randomUUID(), profileVersionId: profile.id, workflowId: "wf_debugging", taskId: "task_js_offbyone_v1",
    incumbentToolId: "tool_copilot", candidateToolIds: ["tool_zed"], ...over,
  };
};

async function readEvents(v: Visitor, runId: string, after = 0) {
  const res = await v.req("GET", `/api/runs/${runId}/events`, undefined, after ? { "last-event-id": String(after) } : {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  const text = await res.text();
  return text.split("\n\n").filter((b) => b.includes("data:")).map((b) => JSON.parse(b.split("\n").find((l) => l.startsWith("data:"))!.slice(5)));
}

const waitFinished = async (v: Visitor, runId: string) => {
  for (let i = 0; i < 200; i++) {
    const r = (await v.json("GET", `/api/runs/${runId}`)).body;
    if (r.status === "CLEANED" || r.status === "CLEANUP_FAILED") return r;
    await new Promise((x) => setTimeout(x, 20));
  }
  throw new Error("run did not finish");
};

// ───────────────────────── sessions & inventory ─────────────────────────

test("a new visitor gets a session and their own seeded inventory", async () => {
  const v = new Visitor();
  const r = await v.json("GET", "/api/inventory");
  assert.equal(r.status, 200);
  assert.match(v.cookie, /^wallio_sid=/);
  assert.ok(api.InventoryResponse.safeParse(r.body).success);
  assert.equal(r.body.subscriptions.length, 3);
  assert.equal(r.body.summary.knownMonthlyEquivalentMinor, 3000, "$10 + $20, Replit annual is unknown");
  assert.equal(r.body.summary.unknownPriceCount, 1);
  assert.ok(r.headers.get("x-correlation-id"));
});

test("catalog lists 15 curated coding tools", async () => {
  const r = await new Visitor().json("GET", "/api/catalog");
  assert.equal(r.body.length, 15);
  assert.ok(r.body.every((t: any) => t.category === "coding_assistant" && t.homepageUrl.startsWith("https://")));
});

test("add, edit and archive a subscription; totals recompute", async () => {
  const v = new Visitor();
  const created = await v.json("POST", "/api/inventory", { toolId: "tool_cursor", plan: "Team", price: { known: true, amountMinor: 1200, currency: "USD" }, cadence: "annual", seats: 2, renewalDate: null, taxIncluded: null });
  assert.equal(created.status, 201);
  assert.equal(created.body.source, "user_entered");
  assert.equal((await v.json("GET", "/api/inventory")).body.summary.knownMonthlyEquivalentMinor, 3000 + 200);

  const edited = await v.json("PATCH", `/api/inventory/${created.body.id}`, { price: { known: false, reason: "Not sure any more" } });
  assert.equal(edited.status, 200);
  const inv = (await v.json("GET", "/api/inventory")).body;
  assert.equal(inv.summary.knownMonthlyEquivalentMinor, 3000);
  assert.equal(inv.summary.unknownPriceCount, 2);

  await v.json("PATCH", `/api/inventory/${created.body.id}`, { status: "archived" });
  assert.equal((await v.json("GET", "/api/inventory")).body.subscriptions.length, 3);
});

// ───────────────────────── tenant isolation ─────────────────────────

test("visitors cannot see or change each other's data through the API", async () => {
  const a = new Visitor(), b = new Visitor();
  const sub = (await a.json("POST", "/api/inventory", { toolId: "tool_amp", plan: "Pro", price: { known: true, amountMinor: 500, currency: "USD" }, cadence: "monthly", seats: 1, renewalDate: null, taxIncluded: null })).body;
  const bInv = (await b.json("GET", "/api/inventory")).body;
  assert.ok(!bInv.subscriptions.some((s: any) => s.id === sub.id));
  assert.equal((await b.json("PATCH", `/api/inventory/${sub.id}`, { plan: "hijacked" })).status, 404);

  const run = (await a.json("POST", "/api/comparisons", await comparison(a))).body;
  assert.equal((await b.json("GET", `/api/runs/${run.runId}`)).status, 404);
  assert.equal((await b.req("GET", `/api/runs/${run.runId}/events`)).status, 404);
  assert.equal((await b.json("POST", `/api/runs/${run.runId}/cancel`, {})).status, 404);
  const done = await waitFinished(a, run.runId);
  assert.equal((await b.json("GET", `/api/recommendations/${done.recommendationId}`)).status, 404);
});

test("row-level security hides rows even if a query forgets the tenant filter", async () => {
  const a = new Visitor();
  await a.json("GET", "/api/inventory");
  const c = new pg.Client({ connectionString: APP });
  await c.connect();
  try {
    assert.equal((await c.query("SELECT count(*)::int AS n FROM subscriptions")).rows[0].n, 0, "no tenant set → nothing visible");
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [randomUUID()]);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM subscriptions")).rows[0].n, 0, "wrong tenant → nothing visible");
    await c.query("ROLLBACK");
    await assert.rejects(c.query("INSERT INTO subscriptions (tenant_id, tool_id, plan, price_known, unknown_reason, cadence, source) VALUES ($1,'tool_zed','x',false,'x','monthly','seed')", [randomUUID()]), /row-level security|foreign key/);
  } finally {
    await c.end();
  }
});

test("audit log is append-only for the app role", async () => {
  const c = new pg.Client({ connectionString: APP });
  await c.connect();
  try {
    await assert.rejects(c.query("UPDATE audit_events SET action = 'x'"), /permission denied/);
    await assert.rejects(c.query("DELETE FROM audit_events"), /permission denied/);
  } finally {
    await c.end();
  }
});

// ───────────────────────── request safety & errors ─────────────────────────

test("mutations need JSON and same origin", async () => {
  const v = new Visitor();
  const form = await v.req("POST", "/api/inventory", undefined, { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(form.status, 400);
  const cross = await v.req("POST", "/api/inventory", {}, { origin: "https://evil.example" });
  assert.equal(cross.status, 403);
});

test("errors are ApiError with a correlation id that matches the header", async () => {
  const r = await new Visitor().json("POST", "/api/inventory", { toolId: "tool_zed" });
  assert.equal(r.status, 400);
  assert.ok(api.ApiError.safeParse(r.body).success);
  assert.equal(r.body.code, "validation_failed");
  assert.equal(r.body.correlationId, r.headers.get("x-correlation-id"));
  assert.ok(Array.isArray(r.body.details.issues));
  const nf = await new Visitor().json("GET", "/api/runs/not-a-uuid");
  assert.equal(nf.status, 404);
  assert.equal(nf.body.code, "not_found");
});

// ───────────────────────── profile ─────────────────────────

test("saving a profile creates a new version and keeps the old one", async () => {
  const v = new Visitor();
  const p1 = (await v.json("GET", "/api/profile")).body;
  assert.equal(p1.version, 1);
  const { id, version, createdAt, ...input } = p1;
  const p2 = await v.json("POST", "/api/profile/versions", { ...input, dataSensitivity: "high" });
  assert.equal(p2.status, 201);
  assert.equal(p2.body.version, 2);
  assert.equal((await v.json("GET", "/api/profile")).body.dataSensitivity, "high");
});

// ───────────────────────── comparisons & runs ─────────────────────────

test("comparison: 202, then a full SSE event stream ending in CLEANED with a valid recommendation", async () => {
  const v = new Visitor();
  const acc = await v.json("POST", "/api/comparisons", await comparison(v));
  assert.equal(acc.status, 202);
  assert.ok(api.ComparisonAccepted.safeParse(acc.body).success);

  const events = await readEvents(v, acc.body.runId);
  assert.ok(events.length >= 15);
  events.forEach((e, i) => {
    assert.ok(api.RunEvent.safeParse(e).success, `event ${i} matches the contract`);
    if (i) assert.ok(e.seq > events[i - 1].seq);
  });
  const statuses = events.filter((e) => e.type === "status_changed").map((e) => e.data.to);
  assert.deepEqual(statuses, ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "SUCCEEDED", "CLEANING", "CLEANED"]);
  assert.ok(events.some((e) => e.type === "warning" && /sample data/.test(e.message)), "playback says it's sample data");

  const run = (await v.json("GET", `/api/runs/${acc.body.runId}`)).body;
  assert.equal(run.outcome, "succeeded");
  assert.equal(run.coverage.evidenceCount, 3);
  const rec = await v.json("GET", `/api/recommendations/${run.recommendationId}`);
  assert.ok(api.Recommendation.safeParse(rec.body).success);
  const ev = await v.json("GET", `/api/evidence/${rec.body.evidence[0].id}`);
  assert.equal(ev.status, 200);
  assert.match(ev.body.limitation, /Sample evidence/);

  const resumed = await readEvents(v, acc.body.runId, events[5].seq);
  assert.equal(resumed[0].seq, events[6].seq, "Last-Event-ID resumes after that event");
});

test("idempotency: same key and body returns the same run; different body conflicts", async () => {
  const v = new Visitor();
  const req = await comparison(v);
  const a = await v.json("POST", "/api/comparisons", req);
  const b = await v.json("POST", "/api/comparisons", req);
  assert.equal(b.status, 202);
  assert.equal(b.body.runId, a.body.runId);
  const c = await v.json("POST", "/api/comparisons", { ...req, candidateToolIds: ["tool_cursor"] });
  assert.equal(c.status, 409);
  assert.equal(c.body.code, "idempotency_conflict");
  await waitFinished(v, a.body.runId);
});

test("only one active comparison per workspace", async () => {
  mock.stepMs = 200;
  const v = new Visitor();
  const first = await v.json("POST", "/api/comparisons", await comparison(v));
  const second = await v.json("POST", "/api/comparisons", await comparison(v));
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "conflict");
  await v.json("POST", `/api/runs/${first.body.runId}/cancel`, {});
  mock.stepMs = 5;
});

test("comparison input is validated against the workspace and catalog", async () => {
  const v = new Visitor();
  const bad = async (over: Record<string, unknown>) => (await v.json("POST", "/api/comparisons", await comparison(v, over))).body.details;
  assert.ok(await bad({ workflowId: "wf_nope" }));
  assert.ok(await bad({ taskId: "task_nope" }));
  assert.deepEqual((await bad({ candidateToolIds: ["tool_nope"] })).missing, ["tool_nope"]);
  assert.ok(await bad({ candidateToolIds: ["tool_copilot"] }), "incumbent can't also be a candidate");
  const other = new Visitor();
  const otherProfile = (await other.json("GET", "/api/profile")).body.id;
  assert.equal((await bad({ profileVersionId: otherProfile })).field, "profileVersionId", "another workspace's profile is rejected");
});

test("cancel ends the run as CANCELLED → CLEANED and playback stops", async () => {
  mock.stepMs = 150;
  const v = new Visitor();
  const { runId } = (await v.json("POST", "/api/comparisons", await comparison(v))).body;
  await new Promise((r) => setTimeout(r, 200));
  const c = await v.json("POST", `/api/runs/${runId}/cancel`, {});
  assert.equal(c.status, 200);
  assert.equal(c.body.status, "CLEANED");
  assert.equal(c.body.outcome, "cancelled");
  await new Promise((r) => setTimeout(r, 400));
  const events = await readEvents(v, runId);
  assert.ok(!events.some((e) => e.type === "status_changed" && e.data.to === "SUCCEEDED"));
  assert.equal((await v.json("POST", `/api/runs/${runId}/cancel`, {})).status, 409, "can't cancel twice");
  mock.stepMs = 5;
});

// ───────────────────────── state machine ─────────────────────────

test("illegal transitions are refused", async () => {
  assert.equal(canTransition("QUEUED", "SUCCEEDED"), false);
  assert.equal(canTransition("CLEANED", "RUNNING"), false);
  assert.equal(canTransition("SUCCEEDED", "CLEANING"), true);
  const v = new Visitor();
  const { runId } = (await v.json("POST", "/api/comparisons", await comparison(v))).body;
  await waitFinished(v, runId);
  const tenantId = await tenantOf(runId);
  await assert.rejects(
    db.withTenant(tenantId, (q) => transition(q, tenantId, runId, "RUNNING")),
    /illegal transition CLEANED → RUNNING/,
  );
});

/** Looks up a run's tenant as the DB owner (test helper only). */
async function tenantOf(runId: string): Promise<string> {
  const c = new pg.Client({ connectionString: ADMIN });
  await c.connect();
  try {
    return (await c.query("SELECT tenant_id FROM runs WHERE id = $1", [runId])).rows[0].tenant_id;
  } finally {
    await c.end();
  }
}
