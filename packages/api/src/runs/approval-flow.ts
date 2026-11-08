/**
 * Pausing a run for the user's approval (RUNNING → AWAITING_APPROVAL → RUNNING).
 * Used by both demo playback and live trial requests; the approval rules are the same.
 */
import { appendEvent } from "./state.ts";
import { intentHash, refreshStatus, storeIntent, type Intent } from "../approvals/intent.ts";
import type { RunContext } from "./worker.ts";

export type DecisionResult = "approved" | "declined" | "expired" | "invalidated";

/** Stores the intent, pauses the run and tells the UI. Returns the intent hash to consume with later. */
export async function askForApproval(ctx: RunContext, intent: Intent, message: string): Promise<string> {
  const hash = intentHash(intent);
  await ctx.q(async (q) => {
    await storeIntent(q, ctx.tenantId, intent);
    await q("UPDATE runs SET pending_approval_id = $3 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId, intent.id]);
  });
  await ctx.transition("AWAITING_APPROVAL");
  await ctx.emit({ type: "approval_required", message, data: { approvalId: intent.id } });
  return hash;
}

/** Waits until the user decides or the intent expires. Abortable (cancel, deadline, shutdown). */
export async function waitForDecision(ctx: RunContext, approvalId: string, pollMs = 400): Promise<DecisionResult> {
  for (;;) {
    ctx.checkpoint();
    const status = await ctx.q((q) => refreshStatus(q, ctx.tenantId, approvalId));
    if (status === "approved" || status === "declined" || status === "expired" || status === "invalidated") return status;
    if (status !== "pending") return "invalidated";
    await ctx.sleep(pollMs);
  }
}

const RESOLVED: Record<DecisionResult, string> = {
  approved: "You approved the request",
  declined: "You declined the request; nothing was sent",
  expired: "The approval expired; nothing was sent",
  invalidated: "The page changed after you saw it, so that approval no longer applies",
};

/** Resumes the run after a decision and records it. */
export async function resumeAfterDecision(ctx: RunContext, approvalId: string, result: DecisionResult): Promise<void> {
  await ctx.q((q) => q("UPDATE runs SET pending_approval_id = NULL WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId]));
  await ctx.transition("RUNNING");
  await ctx.q((q) => appendEvent(q, ctx.tenantId, ctx.runId, { type: "approval_resolved", message: RESOLVED[result], data: { approvalId, result } }));
}

/** Records that a previously approved intent no longer matches the page (no state change). */
export async function noteInvalidated(ctx: RunContext, approvalId: string): Promise<void> {
  await ctx.emit({ type: "approval_resolved", message: RESOLVED.invalidated, data: { approvalId, result: "invalidated" } });
}
