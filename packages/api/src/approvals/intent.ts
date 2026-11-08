/**
 * Approval intents (PRD §15, Flow E).
 *
 * An intent is the exact action the user is asked to approve: the job, the element,
 * the target, every field value, the consequence, the page fingerprint and a
 * screenshot. Its canonical JSON is hashed; the user's decision must echo that hash,
 * so an approval binds to exactly what was shown.
 *
 * Who can change what:
 * - Only the user's decision (POST /api/approvals/:id/decision) moves pending → approved/declined.
 * - The worker can only consume (approved → consumed, once, right before dispatch),
 *   expire, or invalidate. Model output never reaches this module.
 * - A database trigger enforces these edges and keeps the intent immutable (migration 006).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Query } from "../db/pool.ts";

export interface IntentField { name: string; label: string; value: string }

/** The canonical record. Everything the user approves, plus what the runner binds to. */
export interface Intent {
  v: 1;
  id: string;
  runId: string;
  jobId: string;
  actionType: "submit_form";
  targetOrigin: string;
  /** Display URL (the form's secret token is never in it). */
  targetUrl: string;
  /** Host the submit control posts to, as reported by inspect. */
  submitHost: string;
  fields: IntentField[];
  consequence: string;
  elementRef: string;
  pageFingerprint: string;
  screenshotEvidenceId: string;
  createdAt: string;
  expiresAt: string;
  nonce: string;
}

/** JSON with object keys sorted at every level, so the same intent always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export const intentHash = (i: Intent) => `sha256:${createHash("sha256").update(canonicalJson(i)).digest("hex")}`;

export function buildIntent(p: Omit<Intent, "v" | "id" | "createdAt" | "expiresAt" | "nonce">, ttlSecs: number, now = new Date()): Intent {
  return {
    v: 1, id: randomUUID(), ...p,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSecs * 1000).toISOString(),
    nonce: randomBytes(16).toString("base64url"),
  };
}

export async function storeIntent(q: Query, tenantId: string, intent: Intent): Promise<string> {
  await q("INSERT INTO approvals (id, tenant_id, run_id, intent, intent_hash, expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [intent.id, tenantId, intent.runId, intent, intentHash(intent), intent.expiresAt]);
  return intent.id;
}

/** What the user sees (contract ApprovalIntent). Job, element, fingerprint and nonce stay server-side. */
export function approvalToContract(row: { id: string; run_id: string; intent: Intent; intent_hash: string; status: string; created_at: Date | string; expires_at: Date | string }) {
  const i = row.intent;
  return {
    id: row.id, runId: row.run_id, actionType: i.actionType, targetOrigin: i.targetOrigin, targetUrl: i.targetUrl,
    fields: i.fields, consequence: i.consequence, screenshotEvidenceId: i.screenshotEvidenceId, intentHash: row.intent_hash,
    createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
    status: row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now() ? "expired" : row.status,
  };
}

/** Marks a pending/approved intent expired once its time is up. Returns the current status. */
export async function refreshStatus(q: Query, tenantId: string, id: string): Promise<string | null> {
  await q("UPDATE approvals SET status = 'expired' WHERE id = $1 AND tenant_id = $2 AND status IN ('pending','approved') AND expires_at <= now()", [id, tenantId]);
  const r = (await q<{ status: string }>("SELECT status FROM approvals WHERE id = $1 AND tenant_id = $2", [id, tenantId])).rows[0];
  return r?.status ?? null;
}

/**
 * Consumes an approved, unexpired intent. Exactly one caller can win; the action is
 * dispatched only by the winner, right after this commits (at most once, never retried).
 */
export async function consume(q: Query, tenantId: string, id: string, intentHashExpected: string): Promise<boolean> {
  const r = await q(
    `UPDATE approvals SET status = 'consumed', consumed_at = now()
      WHERE id = $1 AND tenant_id = $2 AND status = 'approved' AND expires_at > now() AND intent_hash = $3`,
    [id, tenantId, intentHashExpected]);
  return r.rowCount === 1;
}

export async function invalidate(q: Query, tenantId: string, id: string): Promise<void> {
  await q("UPDATE approvals SET status = 'invalidated' WHERE id = $1 AND tenant_id = $2 AND status IN ('pending','approved')", [id, tenantId]);
}
