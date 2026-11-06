/**
 * Job lifecycle, limits and policy (contracts §B, PRD §14–15).
 *
 * The runner enforces its own copy of every limit and rule, whatever the
 * control plane sends: deadline (timer outside the container), action and
 * screenshot budgets, host allowlist, approval tokens and single use,
 * refusal to fill credential fields, idempotent action IDs, and verified
 * cleanup on every exit path.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readdirSync, rmSync, statSync } from "node:fs";
import type { z } from "zod";
import { runner as C } from "@wallio/contracts";
import type { RunnerConfig } from "../config.ts";
import type { AgentElement, AgentObservation, AgentOp } from "../../agent/protocol.ts";
import { AgentTimeout, type Denial, type Driver, type Sandbox, type SandboxRef } from "../drivers/types.ts";
import { checkTarget, DENY_MESSAGES } from "../egress/ip-policy.ts";
import { verifyApprovalToken } from "../approval/token.ts";
import { ArtifactStore, NonceStore, ensureDir, readJson, writeJsonAtomic, type ScreenshotMeta } from "../state.ts";
import { log } from "../log.ts";

type JobState = C.RunnerJobStatus["state"];
type ActionResult = C.RunnerActionResult;
type CleanupReport = C.CleanupReport;
type ErrorCode = NonNullable<ActionResult["error"]>["code"];
type HttpErrorCode = z.infer<typeof C.RunnerHttpError>["code"];
type CancelReason = z.infer<typeof C.RunnerCancelRequest>["reason"];

const LIMITS = C.RUNNER_LIMITS;
/** Agent-side timeout per op, plus slack before the daemon declares the browser hung. */
const AGENT_TIMEOUT_MS: Record<string, number> = { navigate: 40_000, click: 20_000, screenshot: 20_000, inspect: 15_000, fill: 15_000, scroll: 15_000, observe: 15_000, shutdown: 5_000 };
const WATCHDOG_SLACK_MS = 5_000;
const ENDED: ReadonlySet<JobState> = new Set(["cleaned", "cleanup_failed"]);
const STOPPED: ReadonlySet<JobState> = new Set(["cancelled", "timed_out", "failed"]);

export class RunnerHttpError extends Error {
  status: number;
  code: HttpErrorCode;
  constructor(status: number, code: HttpErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface JobRecord {
  jobId: string;
  runId: string;
  correlationId: string;
  purpose: string;
  allowedHosts: string[];
  limits: { deadlineMs: number; maxActions: number; maxScreenshots: number };
  state: JobState;
  startedAt: string;
  deadlineAt: string;
  imageDigest: string;
  ref: SandboxRef | null;
  actionsUsed: number;
  screenshotsUsed: number;
  lastStepIndex: number;
  results: Record<string, { reqHash: string; result: ActionResult }>;
  deniedRequests: Denial[];
  stopReason: string | null;
  /** How the job stopped, kept after cleanup so late actions get the right answer. */
  stoppedAs: "cancelled" | "timed_out" | "failed" | null;
  peak: { memMb: number; pids: number } | null;
  cleanup: CleanupReport | null;
}

interface Runtime {
  sandbox: Sandbox | null;
  chain: Promise<unknown>;
  inflight: Map<string, Promise<ActionResult>>;
  lastInspect: Map<string, AgentElement>;
  deadlineTimer?: NodeJS.Timeout;
  statsTimer?: NodeJS.Timeout;
  cleanup?: Promise<CleanupReport>;
}

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface JobServiceDeps {
  cfg: RunnerConfig;
  driver: Driver;
}

export class JobService {
  private cfg: RunnerConfig;
  private driver: Driver;
  private jobs = new Map<string, JobRecord>();
  private rt = new Map<string, Runtime>();
  private jobsDir: string;
  private pausePath: string;
  private sweeper?: NodeJS.Timeout;
  readonly artifacts: ArtifactStore;
  private nonces: NonceStore;
  paused: { since: string; reason: string } | null;

  constructor({ cfg, driver }: JobServiceDeps) {
    this.cfg = cfg;
    this.driver = driver;
    ensureDir(cfg.stateDir);
    this.jobsDir = ensureDir(join(cfg.stateDir, "jobs"));
    this.pausePath = join(cfg.stateDir, "paused.json");
    this.artifacts = new ArtifactStore(cfg.stateDir);
    this.nonces = new NonceStore(cfg.stateDir);
    this.paused = readJson(this.pausePath);
  }

  // ───────────── persistence ─────────────

  private file(jobId: string) {
    return join(this.jobsDir, `${sha256(jobId).slice(0, 32)}.json`);
  }

  private save(job: JobRecord) {
    writeJsonAtomic(this.file(job.jobId), job);
  }

  private pause(reason: string) {
    this.paused = { since: nowIso(), reason };
    writeJsonAtomic(this.pausePath, this.paused);
    log("error", "runner paused: new jobs refused until leftovers are verified gone", { reason });
  }

  private unpause() {
    if (!this.paused) return;
    log("info", "runner resumed", { after: this.paused.reason });
    this.paused = null;
    rmSync(this.pausePath, { force: true });
  }

  /** Startup: anything that was running when the daemon stopped is failed and cleaned up (PRD §15 recovery). */
  async recover(): Promise<void> {
    for (const f of readdirSync(this.jobsDir).filter((n) => n.endsWith(".json"))) {
      const job = readJson<JobRecord>(join(this.jobsDir, f));
      if (!job) continue;
      this.jobs.set(job.jobId, job);
      if (!ENDED.has(job.state)) {
        job.state = "failed";
        job.stoppedAs = "failed";
        job.stopReason = "The runner daemon restarted while this job was running.";
        this.save(job);
        this.rt.set(job.jobId, this.newRuntime());
        await this.cleanup(job);
      }
    }
    await this.sweep();
  }

  private newRuntime(): Runtime {
    return { sandbox: null, chain: Promise.resolve(), inflight: new Map(), lastInspect: new Map() };
  }

  private activeJob(): JobRecord | null {
    for (const j of this.jobs.values()) if (!ENDED.has(j.state)) return j;
    return null;
  }

  private mustGet(jobId: string): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) throw new RunnerHttpError(404, "job_not_found", `No job ${jobId} on this runner.`);
    return job;
  }

  // ───────────── jobs ─────────────

  status(jobId: string): C.RunnerJobStatus {
    const j = this.mustGet(jobId);
    return { jobId: j.jobId, state: j.state, actionsUsed: j.actionsUsed, screenshotsUsed: j.screenshotsUsed, startedAt: j.startedAt, deadlineAt: j.deadlineAt, imageDigest: j.imageDigest };
  }

  async create(input: C.RunnerJobCreate): Promise<C.RunnerJobStatus> {
    const existing = this.jobs.get(input.jobId);
    if (existing) {
      const same = existing.purpose === input.purpose && existing.allowedHosts.join() === [...new Set(input.allowedHosts)].join();
      if (same) return this.status(input.jobId);
      throw new RunnerHttpError(409, "bad_request", `Job ${input.jobId} already exists with a different specification.`);
    }
    if (this.paused) throw new RunnerHttpError(503, "busy", `The runner is paused after a cleanup failure and accepts no new jobs: ${this.paused.reason}`);
    const active = this.activeJob();
    if (active) throw new RunnerHttpError(409, "busy", `Job ${active.jobId} is still running or cleaning up. This runner takes one job at a time.`);

    const limits = {
      deadlineMs: Math.min(input.limits.deadlineMs, LIMITS.maxDeadlineMs),
      maxActions: Math.min(input.limits.maxActions, LIMITS.maxActions),
      maxScreenshots: Math.min(input.limits.maxScreenshots, LIMITS.maxScreenshots),
    };
    const started = Date.now();
    const job: JobRecord = {
      jobId: input.jobId, runId: input.runId, correlationId: input.correlationId, purpose: input.purpose,
      allowedHosts: [...new Set(input.allowedHosts)], limits, state: "starting",
      startedAt: new Date(started).toISOString(), deadlineAt: new Date(started + limits.deadlineMs).toISOString(),
      imageDigest: this.driver.imageDigest(), ref: null, actionsUsed: 0, screenshotsUsed: 0, lastStepIndex: -1,
      results: {}, deniedRequests: [], stopReason: null, stoppedAs: null, peak: null, cleanup: null,
    };
    const rt = this.newRuntime();
    this.jobs.set(job.jobId, job);
    this.rt.set(job.jobId, rt);
    this.save(job);
    // The hard deadline lives here, outside the container.
    rt.deadlineTimer = setTimeout(() => this.onDeadline(job), limits.deadlineMs);
    log("info", "job starting", { jobId: job.jobId, runId: job.runId, correlationId: job.correlationId, hosts: job.allowedHosts.length, limits });

    let sandbox: Sandbox;
    try {
      sandbox = await this.driver.start({ jobId: job.jobId, allowedHosts: job.allowedHosts, expiresAt: started + limits.deadlineMs + 60_000 });
    } catch (err) {
      job.ref = (err as { ref?: SandboxRef }).ref ?? job.ref;
      if (job.state === "starting") {
        job.state = "failed";
        job.stoppedAs = "failed";
        job.stopReason = `The browser could not start: ${(err as Error).message}`;
      }
      this.save(job);
      void this.cleanup(job);
      throw new RunnerHttpError(503, "browser_crashed", job.stopReason ?? "The browser could not start.");
    }
    job.ref = { ...sandbox.ref, pulled: 0 };
    rt.sandbox = sandbox;
    if (job.state !== "starting") {
      // Cancelled or timed out while the browser was starting.
      await this.driver.kill(sandbox.ref).catch(() => {});
      void this.cleanup(job);
      throw new RunnerHttpError(409, "cancelled", job.stopReason ?? "The job stopped before the browser was ready.");
    }
    job.state = "ready";
    this.save(job);
    sandbox.exited.then(() => {
      if (ENDED.has(job.state) || STOPPED.has(job.state) || rt.cleanup) return;
      if (job.state === "finished") void this.cleanup(job);
      else this.fail(job, "The browser container exited unexpectedly.");
    });
    this.sampleStats(job, rt);
    log("info", "job ready", { jobId: job.jobId, containerId: sandbox.ref.containerId });
    return this.status(job.jobId);
  }

  private sampleStats(job: JobRecord, rt: Runtime) {
    if (this.driver.name !== "docker") return;
    const tick = async () => {
      const s = await rt.sandbox?.stats().catch(() => null);
      if (s) job.peak = { memMb: Math.max(job.peak?.memMb ?? 0, s.memMb), pids: Math.max(job.peak?.pids ?? 0, s.pids) };
      if (!rt.cleanup && rt.sandbox) rt.statsTimer = setTimeout(tick, 3_000);
    };
    rt.statsTimer = setTimeout(tick, 1_000);
  }

  // ───────────── actions ─────────────

  async act(jobId: string, req: C.RunnerActionRequest): Promise<ActionResult> {
    const job = this.mustGet(jobId);
    const reqHash = sha256(JSON.stringify([req.stepIndex, req.action]));
    const stored = job.results[req.actionId];
    if (stored) {
      if (stored.reqHash !== reqHash) throw new RunnerHttpError(409, "bad_request", `actionId ${req.actionId} was already used for a different action.`);
      return stored.result;
    }
    const rt = this.rt.get(jobId) ?? this.newRuntime();
    this.rt.set(jobId, rt);
    const inflight = rt.inflight.get(req.actionId);
    if (inflight) return inflight;
    if (job.state === "starting") throw new RunnerHttpError(409, "job_not_ready", "The browser is still starting. Try again in a moment.");
    if ((job.state === "finished" || ENDED.has(job.state)) && !job.stoppedAs) throw new RunnerHttpError(409, "job_not_ready", `Job ${jobId} has finished and accepts no more actions.`);

    const p = rt.chain.then(() => this.execute(job, rt, req, reqHash));
    rt.chain = p.catch(() => {});
    rt.inflight.set(req.actionId, p);
    try {
      return await p;
    } finally {
      rt.inflight.delete(req.actionId);
    }
  }

  private async execute(job: JobRecord, rt: Runtime, req: C.RunnerActionRequest, reqHash: string): Promise<ActionResult> {
    const t0 = performance.now();
    const done = (status: ActionResult["status"], error: ActionResult["error"], observation: C.Observation | null = null): ActionResult => {
      let result: ActionResult = {
        actionId: req.actionId, stepIndex: req.stepIndex, status, observation, error,
        durationMs: Math.round(performance.now() - t0), actionsRemaining: Math.max(0, job.limits.maxActions - job.actionsUsed),
      };
      const check = C.RunnerActionResult.safeParse(result);
      if (!check.success) {
        log("error", "action result broke the contract", { jobId: job.jobId, actionId: req.actionId, issues: check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5) });
        result = { ...result, status: "failed", observation: null, error: { code: "internal", message: "The runner produced an invalid observation; it was withheld.", retryable: false } };
      }
      job.results[req.actionId] = { reqHash, result };
      this.save(job);
      log("info", "action", { jobId: job.jobId, actionId: req.actionId, step: req.stepIndex, type: req.action.type, status: result.status, code: result.error?.code ?? null, ms: result.durationMs, denied: result.observation?.deniedRequests.length ?? 0 });
      return result;
    };
    const E = (code: ErrorCode, message: string, retryable = false) => ({ code, message, retryable });
    const count = (screenshot = false) => {
      job.actionsUsed++;
      if (screenshot) job.screenshotsUsed++;
      job.lastStepIndex = Math.max(job.lastStepIndex, req.stepIndex);
    };

    // Terminal and budget checks, before anything reaches the browser.
    const stopped = job.stoppedAs;
    if (stopped === "cancelled") return done("failed", E("cancelled", "The job was cancelled."));
    if (stopped === "timed_out" || (!stopped && Date.now() >= Date.parse(job.deadlineAt))) {
      this.onDeadline(job);
      return done("timeout", E("deadline_exceeded", "The job reached its hard deadline and the browser was stopped."));
    }
    if (stopped === "failed") return done("failed", E("browser_crashed", job.stopReason ?? "The browser is no longer running."));
    if (job.state === "finished" || ENDED.has(job.state)) throw new RunnerHttpError(409, "job_not_ready", "The job has finished.");
    if (req.stepIndex < job.lastStepIndex) return done("failed", E("invalid_action", `stepIndex ${req.stepIndex} is lower than the last step (${job.lastStepIndex}).`));
    if (job.actionsUsed >= job.limits.maxActions) return done("failed", E("action_limit_reached", `This job's ${job.limits.maxActions}-action budget is used up.`));
    const a = req.action;
    if (a.type === "screenshot" && job.screenshotsUsed >= job.limits.maxScreenshots) {
      return done("failed", E("screenshot_limit_reached", `This job's ${job.limits.maxScreenshots}-screenshot budget is used up.`));
    }

    // Runner-side policy (independent of the control plane's checks).
    let op: AgentOp;
    switch (a.type) {
      case "navigate": {
        const u = new URL(a.url);
        const reason = checkTarget(u.hostname, u.port ? Number(u.port) : 443, new Set(job.allowedHosts));
        if (reason) {
          count();
          const denial = { url: `${u.protocol}//${u.host}/`, reason, at: nowIso() };
          job.deniedRequests.push(denial);
          log("warn", "navigate denied by runner policy", { jobId: job.jobId, host: u.host, reason });
          return done("denied", E("egress_denied", `${u.hostname} ${DENY_MESSAGES[reason]}.`));
        }
        op = { op: "navigate", url: a.url };
        break;
      }
      case "inspect":
        op = { op: "inspect", maxElements: Math.min(a.maxElements ?? 40, LIMITS.maxElementsPerInspect) };
        break;
      case "click": {
        let approved = false;
        let expectedFingerprint: string | null = null;
        if (a.approvalToken) {
          const v = verifyApprovalToken(this.cfg.approvalKey, a.approvalToken, { jobId: job.jobId, actionId: req.actionId, elementRef: a.elementRef });
          if (!v.ok) {
            count();
            return done("denied", E("approval_token_invalid", v.message));
          }
          // Consumed before dispatch: a token can never cause two clicks.
          if (!this.nonces.consume(v.nonce, v.exp)) {
            count();
            return done("denied", E("approval_token_invalid", "This approval was already used. Ask the user again."));
          }
          approved = true;
          expectedFingerprint = v.fingerprintHex;
        } else if (rt.lastInspect.get(a.elementRef)?.submits) {
          count();
          return done("denied", E("approval_token_invalid", "This control submits a form, so it needs an approval token from the control plane."));
        }
        op = { op: "click", ref: a.elementRef, approved, expectedFingerprint };
        break;
      }
      case "fill":
        if (rt.lastInspect.get(a.elementRef)?.sensitive) {
          count();
          return done("failed", E("invalid_action", "Refusing to fill a password, payment, one-time-code or file field."));
        }
        op = { op: "fill", ref: a.elementRef, value: a.value };
        break;
      case "scroll":
        op = { op: "scroll", direction: a.direction, pixels: a.pixels };
        break;
      case "screenshot":
        op = { op: "screenshot", fullPage: a.fullPage ?? false };
        break;
      case "finish":
        count();
        job.state = "finished";
        return done("ok", null);
    }

    if (!rt.sandbox) return done("failed", E("browser_crashed", "The browser is not running."));
    count(a.type === "screenshot");
    job.state = "busy";
    this.save(job);

    let reply;
    try {
      reply = await rt.sandbox.send(op, (AGENT_TIMEOUT_MS[op.op] ?? 15_000) + WATCHDOG_SLACK_MS);
    } catch (err) {
      const now = job.state as JobState;
      if (now === "cancelled") return done("failed", E("cancelled", "The job was cancelled while this action was running."));
      if (now === "timed_out") return done("timeout", E("deadline_exceeded", "The job reached its hard deadline during this action."));
      const hung = err instanceof AgentTimeout;
      const msg = hung ? "The browser stopped responding, so the runner stopped it." : "The browser container exited unexpectedly.";
      this.fail(job, msg);
      return done(hung ? "timeout" : "failed", E(hung ? "action_timeout" : "browser_crashed", msg));
    }
    if ((job.state as JobState) === "busy") job.state = "ready";

    const denials = await rt.sandbox.pullDenials().catch(() => [] as Denial[]);
    if (job.ref) job.ref.pulled = (job.ref.pulled ?? 0) + denials.length;
    job.deniedRequests.push(...denials);

    let shot: ScreenshotMeta | null = null;
    const png = reply.ok ? reply.observation?.screenshotPng : null;
    if (png) {
      shot = this.artifacts.put(job.jobId, Buffer.from(png, "base64"));
      if (!shot) return done("failed", E("internal", "The screenshot failed validation (not a PNG, or too large)."), this.toObservation(reply.observation!, denials, null));
    }
    const observation = reply.observation ? this.toObservation(reply.observation, denials, shot) : null;

    if (reply.ok) {
      if (op.op === "inspect") rt.lastInspect = new Map((reply.observation?.elements ?? []).map((e) => [e.ref, e]));
      if (op.op === "navigate") rt.lastInspect = new Map();
      return done("ok", null, observation);
    }
    const code = reply.code as ErrorCode;
    const status = code === "egress_denied" || code === "approval_token_invalid" ? "denied" : code === "action_timeout" ? "timeout" : "failed";
    if (code === "browser_crashed") this.fail(job, reply.message);
    return done(status, E(code, reply.message.slice(0, 500), ["navigation_failed", "action_timeout", "element_stale"].includes(code)), observation);
  }

  /** Converts untrusted agent output into a contract Observation, re-applying every cap. */
  private toObservation(o: AgentObservation, denials: Denial[], shot: ScreenshotMeta | null): C.Observation {
    const str = (v: unknown, n: number) => (typeof v === "string" ? v : "").slice(0, n);
    const url = str(o.url, 2000);
    const excerpt = typeof o.textExcerpt === "string" && o.textExcerpt ? o.textExcerpt.slice(0, LIMITS.maxTextExcerptChars) : null;
    const navHost = (() => { try { return o.navigationDenied ? new URL(o.navigationDenied).host : null; } catch { return null; } })();
    const captured = typeof o.capturedAt === "string" && !Number.isNaN(Date.parse(o.capturedAt)) ? new Date(o.capturedAt).toISOString() : nowIso();
    return {
      url,
      title: str(o.title, 300),
      httpStatus: Number.isInteger(o.httpStatus) ? o.httpStatus : null,
      redirectChain: Array.isArray(o.redirectChain) ? o.redirectChain.slice(0, 20).map((u) => str(u, 2000)) : [],
      pageFingerprint: `sha256:${/^[a-f0-9]{64}$/.test(o.fingerprintHex) ? o.fingerprintHex : sha256(url)}`,
      textExcerpt: excerpt,
      textSha256: excerpt ? `sha256:${sha256(excerpt)}` : null,
      elements: Array.isArray(o.elements)
        ? o.elements.slice(0, LIMITS.maxElementsPerInspect).filter((e) => /^e\d{1,4}$/.test(e.ref)).map((e) => ({
            ref: e.ref, role: str(e.role, 50), name: str(e.name, 200), tag: str(e.tag, 20), text: str(e.text, 300),
            href: e.href ? str(e.href, 2000) : null, inputType: e.inputType ? str(e.inputType, 30) : null, targetHost: e.targetHost ? str(e.targetHost, 253) : null,
          }))
        : null,
      screenshot: shot ? { artifactId: shot.artifactId, sha256: shot.sha256, width: shot.width, height: shot.height, bytes: shot.bytes, mimeType: "image/png" } : null,
      blocked: o.blocked ? { reason: o.blocked.reason, detail: str(o.blocked.detail, 300) } : navHost ? { reason: "egress_denied", detail: `The egress proxy refused ${navHost}.` } : null,
      deniedRequests: denials.map((d) => ({ url: str(d.url, 500), reason: String(d.reason) })),
      capturedAt: captured,
    };
  }

  // ───────────── stopping ─────────────

  private stop(job: JobRecord, state: "cancelled" | "timed_out" | "failed", reason: string) {
    if (ENDED.has(job.state) || STOPPED.has(job.state)) return;
    job.state = state;
    job.stoppedAs = state;
    job.stopReason = reason;
    this.save(job);
    log(state === "failed" ? "error" : "warn", `job ${state}`, { jobId: job.jobId, reason });
    const rt = this.rt.get(job.jobId);
    if (rt?.sandbox) void this.driver.kill(rt.sandbox.ref).catch(() => {});
    void this.cleanup(job);
  }

  private onDeadline(job: JobRecord) {
    this.stop(job, "timed_out", `Hard deadline of ${job.limits.deadlineMs / 1000} s reached.`);
  }

  private fail(job: JobRecord, reason: string) {
    this.stop(job, "failed", reason);
  }

  cancel(jobId: string, reason: CancelReason): void {
    const job = this.mustGet(jobId);
    if (job.state === "finished") {
      job.stopReason = `Cancelled (${reason}) after the last action.`;
      void this.cleanup(job);
      return;
    }
    this.stop(job, "cancelled", `Cancelled: ${reason}.`);
  }

  /** POST /jobs/:id/finish: close the browser gracefully, then tear down and verify. */
  async finish(jobId: string): Promise<CleanupReport> {
    const job = this.mustGet(jobId);
    const rt = this.rt.get(jobId) ?? this.newRuntime();
    this.rt.set(jobId, rt);
    if (rt.cleanup) return rt.cleanup;
    if (job.cleanup && ENDED.has(job.state)) return job.cleanup;
    if (job.state === "starting") throw new RunnerHttpError(409, "job_not_ready", "The browser is still starting.");
    await Promise.race([rt.chain, sleep(5_000)]);
    if (job.state === "ready" || job.state === "busy") job.state = "finished";
    this.save(job);
    if (rt.sandbox) await rt.sandbox.send({ op: "shutdown" }, 3_000).catch(() => {});
    return this.cleanup(job);
  }

  cleanupReport(jobId: string): CleanupReport {
    const job = this.mustGet(jobId);
    if (job.cleanup) return job.cleanup;
    return {
      jobId, status: "pending", containerId: job.ref?.containerId ?? null, containerRemoved: false, volumeRemoved: false, verifiedAt: null,
      actionsExecuted: job.actionsUsed, screenshotsTaken: job.screenshotsUsed, deniedRequests: job.deniedRequests,
      detail: STOPPED.has(job.state) ? "Cleanup in progress." : "The job is still running.",
    };
  }

  private cleanup(job: JobRecord): Promise<CleanupReport> {
    const rt = this.rt.get(job.jobId) ?? this.newRuntime();
    this.rt.set(job.jobId, rt);
    if (rt.cleanup) return rt.cleanup;
    rt.cleanup = (async () => {
      clearTimeout(rt.deadlineTimer);
      clearTimeout(rt.statsTimer);
      let res = await this.driver.teardown(job.jobId, job.ref).catch((e: Error) => ({ containerRemoved: false, volumeRemoved: false, remainingDenials: [] as Denial[], detail: e.message }));
      for (let attempt = 1; attempt < 3 && !(res.containerRemoved && res.volumeRemoved); attempt++) {
        await sleep(1_000 * attempt);
        res = await this.driver.teardown(job.jobId, job.ref).catch((e: Error) => ({ ...res, detail: e.message }));
      }
      job.deniedRequests.push(...res.remainingDenials);
      const cleaned = res.containerRemoved && res.volumeRemoved;
      const how = job.state === "finished" ? "Finished normally." : job.stopReason ?? `Ended in state ${job.state}.`;
      const peak = job.peak ? ` Peak memory ${job.peak.memMb} MiB, peak ${job.peak.pids} processes.` : "";
      const report: CleanupReport = {
        jobId: job.jobId,
        status: cleaned ? "cleaned" : "cleanup_failed",
        containerId: job.ref?.containerId ?? null,
        containerRemoved: res.containerRemoved,
        volumeRemoved: res.volumeRemoved,
        verifiedAt: cleaned ? nowIso() : null,
        actionsExecuted: job.actionsUsed,
        screenshotsTaken: job.screenshotsUsed,
        deniedRequests: job.deniedRequests.map((d) => ({ url: d.url, reason: String(d.reason), at: d.at })),
        detail: `${how} ${cleaned ? "Container and volume removed and verified absent." : `Cleanup failed: ${res.detail ?? "resources still present"}.`}${peak}`.slice(0, 1000),
      };
      job.cleanup = C.CleanupReport.parse(report);
      job.state = cleaned ? "cleaned" : "cleanup_failed";
      rt.sandbox = null;
      this.save(job);
      this.artifacts.expireJob(job.jobId, this.cfg.artifactTtlMs);
      log(cleaned ? "info" : "error", cleaned ? "job cleaned" : "job cleanup failed", { jobId: job.jobId, containerRemoved: res.containerRemoved, volumeRemoved: res.volumeRemoved, denied: job.deniedRequests.length, peak: job.peak });
      if (!cleaned) this.pause(`Cleanup failed for job ${job.jobId}: ${res.detail ?? "resources still present"}`);
      return job.cleanup;
    })();
    return rt.cleanup;
  }

  // ───────────── sweeper ─────────────

  async sweep(): Promise<void> {
    const active = new Set([...this.jobs.values()].filter((j) => !ENDED.has(j.state)).map((j) => j.jobId));
    const r = await this.driver.sweep(active).catch((e: Error) => ({ removed: [] as string[], failed: [`sweep error: ${e.message}`] }));
    if (r.removed.length) log("warn", "sweeper removed leftovers", { removed: r.removed });
    if (r.failed.length) {
      log("error", "sweeper could not remove leftovers", { failed: r.failed });
      if (!this.paused) this.pause(`Sweeper could not remove: ${r.failed.join(", ")}`);
      return;
    }
    // Re-verify jobs whose cleanup failed; resume only when every one is verified gone.
    for (const job of this.jobs.values()) {
      if (job.state !== "cleanup_failed") continue;
      const t = await this.driver.teardown(job.jobId, job.ref).catch(() => null);
      if (t?.containerRemoved && t.volumeRemoved && job.cleanup) {
        job.cleanup = { ...job.cleanup, status: "cleaned", containerRemoved: true, volumeRemoved: true, verifiedAt: nowIso(), detail: `${job.cleanup.detail ?? ""} Later removed and verified absent by the sweeper.`.trim().slice(0, 1000) };
        job.state = "cleaned";
        this.save(job);
      }
    }
    if (this.paused && ![...this.jobs.values()].some((j) => j.state === "cleanup_failed")) this.unpause();
    this.artifacts.purgeExpired();
    // Forget job records a day after they were cleaned.
    for (const f of readdirSync(this.jobsDir)) {
      const p = join(this.jobsDir, f);
      const j = readJson<JobRecord>(p);
      if (j && j.state === "cleaned" && Date.now() - statSync(p).mtimeMs > 24 * 3600_000) {
        rmSync(p, { force: true });
        this.jobs.delete(j.jobId);
      }
    }
  }

  startSweeper() {
    const loop = async () => {
      await this.sweep().catch((e) => log("error", "sweep failed", { error: (e as Error).message }));
      this.sweeper = setTimeout(loop, this.cfg.sweepIntervalMs);
    };
    this.sweeper = setTimeout(loop, this.cfg.sweepIntervalMs);
  }

  async health() {
    const d = await this.driver.health();
    const active = this.activeJob();
    return {
      ok: d.ok && !this.paused,
      activeJobs: active ? 1 : 0,
      imageDigest: this.driver.imageDigest(),
      driver: this.driver.name,
      paused: this.paused?.reason ?? null,
      detail: d.detail,
    };
  }

  /** Test helper and graceful shutdown. */
  async close() {
    clearTimeout(this.sweeper);
    for (const job of this.jobs.values()) if (!ENDED.has(job.state)) this.cancel(job.jobId, "shutdown");
    await Promise.all([...this.rt.values()].map((r) => r.cleanup).filter(Boolean));
    for (const r of this.rt.values()) clearTimeout(r.deadlineTimer);
  }
}
