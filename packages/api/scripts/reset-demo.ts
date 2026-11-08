/**
 * Resets ONLY synthetic demo data: guest workspaces and everything they own (sessions,
 * inventory, profiles, runs, events, evidence, screenshots, recommendations, decisions,
 * approvals, form and eval sessions, audit rows, usage rows) via ON DELETE CASCADE.
 *
 * Never touched: the catalog, eval tasks, non-guest workspaces, schema, secrets.
 * Skipped for safety:
 *  - workspaces with a run that hasn't finished (status not CLEANED / CLEANUP_FAILED);
 *  - workspaces with a run created today (UTC) that reserved or spent money, so the
 *    daily cost ceiling can't be reset by deleting today's spend.
 *
 * Dry run by default. Usage:
 *   DATABASE_ADMIN_URL=... node scripts/reset-demo.ts [--older-than-minutes N] [--yes]
 */
import pg from "pg";

const args = process.argv.slice(2);
const apply = args.includes("--yes");
const olderIdx = args.indexOf("--older-than-minutes");
const olderThanMinutes = olderIdx >= 0 ? Number(args[olderIdx + 1]) : 0;
if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < 0) throw new Error("--older-than-minutes must be a non-negative number");
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL is not set");

const SELECT = `
  SELECT w.id FROM workspaces w
   WHERE w.kind = 'guest'
     AND w.created_at < now() - make_interval(mins => $1)
     AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.tenant_id = w.id AND r.status NOT IN ('CLEANED','CLEANUP_FAILED'))
     AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.tenant_id = w.id
                       AND r.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                       AND GREATEST(r.reserved_minor, r.actual_minor) > 0)`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  const ids = (await client.query<{ id: string }>(SELECT, [olderThanMinutes])).rows.map((r) => r.id);
  const count = async (table: string) =>
    Number((await client.query(`SELECT count(*) FROM ${table} WHERE ${table === "sessions" ? "workspace_id" : "tenant_id"} = ANY($1)`, [ids])).rows[0].count);
  const tables = ["sessions", "subscriptions", "profile_versions", "runs", "run_events", "evidence", "evidence_screenshots", "recommendations", "decisions", "decision_outcomes", "approvals", "form_sessions", "eval_sessions", "inference_usage", "audit_events"];
  const before: Record<string, number> = {};
  for (const t of tables) before[t] = await count(t);
  const skipped = Number((await client.query("SELECT count(*) FROM workspaces WHERE kind = 'guest'")).rows[0].count) - ids.length;
  const keptOther = Number((await client.query("SELECT count(*) FROM workspaces WHERE kind <> 'guest'")).rows[0].count);

  if (apply && ids.length) {
    await client.query("DELETE FROM workspaces WHERE kind = 'guest' AND id = ANY($1)", [ids]);
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify({
    mode: apply ? "deleted" : "dry-run (pass --yes to delete)",
    guestWorkspaces: ids.length,
    guestWorkspacesSkipped: skipped,
    nonGuestWorkspacesKept: keptOther,
    rows: before,
  }, null, 2));
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
