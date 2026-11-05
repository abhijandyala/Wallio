/**
 * One run's use of the browser runner: jobs opened one at a time (one per purpose),
 * every action checked by API policy before it is sent, and every job finished and
 * verified cleaned before the next one starts (PRD §14, §15).
 */
import { createHash } from "node:crypto";
import type { runner as rc } from "@wallio/contracts";
import { RunnerClient, RunnerError } from "../runner/client.ts";
import { checkAction, type PolicySpec, type PolicyState } from "../runner/policy.ts";
import { RunFailure, type RunContext } from "./worker.ts";

export const sha256 = (b: Buffer | string) => `sha256:${createHash("sha256").update(b).digest("hex")}`;

export interface Shot { bytes: Buffer; hash: string }

export class BrowserSession {
  readonly runner: RunnerClient;
  readonly ctx: RunContext;
  readonly policy: PolicySpec;
  readonly state: PolicyState & { currentHost: string | null };
  job: rc.RunnerJobStatus | null = null;
  private step = 0;

  constructor(runner: RunnerClient, ctx: RunContext, policy: PolicySpec) {
    this.runner = runner;
    this.ctx = ctx;
    this.policy = policy;
    this.state = { actionsUsed: 0, screenshotsUsed: 0, elements: null, currentHost: null };
  }

  /** Opens a job allowed only `hosts`. Its id is recorded before it exists, so cleanup can always find it. */
  async open(key: string, purpose: string, hosts: string[]): Promise<void> {
    if (this.job) throw new Error("a runner job is already open");
    const { ctx } = this;
    const jobId = `job_${ctx.runId}_${key}`.slice(0, 128);
    await ctx.q((q) => q("UPDATE runs SET runner_job_id = $3, runner_job_ids = array_append(runner_job_ids, $3) WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId, jobId]));
    const deadlineMs = Math.max(10_000, Math.min(180_000, ctx.deadlineAt.getTime() - Date.now() - 5_000));
    this.state.elements = null;
    this.state.currentHost = null;
    try {
      this.job = await this.runner.createJob({
        jobId, runId: ctx.runId, correlationId: ctx.correlationId, purpose: purpose.slice(0, 200), allowedHosts: hosts,
        limits: {
          deadlineMs,
          maxActions: Math.max(1, this.policy.maxActions - this.state.actionsUsed),
          maxScreenshots: Math.max(0, this.policy.maxScreenshots - this.state.screenshotsUsed),
        },
      });
    } catch {
      throw new RunFailure("runner_unavailable", "The browser runner isn't reachable right now. Try again in a minute.");
    }
  }

  /** Finishes the open job and waits for its verified cleanup. Throws if it isn't verified. */
  async close(): Promise<rc.CleanupReport | null> {
    if (!this.job) return null;
    const id = this.job.jobId;
    this.job = null;
    const rep = await verifiedCleanup(this.runner, id).catch(() => null);
    if (rep?.status !== "cleaned") {
      throw new RunFailure("runner_unavailable", "A browser session couldn't be verified as removed, so the run stopped before doing anything else.");
    }
    return rep;
  }

  /**
   * Checks an action against policy, then sends it. Returns null if policy refused it
   * (the refusal is logged as a policy_denied event). Read-only navigation is retried at
   * most twice on a transient failure; anything carrying an approval token never is.
   */
  async act(action: rc.RunnerAction, opts: { toolId?: string | null; displayUrl?: string; quietDenial?: boolean } = {}): Promise<rc.RunnerActionResult | null> {
    const { ctx, policy, state } = this;
    ctx.checkpoint();
    const d = checkAction(policy, state, action);
    if (!d.ok) {
      if (!opts.quietDenial) await this.logDenial(action, d.reason, d.needsApproval);
      return null;
    }
    const stepIndex = this.step++;
    if (action.type === "navigate") {
      const shown = opts.displayUrl ?? action.url;
      await ctx.emit({ type: "step", message: `Opening ${new URL(shown).hostname}${new URL(shown).pathname}`.slice(0, 300), data: { stepIndex, maxSteps: policy.maxActions, actionType: "navigate", url: shown, candidateToolId: opts.toolId ?? null } });
    }
    const external = action.type === "click" && Boolean(action.approvalToken);
    for (let attempt = 0; ; attempt++) {
      let res: rc.RunnerActionResult;
      try {
        if (!this.job) throw new Error("no open runner job");
        res = await this.runner.act(this.job.jobId, { actionId: actionIdFor(ctx.runId, stepIndex, attempt), stepIndex, action });
      } catch (e) {
        if (e instanceof RunnerError && e.code === "outcome_uncertain") throw e;
        if (e instanceof RunnerError && e.code === "deadline_exceeded") throw new RunFailure("runner_timeout", "The browser hit its time limit.");
        throw new RunFailure("runner_unavailable", "The browser runner stopped responding.");
      }
      state.actionsUsed++;
      // The runner hit the job's hard deadline and has killed the browser: the run times out (evidence kept).
      if (res.error?.code === "deadline_exceeded") throw new RunFailure("runner_timeout", "The browser hit its time limit. Evidence captured so far is kept.");
      if (action.type === "screenshot" && res.status === "ok") state.screenshotsUsed++;
      if (res.status === "ok" && res.observation) {
        if (action.type === "navigate") {
          state.elements = null;
          state.currentHost = safeHost(res.observation.url);
        }
        if (res.observation.elements) state.elements = res.observation.elements;
      }
      if (res.status === "ok" || action.type !== "navigate" || external || !res.error?.retryable || attempt >= 2) return res;
      ctx.checkpoint();
    }
  }

  /** The actionId the next act() call will use on its first attempt (approval tokens bind to it). */
  nextActionId(): string {
    return actionIdFor(this.ctx.runId, this.step, 0);
  }

  async logDenial(action: rc.RunnerAction, reason: string, needsApproval?: boolean, label?: string): Promise<void> {
    const target = "url" in action ? action.url : "elementRef" in action ? `${action.type} ${label ?? action.elementRef}` : action.type;
    await this.ctx.emit({
      type: "policy_denied",
      message: (needsApproval ? `Held ${label ? `"${label}"` : "an action"}: it needs your approval` : `Refused ${label ? `"${label}"` : "an action"} outside policy`).slice(0, 300),
      data: { attemptedAction: action.type, target: target.slice(0, 200), reason },
    });
  }

  /** Takes a screenshot and copies it out of the runner, checked against the reported hash. */
  async screenshot(toolId: string | null = null): Promise<Shot | null> {
    const snap = await this.act({ type: "screenshot", fullPage: false }, { toolId });
    if (snap?.status !== "ok" || !snap.observation?.screenshot) return null;
    try {
      const bytes = await this.runner.artifact(snap.observation.screenshot.artifactId);
      if (sha256(bytes) === snap.observation.screenshot.sha256) return { bytes, hash: sha256(bytes) };
      await this.ctx.emit({ type: "warning", message: "A screenshot didn't match its reported hash and was discarded", data: { detail: "hash_mismatch" } });
    } catch {
      await this.ctx.emit({ type: "warning", message: "A screenshot couldn't be downloaded; text evidence is kept", data: { detail: "artifact_failed" } });
    }
    return null;
  }
}

const actionIdFor = (runId: string, stepIndex: number, attempt: number) => `a_${runId.slice(0, 8)}_${stepIndex}_${attempt}`;
const safeHost = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Finishes a runner job (or cancels it if finish fails) and polls until cleanup is
 * verified or reported failed. A job that is already finished just returns its report.
 */
export async function verifiedCleanup(runner: RunnerClient, jobId: string, pollMs = 500, maxMs = 20_000): Promise<rc.CleanupReport | null> {
  let rep: rc.CleanupReport;
  try {
    rep = await runner.cleanup(jobId);
  } catch (e) {
    // Recorded but never created on the runner (create failed): nothing exists to remove.
    if (e instanceof RunnerError && e.code === "job_not_found") return null;
    throw e;
  }
  if (rep.status === "pending") {
    try {
      rep = await runner.finish(jobId);
    } catch {
      await runner.cancel(jobId, "shutdown").catch(() => {});
      rep = await runner.cleanup(jobId);
    }
  }
  const until = Date.now() + maxMs;
  while (rep.status === "pending" && Date.now() < until) {
    await new Promise((r) => setTimeout(r, pollMs));
    rep = await runner.cleanup(jobId);
  }
  return rep;
}
