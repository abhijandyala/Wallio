/**
 * Run lifecycle (PRD §15). Every transition happens inside a tenant transaction
 * with the run row locked, and writes a status_changed event. Every event is
 * validated against the shared contract before it is stored.
 */
import { api, type RunStage, type RunStatus, type RunOutcome } from "@wallio/contracts";
import type { Query } from "../db/pool.ts";

export const TERMINAL: ReadonlySet<RunStatus> = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "CLEANING", "CLEANED", "CLEANUP_FAILED"]);
export const FINISHED: ReadonlySet<RunStatus> = new Set(["CLEANED", "CLEANUP_FAILED"]);

const ALLOWED: Record<RunStatus, RunStatus[]> = {
  CREATED: ["QUEUED", "CANCELLED"],
  QUEUED: ["PREPARING", "CANCELLED", "FAILED"],
  PREPARING: ["RUNNING", "FAILED", "TIMED_OUT", "CANCELLED"],
  RUNNING: ["VERIFYING", "AWAITING_APPROVAL", "FAILED", "TIMED_OUT", "CANCELLED"],
  AWAITING_APPROVAL: ["RUNNING", "FAILED", "TIMED_OUT", "CANCELLED"],
  VERIFYING: ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"],
  SUCCEEDED: ["CLEANING"],
  FAILED: ["CLEANING"],
  TIMED_OUT: ["CLEANING"],
  CANCELLED: ["CLEANING"],
  CLEANING: ["CLEANED", "CLEANUP_FAILED"],
  CLEANED: [],
  CLEANUP_FAILED: [],
};

export class TransitionError extends Error {
  override name = "TransitionError";
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED[from].includes(to);
}

type EventInput = { type: string; stage?: RunStage; message: string; data: Record<string, unknown> };

/** Appends one event with the next seq for this run. Throws if it doesn't match the contract. */
export async function appendEvent(q: Query, tenantId: string, runId: string, ev: EventInput): Promise<number> {
  const r = await q<{ last_event_seq: number; stage: RunStage }>(
    "UPDATE runs SET last_event_seq = last_event_seq + 1, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING last_event_seq, stage",
    [runId, tenantId],
  );
  const row = r.rows[0];
  if (!row) throw new TransitionError(`run ${runId} not found`);
  const event = { runId, seq: row.last_event_seq, ts: new Date().toISOString(), stage: ev.stage ?? row.stage, type: ev.type, message: ev.message, data: ev.data };
  const check = api.RunEvent.safeParse(event);
  if (!check.success) throw new TransitionError(`event ${ev.type} breaks the contract: ${check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  await q(
    "INSERT INTO run_events (tenant_id, run_id, seq, ts, type, stage, message, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [tenantId, runId, event.seq, event.ts, event.type, event.stage, event.message, event.data],
  );
  return event.seq;
}

export interface TransitionExtras {
  outcome?: RunOutcome;
  stage?: RunStage;
  cleanup?: "pending" | "cleaned" | "failed";
  error?: unknown;
  message?: string;
}

/** Locks the run, checks the move is allowed, updates it and records the event. */
export async function transition(q: Query, tenantId: string, runId: string, to: RunStatus, extras: TransitionExtras = {}): Promise<RunStatus> {
  const cur = await q<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId]);
  const from = cur.rows[0]?.status;
  if (!from) throw new TransitionError(`run ${runId} not found`);
  if (!canTransition(from, to)) throw new TransitionError(`illegal transition ${from} → ${to}`);
  await q(
    `UPDATE runs SET status = $3,
       outcome = COALESCE($4, outcome), stage = COALESCE($5, stage), cleanup = COALESCE($6, cleanup),
       error = COALESCE($7::jsonb, error), updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId, to, extras.outcome ?? null, extras.stage ?? null, extras.cleanup ?? null, extras.error === undefined ? null : JSON.stringify(extras.error)],
  );
  await appendEvent(q, tenantId, runId, {
    type: "status_changed",
    stage: extras.stage,
    message: extras.message ?? STATUS_MESSAGES[to],
    data: { from, to },
  });
  return from;
}

export async function changeStage(q: Query, tenantId: string, runId: string, to: RunStage, message: string): Promise<void> {
  const cur = await q<{ stage: RunStage }>("SELECT stage FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId]);
  const from = cur.rows[0]?.stage;
  if (!from || from === to) return;
  await q("UPDATE runs SET stage = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2", [runId, tenantId, to]);
  await appendEvent(q, tenantId, runId, { type: "stage_changed", stage: to, message, data: { from, to } });
}

const STATUS_MESSAGES: Record<RunStatus, string> = {
  CREATED: "Comparison created",
  QUEUED: "Comparison queued",
  PREPARING: "Preparing an isolated browser",
  RUNNING: "Comparison running",
  AWAITING_APPROVAL: "Waiting for your approval",
  VERIFYING: "Checking the results",
  SUCCEEDED: "Comparison finished",
  FAILED: "Comparison failed",
  TIMED_OUT: "Comparison hit its time limit",
  CANCELLED: "Comparison cancelled",
  CLEANING: "Removing the browser container",
  CLEANED: "Browser container removed",
  CLEANUP_FAILED: "Browser cleanup could not be verified",
};
