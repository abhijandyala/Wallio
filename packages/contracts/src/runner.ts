/**
 * API ↔ Runner contract (Anish ↔ Adhvik).
 *
 * Model: the control plane drives the browser ONE step at a time.
 * The model proposes an action → backend policy validates it → we send it here →
 * the runner executes it and returns an observation. The runner never calls
 * inference and never holds provider keys or cloud credentials.
 *
 * Transport: HTTPS over the private Vultr network, control VM → runner daemon only.
 * Auth: `Authorization: Bearer <RUNNER_SHARED_TOKEN>` on every request.
 * Endpoints are listed in docs/CONTRACTS.md.
 */
import { z } from "zod";
import { Id, Sha256, Timestamp } from "./common.ts";

/** Hard ceilings from PRD §14. The runner enforces these independently of what we send. */
export const RUNNER_LIMITS = {
  maxDeadlineMs: 180_000,
  maxActions: 20,
  maxScreenshots: 12,
  maxElementsPerInspect: 60,
  maxTextExcerptChars: 4_000,
} as const;

const Hostname = z
  .string()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "lower-case public hostname, no scheme or port");

// ───────────────────────── Job lifecycle ─────────────────────────

/** POST /jobs */
export const RunnerJobCreate = z.object({
  jobId: Id,
  /** Opaque correlation, not used for auth on the runner side. */
  runId: Id,
  correlationId: Id,
  /** Short, sanitized description for runner logs. Never user secrets or private code. */
  purpose: z.string().max(200),
  /** HTTPS hosts the browser may reach. Exact match; subdomains must be listed. Enforced at the egress proxy. */
  allowedHosts: z.array(Hostname).min(1).max(20),
  limits: z.object({
    deadlineMs: z.int().positive().max(RUNNER_LIMITS.maxDeadlineMs),
    maxActions: z.int().positive().max(RUNNER_LIMITS.maxActions),
    maxScreenshots: z.int().nonnegative().max(RUNNER_LIMITS.maxScreenshots),
  }),
});
export type RunnerJobCreate = z.infer<typeof RunnerJobCreate>;

export const RunnerJobState = z.enum(["starting", "ready", "busy", "finished", "cancelled", "timed_out", "failed", "cleaned", "cleanup_failed"]);

/** 201 from POST /jobs, and GET /jobs/:id */
export const RunnerJobStatus = z.object({
  jobId: Id,
  state: RunnerJobState,
  actionsUsed: z.int().nonnegative(),
  screenshotsUsed: z.int().nonnegative(),
  startedAt: Timestamp,
  deadlineAt: Timestamp,
  /** Pinned browser image digest, for the audit record. */
  imageDigest: z.string().startsWith("sha256:"),
});
export type RunnerJobStatus = z.infer<typeof RunnerJobStatus>;

// ───────────────────────── Actions ─────────────────────────

/** Element handle returned by `inspect`. Valid only until the next navigation. */
const ElementRef = z.string().regex(/^e\d{1,4}$/);

/**
 * The full action vocabulary (PRD §14). No shell, no Docker, no arbitrary JS,
 * no file download, no secrets.
 */
export const RunnerAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.url({ protocol: /^https$/ }) }),
  z.object({ type: z.literal("inspect"), maxElements: z.int().positive().max(RUNNER_LIMITS.maxElementsPerInspect).default(40) }),
  z.object({
    type: z.literal("click"),
    elementRef: ElementRef,
    /** Required when the click submits a form or causes an external effect. Single use. */
    approvalToken: z.string().min(16).optional(),
  }),
  z.object({ type: z.literal("fill"), elementRef: ElementRef, value: z.string().max(500) }),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]), pixels: z.int().positive().max(5000) }),
  z.object({ type: z.literal("screenshot"), fullPage: z.boolean().default(false) }),
  z.object({ type: z.literal("finish") }),
]);
export type RunnerAction = z.infer<typeof RunnerAction>;

/** POST /jobs/:id/actions */
export const RunnerActionRequest = z.object({
  /** Idempotency key. Re-sending the same actionId returns the stored result and does NOT re-execute. */
  actionId: Id,
  stepIndex: z.int().nonnegative(),
  action: RunnerAction,
});
export type RunnerActionRequest = z.infer<typeof RunnerActionRequest>;

// ───────────────────────── Observations ─────────────────────────

export const VisibleElement = z.object({
  ref: ElementRef,
  role: z.string(),
  name: z.string().max(200),
  tag: z.string(),
  text: z.string().max(300),
  href: z.string().nullable(),
  inputType: z.string().nullable(),
  /** Host the click would navigate to or submit to, if determinable. Lets policy reject before dispatch. */
  targetHost: z.string().nullable(),
});

/** Why a page could not be used. These are stopping conditions, never things to bypass (PRD F04). */
export const BlockReason = z.enum([
  "captcha",
  "mfa",
  "login_required",
  "access_denied",
  "http_error",
  "egress_denied",
  "download_blocked",
]);

export const Screenshot = z.object({
  artifactId: Id,
  sha256: Sha256,
  width: z.int().positive(),
  height: z.int().positive(),
  bytes: z.int().positive(),
  mimeType: z.literal("image/png"),
});

/**
 * Everything here is UNTRUSTED page content. The control plane stores it as
 * data and never promotes it to instructions.
 */
export const Observation = z.object({
  url: z.string(),
  title: z.string().max(300),
  httpStatus: z.int().nullable(),
  /** Every URL in the redirect chain, in order. */
  redirectChain: z.array(z.string()),
  /** Hash of URL + visible DOM structure. Used to detect a changed page before approved actions. */
  pageFingerprint: Sha256,
  textExcerpt: z.string().max(RUNNER_LIMITS.maxTextExcerptChars).nullable(),
  textSha256: Sha256.nullable(),
  elements: z.array(VisibleElement).nullable(),
  screenshot: Screenshot.nullable(),
  blocked: z.object({ reason: BlockReason, detail: z.string() }).nullable(),
  /** Requests the egress proxy refused during this step (containment evidence). */
  deniedRequests: z.array(z.object({ url: z.string(), reason: z.string() })),
  capturedAt: Timestamp,
});
export type Observation = z.infer<typeof Observation>;

export const RunnerErrorCode = z.enum([
  "invalid_action",
  "egress_denied",
  "navigation_failed",
  "element_not_found",
  "element_stale",
  "approval_token_invalid",
  "action_timeout",
  "deadline_exceeded",
  "action_limit_reached",
  "screenshot_limit_reached",
  "browser_crashed",
  "job_not_found",
  "job_not_ready",
  "cancelled",
  "internal",
]);

/** 200 from POST /jobs/:id/actions. Policy and execution failures are results, not HTTP errors. */
export const RunnerActionResult = z.object({
  actionId: Id,
  stepIndex: z.int().nonnegative(),
  status: z.enum(["ok", "denied", "failed", "timeout"]),
  observation: Observation.nullable(),
  error: z.object({ code: RunnerErrorCode, message: z.string(), retryable: z.boolean() }).nullable(),
  durationMs: z.int().nonnegative(),
  actionsRemaining: z.int().nonnegative(),
}).refine((r) => (r.status === "ok") === (r.error === null), {
  message: "error must be set exactly when status is not ok",
});
export type RunnerActionResult = z.infer<typeof RunnerActionResult>;

// ───────────────────────── Cancel & cleanup ─────────────────────────

/** POST /jobs/:id/cancel → 202 (then poll GET /jobs/:id/cleanup) */
export const RunnerCancelRequest = z.object({ reason: z.enum(["user_cancelled", "deadline", "policy_violation", "budget", "shutdown"]) });

/**
 * GET /jobs/:id/cleanup. Also returned by POST /jobs/:id/finish.
 * The run only reaches CLEANED when the runner has VERIFIED absence (PRD §15).
 */
export const CleanupReport = z.object({
  jobId: Id,
  status: z.enum(["pending", "cleaned", "cleanup_failed"]),
  containerId: z.string().nullable(),
  containerRemoved: z.boolean(),
  volumeRemoved: z.boolean(),
  verifiedAt: Timestamp.nullable(),
  actionsExecuted: z.int().nonnegative(),
  screenshotsTaken: z.int().nonnegative(),
  /** All egress denials across the whole job. */
  deniedRequests: z.array(z.object({ url: z.string(), reason: z.string(), at: Timestamp })),
  detail: z.string().nullable(),
}).refine((c) => c.status !== "cleaned" || (c.containerRemoved && c.volumeRemoved && c.verifiedAt !== null), {
  message: "cleaned requires container and volume removed and a verification time",
});
export type CleanupReport = z.infer<typeof CleanupReport>;

/** Non-2xx body from the runner daemon (auth failure, malformed request, unknown job). */
export const RunnerHttpError = z.object({
  code: RunnerErrorCode.or(z.enum(["unauthorized", "bad_request", "busy"])),
  message: z.string(),
});
