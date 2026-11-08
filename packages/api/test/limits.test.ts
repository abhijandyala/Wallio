/** P8: guest abuse limits and the daily cost ceiling. */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setupDatabase } from "../scripts/db-setup.ts";
import { createDb, type Db } from "../src/db/pool.ts";
import { createApp } from "../src/http/app.ts";
import { clientIp, RateLimiter } from "../src/http/rate-limit.ts";
import { MockCleaner, MockExecutor } from "../src/runs/executors.ts";
import { Worker } from "../src/runs/worker.ts";
import { ADMIN, APP, testConfig, Visitor } from "./helpers.ts";

let db: Db, worker: Worker;
before(async () => {
  await setupDatabase(ADMIN, APP, { reset: true, log: () => {} });
  db = createDb(APP);
  worker = new Worker({ db, config: testConfig(), executors: { mock: new MockExecutor(1) }, cleaners: { mock: new MockCleaner(), live: new MockCleaner() } });
  worker.start();
});
after(async () => {
  await worker?.stop();
  await db?.close();
});

const appWith = (limits: Partial<ReturnType<typeof testConfig>["limits"]>, over: Partial<ReturnType<typeof testConfig>> = {}) => {
  const base = testConfig(over);
  return createApp({ config: { ...base, limits: { ...base.limits, ...limits } }, db, runs: worker });
};
const from = (ip: string) => ({ "x-forwarded-for": ip });

test("the limiter counts per key and window, and the client address is Caddy's last hop", () => {
  let t = 0;
  const l = new RateLimiter(2, 1000, () => t);
  assert.equal(l.hit("a"), null);
  assert.equal(l.hit("a"), null);
  assert.equal(l.hit("a"), 1);
  assert.equal(l.hit("b"), null, "other keys are separate");
  t = 1000;
  assert.equal(l.hit("a"), null, "new window");
  assert.equal(clientIp("1.2.3.4, 5.6.7.8"), "5.6.7.8", "a spoofed first entry is ignored");
  assert.equal(clientIp(undefined), "local");
});

test("too many requests from one address get 429 rate_limited with Retry-After; health is exempt", async () => {
  const app = appWith({ requestsPerMinutePerIp: 3 });
  for (let i = 0; i < 3; i++) assert.equal((await app.request("/api/catalog", { headers: from("9.9.9.1") })).status, 200);
  const r = await app.request("/api/catalog", { headers: from("9.9.9.1") });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.equal(((await r.json()) as any).code, "rate_limited");
  assert.equal((await app.request("/api/catalog", { headers: from("9.9.9.2") })).status, 200, "another address is unaffected");
  assert.equal((await app.request("/api/health", { headers: from("9.9.9.1") })).status, 200);
});

test("one address can't mint unlimited guest workspaces", async () => {
  const app = appWith({ guestsPerHourPerIp: 2 });
  assert.equal((await app.request("/api/profile", { headers: from("8.8.8.1") })).status, 200);
  assert.equal((await app.request("/api/profile", { headers: from("8.8.8.1") })).status, 200);
  const third = await app.request("/api/profile", { headers: from("8.8.8.1") });
  assert.equal(third.status, 429);
  // An existing session keeps working.
  const v = new Visitor({ request: (p, i) => app.request(p, { ...i, headers: { ...(i?.headers as Record<string, string>), ...from("8.8.8.2") } }) });
  assert.equal((await v.json("GET", "/api/profile")).status, 200);
  assert.equal((await v.json("GET", "/api/profile")).status, 200);
});

test("a workspace gets a fixed number of runs per day, then 429 quota_exceeded", async () => {
  const app = appWith({ runsPerDayPerWorkspace: 2 });
  const v = new Visitor(app);
  for (let i = 0; i < 2; i++) {
    const { runId } = (await v.startRun()).body;
    await v.waitFinished(runId);
  }
  const third = await v.startRun();
  assert.equal(third.status, 429);
  assert.equal(third.body.code, "quota_exceeded");
  // An idempotent replay of an earlier request still returns its run.
  const other = new Visitor(app);
  assert.equal((await other.startRun()).status, 202, "other workspaces are unaffected");
});

test("the daily cost ceiling stops new runs with 402 before anything is written", async () => {
  // Demo runs spend nothing, so a ceiling of 0 shows the gate: today's spend (0) has reached it.
  const app = appWith({}, { dailySpendCapMinor: 0 });
  const v = new Visitor(app);
  const r = await v.startRun();
  assert.equal(r.status, 402);
  assert.equal(r.body.code, "budget_exceeded");
  assert.equal((await v.json("GET", "/api/profile")).status, 200, "the rest of the app still works");
});
