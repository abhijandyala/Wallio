/**
 * Approval-gated action (golden path §4.3): a SYNTHETIC trial request on Wallio's own
 * form. The browser fills fixed synthetic values, the run pauses for the user's
 * approval of the exact intent, the page is re-checked, the approval is consumed
 * once, and only then is the submit clicked with a runner-verified token.
 *
 * A changed page, target or field invalidates the approval and produces a new intent.
 * Nothing in this flow comes from a model.
 */
import { signApprovalToken } from "../runner/approval.ts";
import { RunnerError } from "../runner/client.ts";
import { buildIntent, consume, invalidate } from "../approvals/intent.ts";
import { newFormToken, SUBMIT_LABEL, syntheticValues, TRIAL_FIELDS } from "../forms/trial-form.ts";
import { askForApproval, noteInvalidated, resumeAfterDecision, waitForDecision } from "./approval-flow.ts";
import type { BrowserSession } from "./browser-session.ts";
import { storeEvidence } from "./evidence.ts";
import type { ExecResult, RunContext } from "./worker.ts";

export interface TrialDeps { formsBaseUrl: string; approvalKey: string; approvalTtlSecs: number }

const MAX_INTENTS = 2;
const LIMITATION_BEFORE = "Wallio's own synthetic trial form, filled but not submitted. Shown so you can approve exactly what would be sent.";
const LIMITATION_AFTER = "Wallio's own synthetic trial form after the approved submit. Recorded in Wallio only; no vendor received it.";

export async function runTrialRequest(ctx: RunContext, session: BrowserSession, deps: TrialDeps, req: { toolId: string }): Promise<ExecResult> {
  const base = deps.formsBaseUrl.replace(/\/+$/, "");
  const formsHost = new URL(base).hostname.toLowerCase();
  const toolName = await ctx.q(async (q) => (await q<{ name: string }>("SELECT name FROM catalog_tools WHERE id = $1", [req.toolId])).rows[0]?.name ?? req.toolId);
  const values = syntheticValues(toolName);

  await ctx.stage("testing", `Preparing a synthetic ${toolName} trial request on Wallio's own form`);
  const { token, hash } = newFormToken();
  const formId = await ctx.q(async (q) =>
    (await q<{ id: string }>("INSERT INTO form_sessions (tenant_id, run_id, token_hash, tool_name, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(secs => $5)) RETURNING id",
      [ctx.tenantId, ctx.runId, hash, toolName, deps.approvalTtlSecs * MAX_INTENTS + 180])).rows[0]!.id);
  const shownUrl = `${base}/trial/session-${formId}`; // the token never appears in events, evidence or the intent

  await session.open("form", `Prepare a synthetic ${toolName} trial request on Wallio's own form`, [formsHost]);
  const nav = await session.act({ type: "navigate", url: `${base}/trial/${token}` }, { displayUrl: shownUrl });
  if (nav?.status !== "ok" || !nav.observation || nav.observation.blocked) {
    await ctx.emit({ type: "warning", message: "Couldn't open Wallio's trial form; nothing was sent", data: { detail: nav?.error?.code ?? nav?.observation?.blocked?.reason ?? "refused" } });
    await session.close();
    return { outcome: "partial" };
  }

  /** Fills every field with its synthetic value, then reads back the page state the user will approve. */
  const prepare = async () => {
    const ins = await session.act({ type: "inspect", maxElements: 40 });
    for (const f of TRIAL_FIELDS) {
      const el = ins?.observation?.elements?.find((e) => e.name === f.label);
      const r = el ? await session.act({ type: "fill", elementRef: el.ref, value: values[f.name]! }) : null;
      if (r?.status !== "ok") return null;
    }
    const fin = await session.act({ type: "inspect", maxElements: 40 });
    const submit = fin?.observation?.elements?.find((e) => e.name === SUBMIT_LABEL);
    if (!fin?.observation || !submit) return null;
    return { fingerprint: fin.observation.pageFingerprint, submitRef: submit.ref, submitHost: (submit.targetHost ?? formsHost).toLowerCase() };
  };

  for (let round = 0; round < MAX_INTENTS; round++) {
    const prepared = await prepare();
    if (!prepared || prepared.submitHost !== formsHost) {
      await ctx.emit({ type: "warning", message: "Wallio's trial form didn't look as expected; nothing was sent", data: { detail: prepared ? `submits to ${prepared.submitHost}` : "fields_missing" } });
      await session.close();
      return { outcome: "partial" };
    }
    const shot = await session.screenshot();
    const screenshotEvidenceId = await storeEvidence(ctx, {
      kind: "observed_behavior", accessMode: "tested_owned_demo", toolId: null, url: shownUrl, text: JSON.stringify(values),
      excerpt: `Filled, not yet sent: ${TRIAL_FIELDS.map((f) => `${f.label}: ${values[f.name]}`).join("; ")}`, limitation: LIMITATION_BEFORE, shot,
      message: "Captured the filled form for your review",
    });

    const intent = buildIntent({
      runId: ctx.runId, jobId: session.job!.jobId, actionType: "submit_form", targetOrigin: base, targetUrl: shownUrl, submitHost: prepared.submitHost,
      fields: TRIAL_FIELDS.map((f) => ({ name: f.name, label: f.label, value: values[f.name]! })),
      consequence: `Sends one synthetic ${toolName} trial request to Wallio's own form, once. No vendor is contacted and nothing is bought.`,
      elementRef: prepared.submitRef, pageFingerprint: prepared.fingerprint, screenshotEvidenceId,
    }, deps.approvalTtlSecs);
    const intentHashValue = await askForApproval(ctx, intent, `Waiting for your approval to send the synthetic ${toolName} trial request`);
    const result = await waitForDecision(ctx, intent.id);
    await resumeAfterDecision(ctx, intent.id, result);
    if (result !== "approved") {
      await session.close();
      return { outcome: result === "declined" ? "succeeded" : "partial" };
    }

    // Re-check the page right before dispatch: same fingerprint (including every field value), same button, same target.
    const check = await session.act({ type: "inspect", maxElements: 40 });
    const el = check?.observation?.elements?.find((e) => e.ref === intent.elementRef);
    const unchanged = check?.status === "ok" && check.observation?.pageFingerprint === intent.pageFingerprint && el?.name === SUBMIT_LABEL
      && (el.targetHost ?? formsHost).toLowerCase() === intent.submitHost;
    if (!unchanged) {
      await ctx.q((q) => invalidate(q, ctx.tenantId, intent.id));
      await noteInvalidated(ctx, intent.id);
      continue; // a fresh intent, with a fresh screenshot, for the page as it is now
    }

    // Consume, then dispatch once. Never retried: an unclear outcome is reported as unclear.
    if (!(await ctx.q((q) => consume(q, ctx.tenantId, intent.id, intentHashValue)))) {
      await ctx.emit({ type: "warning", message: "The approval expired before it could be used; nothing was sent", data: { detail: "not_consumable" } });
      await session.close();
      return { outcome: "partial" };
    }
    const ttl = Math.max(5, Math.floor((new Date(intent.expiresAt).getTime() - Date.now()) / 1000));
    const approvalToken = signApprovalToken(deps.approvalKey, { jobId: intent.jobId, actionId: session.nextActionId(), elementRef: intent.elementRef, pageFingerprint: intent.pageFingerprint }, ttl);
    let res;
    try {
      res = await session.act({ type: "click", elementRef: intent.elementRef, approvalToken });
    } catch (e) {
      if (!(e instanceof RunnerError && e.code === "outcome_uncertain")) throw e;
      await ctx.emit({ type: "action_result", message: "The runner didn't confirm whether the request was sent. It was not retried.", data: { approvalId: intent.id, result: "uncertain", evidenceId: null } });
      await session.close();
      return { outcome: "partial" };
    }
    if (res?.status !== "ok" || !res.observation) {
      await ctx.emit({ type: "action_result", message: `The submit was refused (${res?.error?.code ?? "policy"}); nothing was sent`, data: { approvalId: intent.id, result: "refused", evidenceId: null } });
      await session.close();
      return { outcome: "partial" };
    }
    const after = await session.screenshot();
    const text = res.observation.textExcerpt ?? "";
    const evidenceId = await storeEvidence(ctx, {
      kind: "observed_behavior", accessMode: "tested_owned_demo", toolId: null, url: shownUrl, text, textHash: res.observation.textSha256,
      excerpt: (text.match(/Request received[^\n]*/)?.[0] ?? text).slice(0, 300), limitation: LIMITATION_AFTER, shot: after,
      message: "Captured the form's confirmation",
    });
    const received = /Request received/.test(text);
    await ctx.emit({
      type: "action_result",
      message: received ? "Sent once to Wallio's own form; no vendor was contacted" : "Clicked once, but the form didn't confirm receipt",
      data: { approvalId: intent.id, result: received ? "submitted" : "uncertain", evidenceId },
    });
    await session.close();
    return { outcome: received ? "succeeded" : "partial" };
  }

  await ctx.emit({ type: "warning", message: "The page kept changing after approval, so nothing was sent", data: { detail: "invalidated_twice" } });
  await session.close();
  return { outcome: "partial" };
}
