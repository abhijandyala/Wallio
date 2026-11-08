/** P8: the demo reset deletes only synthetic guest data, and never today's spend or a live run. */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setupDatabase } from "../scripts/db-setup.ts";
import { ADMIN, APP, asAdmin } from "./helpers.ts";

before(async () => {
  await setupDatabase(ADMIN, APP, { reset: true, log: () => {} });
});

async function workspace(kind: "guest" | "user", run?: { status: string; spentMinor: number; createdAt?: string }) {
  const [w] = await asAdmin("INSERT INTO workspaces (kind) VALUES ($1) RETURNING id", [kind]);
  if (run) {
    const [c] = await asAdmin("INSERT INTO comparisons (tenant_id, idempotency_key, request_hash, request) VALUES ($1, gen_random_uuid(), 'x', '{}') RETURNING id", [w.id]);
    await asAdmin("INSERT INTO runs (tenant_id, comparison_id, mode, status, deadline_at, cap_minor, actual_minor, created_at) VALUES ($1,$2,'live',$3, now(), 50, $4, COALESCE($5::timestamptz, now()))",
      [w.id, c.id, run.status, run.spentMinor, run.createdAt ?? null]);
  }
  return w.id as string;
}

const reset = (...args: string[]) => {
  const r = spawnSync(process.execPath, ["scripts/reset-demo.ts", ...args], { env: { ...process.env, DATABASE_ADMIN_URL: ADMIN }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test("dry run by default; --yes deletes only finished, no-spend-today guest workspaces", async () => {
  const done = await workspace("guest", { status: "CLEANED", spentMinor: 0 });
  const spentYesterday = await workspace("guest", { status: "CLEANED", spentMinor: 5, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
  const running = await workspace("guest", { status: "RUNNING", spentMinor: 0 });
  const spentToday = await workspace("guest", { status: "CLEANED", spentMinor: 5 });
  const user = await workspace("user", { status: "CLEANED", spentMinor: 0 });
  const [catalogBefore] = await asAdmin("SELECT count(*)::int AS n FROM catalog_tools");

  const dry = reset();
  assert.match(dry.mode, /dry-run/);
  assert.equal(dry.guestWorkspaces, 2);
  assert.equal((await asAdmin("SELECT count(*)::int AS n FROM workspaces"))[0].n, 5, "dry run deletes nothing");

  const applied = reset("--yes");
  assert.equal(applied.mode, "deleted");
  assert.equal(applied.rows.runs, 2);
  const left = (await asAdmin("SELECT id FROM workspaces")).map((r) => r.id).sort();
  assert.deepEqual(left, [running, spentToday, user].sort());
  assert.ok(!left.includes(done) && !left.includes(spentYesterday));
  assert.equal((await asAdmin("SELECT count(*)::int AS n FROM runs WHERE tenant_id = ANY($1)", [[done, spentYesterday]]))[0].n, 0, "cascade removed their runs");
  assert.equal((await asAdmin("SELECT count(*)::int AS n FROM catalog_tools"))[0].n, catalogBefore.n, "catalog untouched");
});
