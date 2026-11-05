/**
 * Run orchestrator (P4, PRD §15).
 *
 * - Claims queued runs with FOR UPDATE SKIP LOCKED (via wallio_claim_run), so
 *   no run is ever executed by two workers.
 * - Holds a lease and renews it while executing. A run whose lease expires is
 *   recovered as FAILED with its partial evidence kept. It is never re-run,
 *   because an external action may already have happened.
 * - Enforces the execution deadline outside the executor (abort + TIMED_OUT).
 * - Reserves estimated spend before dispatch, enforces the per-run cap as
 *   inference usage is recorded, and stops claiming when the daily ceiling is hit.
 * - Every terminal path goes through CLEANING to CLEANED or CLEANUP_FAILED.
 *   Cleanup failure on a live run pauses new live runs (PRD §15).
 */
import { randomUUID } from "node:crypto";
import type { RunStage, RunStatus } from "@wallio/contracts";
import type { AppConfig } from "../config.ts";
import type { Db, Query } from "../db/pool.ts";
import type { UsageRecord } from "../inference/index.ts";
import { InferenceError } from "../inference/index.ts";
import { appendEvent, changeStage, transition, type TransitionExtras } from "./state.ts";

export type RunMode = "mock" | "live";

/** Statuses during which the claiming worker owns the run. */
export const EXECUTING: ReadonlySet<RunStatus> = new Set(["PREPARING", "RUNNING", "VERIFYING", "AWAITING_APPROVAL"]);
const ENDED_UNCLEANED: ReadonlySet<RunStatus> = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"]);

export type AbortReason = "deadline" | "stopped_elsewhere" | "shutdown";

export class RunAborted extends Error {
  override name = "RunAborted";
  readonly reason: AbortReason;
  constructor(reason: AbortReason) {
    super(`run aborted: ${reason}`);
    this.reason = reason;
  }
}

export class BudgetExceeded extends Error {
  override name = "BudgetExceeded";
}

/** A failure the executor wants reported with a specific ApiError code. */
export class RunFailure extends Error {
  override name = "RunFailure";
  readonly code: "runner_unavailable" | "runner_timeout" | "policy_denied" | "inference_unavailable" | "inference_invalid_output" | "internal";
  constructor(code: RunFailure["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface RunContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly mode: RunMode;
  readonly signal: AbortSignal;
  readonly deadlineAt: Date;
  /** Tenant-scoped transaction that refuses to run once the run is no longer executing. */
  q<T>(fn: (q: Query) => Promise<T>): Promise<T>;
  emit(ev: { type: string; stage?: RunStage; message: string; data: Record<string, unknown> }): Promise<void>;
  transition(to: RunStatus, extras?: TransitionExtras): Promise<void>;
  stage(to: RunStage, message: string): Promise<void>;
  /** Abortable sleep. */
  sleep(ms: number): Promise<void>;
  /** Throws RunAborted if the run was cancelled, timed out or the worker is stopping. */
  checkpoint(): void;
  /** Records an inference call and its cost. Throws BudgetExceeded past the per-run cap. */
  recordInference(u: UsageRecord): Promise<void>;
}

export interface ExecResult {
  outcome: "succeeded" | "partial";
}

export interface RunExecutor {
  execute(ctx: RunContext): Promise<ExecResult>;
}

export interface CleanupReport {
  result: "cleaned" | "failed";
  containerRemoved: boolean;
  volumeRemoved: boolean;
  detail: string;
}

export interface Cleaner {
  /** Every runner job the run recorded (one per purpose); empty when no browser was started. */
  cleanup(args: { tenantId: string; runId: string; runnerJobIds: string[] }): Promise<CleanupReport>;
}

/** What the HTTP layer needs from the orchestrator. */
export interface Orchestrator {
  kick(): void;
  finalize(tenantId: string, runId: string): Promise<void>;
  pausedReason(mode: RunMode): string | null;
  spendTodayMinor(): Promise<number>;
  queueDepth(mode: RunMode): Promise<number>;
}

interface ActiveJob { mode: RunMode; tenantId: string; ac: AbortController; done: Promise<void> }

export interface WorkerDeps {
  db: Db;
  config: AppConfig;
  executors: Partial<Record<RunMode, RunExecutor>>;
  cleaners: Record<RunMode, Cleaner>;
}

const log = (level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) => {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ level, msg, ...extra });
  level === "error" ? console.error(line) : console.log(line);
};

const apiError = (runId: string, code: string, message: string, retryable: boolean) => ({ code, message, correlationId: runId, retryable });

export class Worker implements Orchestrator {
  readonly owner = `worker_${randomUUID().slice(0, 8)}`;
  private readonly active = new Map<string, ActiveJob>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** Set by stop(): a stopped worker never claims or recovers runs, even if kicked. */
  private stopped = false;
  private paused: Partial<Record<RunMode, string>> = {};

  private readonly deps: WorkerDeps;

  constructor(deps: WorkerDeps) {
    this.deps = deps;
  }

  // ── lifecycle ──

  start(): void {
    this.stopped = false;
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.deps.config.worker.pollMs);
    this.kick();
  }

  /** Stops claiming, aborts running jobs and waits for them. Their runs are recovered by the sweeper. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const j of this.active.values()) j.ac.abort("shutdown" satisfies AbortReason);
    await Promise.allSettled([...this.active.values()].map((j) => j.done));
    while (this.ticking) await new Promise((r) => setTimeout(r, 10));
  }

  kick(): void {
    setImmediate(() => void this.tick());
  }

  pausedReason(mode: RunMode): string | null {
    return this.paused[mode] ?? null;
  }

  /** Operator action after investigating a cleanup failure. */
  resume(mode: RunMode): void {
    delete this.paused[mode];
  }

  async spendTodayMinor(): Promise<number> {
    return Number((await this.deps.db.pool.query("SELECT wallio_spend_today_minor() AS v")).rows[0].v);
  }

  async queueDepth(mode: RunMode): Promise<number> {
    return Number((await this.deps.db.pool.query("SELECT wallio_queue_depth($1) AS v", [mode])).rows[0].v);
  }

  /** One pass: recover stale runs, then claim work up to each mode's concurrency. */
  async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      await this.sweep();
      const { worker, dailySpendCapMinor } = this.deps.config;
      for (const mode of ["mock", "live"] as RunMode[]) {
        if (!this.deps.executors[mode] || this.paused[mode]) continue;
        while ([...this.active.values()].filter((j) => j.mode === mode).length < worker.concurrency[mode]) {
          if (mode === "live" && (await this.spendTodayMinor()) >= dailySpendCapMinor) {
            log("warn", "daily spend ceiling reached; not claiming live runs", { dailySpendCapMinor });
            break;
          }
          const claim = (await this.deps.db.pool.query("SELECT * FROM wallio_claim_run($1,$2,$3,$4)", [this.owner, mode, worker.leaseSecs, worker.execDeadlineSecs])).rows[0];
          if (!claim) break;
          this.startJob(mode, claim.run_id, claim.tenant_id);
        }
      }
    } catch (err) {
      log("error", "worker tick failed", { error: (err as Error).message });
    } finally {
      this.ticking = false;
    }
  }

  // ── one run ──

  private startJob(mode: RunMode, runId: string, tenantId: string): void {
    const ac = new AbortController();
    const job: ActiveJob = { mode, tenantId, ac, done: Promise.resolve() };
    this.active.set(runId, job);
    job.done = this.runJob(job, runId).finally(() => this.active.delete(runId));
  }

  private async runJob(job: ActiveJob, runId: string): Promise<void> {
    const { db, config } = this.deps;
    const { tenantId, mode, ac } = job;
    const executor = this.deps.executors[mode]!;
    let ended = false;
    let deadlineTimer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;

    try {
      const prepared = await db.withTenant(tenantId, async (q) => {
        const r = (await q("SELECT status, deadline_at FROM runs WHERE id = $1 AND tenant_id = $2 AND lease_owner = $3 FOR UPDATE", [runId, tenantId, this.owner])).rows[0];
        if (!r || r.status !== "QUEUED") return null;
        await transition(q, tenantId, runId, "PREPARING");
        if (mode === "live") {
          await q("UPDATE runs SET reserved_minor = LEAST(cap_minor, $3) WHERE id = $1 AND tenant_id = $2", [runId, tenantId, config.runEstimateMinor]);
        }
        return { deadlineAt: new Date(r.deadline_at) };
      });
      if (!prepared) return;

      deadlineTimer = setTimeout(() => ac.abort("deadline" satisfies AbortReason), Math.max(0, prepared.deadlineAt.getTime() - Date.now()));
      heartbeat = setInterval(() => void this.renewLease(job, runId), Math.max(200, (config.worker.leaseSecs * 1000) / 3));

      await db.withTenant(tenantId, (q) => transition(q, tenantId, runId, "RUNNING"));
      const ctx = this.context(job, runId, prepared.deadlineAt);
      // Race the executor against abort, so an executor that ignores its signal can't hold a run past its deadline.
      const aborted = new Promise<never>((_, reject) => {
        const fire = () => reject(new RunAborted(ac.signal.reason as AbortReason));
        if (ac.signal.aborted) fire();
        else ac.signal.addEventListener("abort", fire, { once: true });
      });
      aborted.catch(() => {});
      const result = await Promise.race([executor.execute(ctx), aborted]);
      ctx.checkpoint();
      await db.withTenant(tenantId, async (q) => {
        const s = (await q<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId])).rows[0]?.status;
        if (!s || !EXECUTING.has(s)) return;
        if (s !== "VERIFYING") await transition(q, tenantId, runId, "VERIFYING", { stage: "verifying" });
        await transition(q, tenantId, runId, "SUCCEEDED", { outcome: result.outcome });
        ended = true;
      });
    } catch (err) {
      const reason = (ac.signal.aborted ? ac.signal.reason : err instanceof RunAborted ? err.reason : null) as AbortReason | null;
      if (reason === "stopped_elsewhere" || reason === "shutdown") {
        // Cancelled by the user (the API finalizes) or worker stopping (the sweeper recovers).
      } else {
        ended = await this.endWithFailure(tenantId, runId, reason === "deadline" ? "deadline" : err);
      }
    } finally {
      clearTimeout(deadlineTimer);
      clearInterval(heartbeat);
      await db
        .withTenant(tenantId, (q) => q("UPDATE runs SET lease_owner = NULL, lease_expires_at = NULL WHERE id = $1 AND tenant_id = $2 AND lease_owner = $3", [runId, tenantId, this.owner]))
        .catch(() => {});
      if (ended) await this.finalize(tenantId, runId).catch((e) => log("error", "finalize failed", { runId, error: (e as Error).message }));
    }
  }

  private async renewLease(job: ActiveJob, runId: string): Promise<void> {
    try {
      const r = await this.deps.db.withTenant(job.tenantId, (q) =>
        q<{ status: RunStatus }>(
          `UPDATE runs SET lease_expires_at = now() + make_interval(secs => $4) WHERE id = $1 AND tenant_id = $2 AND lease_owner = $3 RETURNING status`,
          [runId, job.tenantId, this.owner, this.deps.config.worker.leaseSecs],
        ),
      );
      const status = r.rows[0]?.status;
      if (!status || !EXECUTING.has(status)) job.ac.abort("stopped_elsewhere" satisfies AbortReason);
    } catch {
      /* transient DB error: the next heartbeat retries; the lease covers 3 beats */
    }
  }

  private context(job: ActiveJob, runId: string, deadlineAt: Date): RunContext {
    const { db } = this.deps;
    const { tenantId, mode, ac } = job;
    const checkpoint = () => {
      if (ac.signal.aborted) throw new RunAborted(ac.signal.reason as AbortReason);
    };
    const q = <T>(fn: (q: Query) => Promise<T>) =>
      db.withTenant(tenantId, async (qq) => {
        checkpoint();
        const s = (await qq<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2", [runId, tenantId])).rows[0]?.status;
        if (!s || !EXECUTING.has(s)) {
          ac.abort("stopped_elsewhere" satisfies AbortReason);
          throw new RunAborted("stopped_elsewhere");
        }
        return fn(qq);
      });
    return {
      runId,
      tenantId,
      mode,
      signal: ac.signal,
      deadlineAt,
      q,
      checkpoint,
      emit: (ev) => q((qq) => appendEvent(qq, tenantId, runId, ev)).then(() => {}),
      transition: (to, extras) => q((qq) => transition(qq, tenantId, runId, to, extras)).then(() => {}),
      stage: (to, message) => q((qq) => changeStage(qq, tenantId, runId, to, message)),
      sleep: (ms) =>
        new Promise<void>((resolve, reject) => {
          if (ac.signal.aborted) return reject(new RunAborted(ac.signal.reason as AbortReason));
          const t = setTimeout(() => { ac.signal.removeEventListener("abort", onAbort); resolve(); }, ms);
          const onAbort = () => { clearTimeout(t); reject(new RunAborted(ac.signal.reason as AbortReason)); };
          ac.signal.addEventListener("abort", onAbort, { once: true });
        }),
      recordInference: async (u) => {
        const over = await db.withTenant(tenantId, async (qq) => {
          await qq(
            `INSERT INTO inference_usage (tenant_id, run_id, correlation_id, purpose, model, ok, error_code, attempts, repair_attempted, latency_ms, prompt_tokens, completion_tokens, est_cost_micro_usd, at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [tenantId, runId, u.correlationId, u.purpose, u.model, u.ok, u.errorCode, u.attempts, u.repairAttempted, u.latencyMs, u.promptTokens, u.completionTokens, u.estimatedCostMicroUsd, u.at],
          );
          const r = await qq<{ actual_minor: number; cap_minor: number }>(
            `UPDATE runs SET actual_micro_usd = actual_micro_usd + $3,
                    actual_minor = CEIL((actual_micro_usd + $3) / 10000.0)::bigint
              WHERE id = $1 AND tenant_id = $2 RETURNING actual_minor, cap_minor`,
            [runId, tenantId, u.estimatedCostMicroUsd ?? 0],
          );
          await appendEvent(qq, tenantId, runId, {
            type: "inference_call",
            message: u.ok ? `Model call: ${u.purpose}` : `Model call failed: ${u.purpose}`,
            data: { purpose: u.purpose, model: u.model, latencyMs: u.latencyMs, ok: u.ok },
          });
          const row = r.rows[0]!;
          return row.actual_minor >= row.cap_minor;
        });
        if (over) throw new BudgetExceeded("This comparison reached its spending cap.");
      },
    };
  }

  /** Moves an executing run to FAILED or TIMED_OUT. Returns true if this call ended it. */
  private async endWithFailure(tenantId: string, runId: string, cause: unknown): Promise<boolean> {
    return this.deps.db.withTenant(tenantId, async (q) => {
      const r = (await q<{ status: RunStatus; evidence_count: number }>("SELECT status, evidence_count FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId])).rows[0];
      if (!r || !EXECUTING.has(r.status)) return false;
      const partial = r.evidence_count > 0;
      if (cause === "deadline") {
        await transition(q, tenantId, runId, "TIMED_OUT", {
          outcome: "timed_out",
          error: apiError(runId, "runner_timeout", "The comparison hit its time limit. Evidence captured so far is kept.", true),
        });
        return true;
      }
      let error;
      if (cause instanceof BudgetExceeded) error = apiError(runId, "budget_exceeded", "This comparison reached its spending cap. Evidence captured so far is kept.", false);
      else if (cause instanceof InferenceError) error = apiError(runId, cause.code === "inference_invalid_output" ? "inference_invalid_output" : "inference_unavailable", "The AI service failed during this comparison. Evidence captured so far is kept; try again.", true);
      else if (cause instanceof RunFailure) error = apiError(runId, cause.code, cause.message, cause.code !== "policy_denied");
      else {
        log("error", "run failed", { runId, error: (cause as Error)?.message });
        error = apiError(runId, "internal", "Something went wrong during this comparison. Evidence captured so far is kept.", true);
      }
      await transition(q, tenantId, runId, "FAILED", { outcome: partial ? "partial" : "failed", error });
      return true;
    });
  }

  /** CLEANING → cleaner → CLEANED or CLEANUP_FAILED. Safe to call twice: only one caller wins. */
  async finalize(tenantId: string, runId: string): Promise<void> {
    const { db, config } = this.deps;
    const run = await db.withTenant(tenantId, async (q) => {
      const r = (await q<{ status: RunStatus; mode: RunMode; runner_job_ids: string[] }>("SELECT status, mode, runner_job_ids FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId])).rows[0];
      if (!r || !ENDED_UNCLEANED.has(r.status)) return null;
      // A run that ended can't act on an approval any more.
      await q("UPDATE approvals SET status = 'invalidated' WHERE run_id = $1 AND tenant_id = $2 AND status IN ('pending','approved')", [runId, tenantId]);
      await q("UPDATE runs SET pending_approval_id = NULL WHERE id = $1 AND tenant_id = $2", [runId, tenantId]);
      await transition(q, tenantId, runId, "CLEANING", { cleanup: "pending" });
      return r;
    });
    if (!run) return;

    let report: CleanupReport;
    try {
      report = await Promise.race([
        this.deps.cleaners[run.mode].cleanup({ tenantId, runId, runnerJobIds: run.runner_job_ids }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("cleanup timed out")), config.worker.cleanupMaxSecs * 1000)),
      ]);
    } catch (e) {
      report = { result: "failed", containerRemoved: false, volumeRemoved: false, detail: `Browser cleanup could not be verified (${(e as Error).message}).` };
    }

    await db.withTenant(tenantId, async (q) => {
      const s = (await q<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId])).rows[0]?.status;
      if (s !== "CLEANING") return;
      await appendEvent(q, tenantId, runId, {
        type: "cleanup",
        message: report.detail.slice(0, 300) || "Cleanup finished",
        data: { result: report.result, containerRemoved: report.containerRemoved, volumeRemoved: report.volumeRemoved },
      });
      await transition(q, tenantId, runId, report.result === "cleaned" ? "CLEANED" : "CLEANUP_FAILED", { cleanup: report.result === "cleaned" ? "cleaned" : "failed", stage: "done" });
    });
    if (report.result === "failed") this.onCleanupFailed(run.mode, runId, report.detail);
  }

  private onCleanupFailed(mode: RunMode, runId: string, detail: string): void {
    log("error", "ALERT cleanup failed", { mode, runId, detail });
    if (mode === "live") this.paused.live = `Paused after cleanup failed for run ${runId}. Check the runner, then resume.`;
  }

  // ── recovery ──

  async sweep(): Promise<void> {
    const { db, config } = this.deps;
    const stale = (await db.pool.query("SELECT * FROM wallio_stale_runs($1,$2)", [config.worker.queueMaxWaitSecs, config.worker.cleanupMaxSecs])).rows as Array<{
      run_id: string; tenant_id: string; status: RunStatus; mode: RunMode; lease_owner: string | null; reason: string;
    }>;
    for (const r of stale) {
      const mine = this.active.get(r.run_id);
      if (mine) {
        if (r.reason === "deadline") mine.ac.abort("deadline" satisfies AbortReason);
        continue;
      }
      try {
        await this.recover(r.tenant_id, r.run_id, r.reason, r.mode);
      } catch (e) {
        log("error", "recovery failed", { runId: r.run_id, reason: r.reason, error: (e as Error).message });
      }
    }
  }

  private async recover(tenantId: string, runId: string, reason: string, mode: RunMode): Promise<void> {
    const { db } = this.deps;
    if (reason === "requeue") {
      // Claimed but never started: nothing ran, so it's safe to hand back to the queue.
      await db.withTenant(tenantId, (q) => q("UPDATE runs SET lease_owner = NULL, lease_expires_at = NULL WHERE id = $1 AND tenant_id = $2 AND status = 'QUEUED'", [runId, tenantId]));
      return;
    }
    if (reason === "cleanup_stuck") {
      await db.withTenant(tenantId, async (q) => {
        const s = (await q<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId])).rows[0]?.status;
        if (s !== "CLEANING") return;
        await appendEvent(q, tenantId, runId, { type: "cleanup", message: "Browser cleanup did not finish in time", data: { result: "failed", containerRemoved: false, volumeRemoved: false } });
        await transition(q, tenantId, runId, "CLEANUP_FAILED", { cleanup: "failed", stage: "done" });
      });
      this.onCleanupFailed(mode, runId, "cleanup did not finish in time");
      return;
    }
    const ended = await db.withTenant(tenantId, async (q) => {
      const r = (await q<{ status: RunStatus; evidence_count: number }>("SELECT status, evidence_count FROM runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [runId, tenantId])).rows[0];
      if (!r) return false;
      const partial = r.evidence_count > 0 ? "partial" : "failed";
      if (reason === "queue_timeout" && r.status === "QUEUED") {
        await transition(q, tenantId, runId, "FAILED", { outcome: "failed", error: apiError(runId, "rate_limited", "Wallio was too busy to start this comparison. Try again in a minute.", true) });
        return true;
      }
      if (reason === "deadline" && EXECUTING.has(r.status)) {
        await transition(q, tenantId, runId, "TIMED_OUT", { outcome: "timed_out", error: apiError(runId, "runner_timeout", "The comparison hit its time limit. Evidence captured so far is kept.", true) });
        return true;
      }
      if (reason === "lease_expired" && EXECUTING.has(r.status)) {
        await transition(q, tenantId, runId, "FAILED", {
          outcome: partial,
          error: apiError(runId, "internal", "The worker running this comparison stopped. Evidence captured so far is kept; the comparison was not re-run.", true),
        });
        return true;
      }
      return false;
    });
    if (ended) await this.finalize(tenantId, runId);
  }
}
