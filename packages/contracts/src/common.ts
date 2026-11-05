import { z } from "zod";

/** Contract version. Bump minor for additive changes, major for breaking ones. */
export const CONTRACT_VERSION = "0.1.1";

export const Id = z.string().min(1).max(128);
export const Timestamp = z.iso.datetime({ offset: true });
export const HttpsUrl = z.url({ protocol: /^https?$/ });
export const Sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/, "expected sha256:<64 hex chars>");
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code, e.g. USD");

/** Money is always integer minor units (cents). Never floats. */
export const Money = z.object({
  amountMinor: z.int().nonnegative(),
  currency: CurrencyCode,
});
export type Money = z.infer<typeof Money>;

/**
 * A price that may be unknown. Unknown prices stay unknown: they are never
 * counted as zero in totals (PRD F01).
 */
export const Price = z.discriminatedUnion("known", [
  z.object({ known: z.literal(true), amountMinor: z.int().nonnegative(), currency: CurrencyCode }),
  z.object({ known: z.literal(false), reason: z.string().min(1) }),
]);
export type Price = z.infer<typeof Price>;

/** Lifecycle of a comparison run (PRD §15). Every path ends in CLEANING → CLEANED | CLEANUP_FAILED. */
export const RunStatus = z.enum([
  "CREATED",
  "QUEUED",
  "PREPARING",
  "RUNNING",
  "AWAITING_APPROVAL",
  "VERIFYING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "CLEANING",
  "CLEANED",
  "CLEANUP_FAILED",
]);
export type RunStatus = z.infer<typeof RunStatus>;

/**
 * Execution outcome, stored separately from lifecycle status so a cleanup
 * error cannot hide a completed test (PRD §15).
 */
export const RunOutcome = z.enum(["pending", "succeeded", "partial", "failed", "timed_out", "cancelled"]);
export type RunOutcome = z.infer<typeof RunOutcome>;

/** User-facing timeline stage (PRD Flow A). */
export const RunStage = z.enum(["planning", "researching", "testing", "verifying", "reporting", "done"]);
export type RunStage = z.infer<typeof RunStage>;

/**
 * How we know something about a tool (PRD §6 "critical scope distinction").
 * The UI must label these differently.
 */
export const AccessMode = z.enum(["researched", "tested_integration", "tested_owned_demo"]);
export type AccessMode = z.infer<typeof AccessMode>;

/** What kind of fact an evidence item supports (PRD F07, F08). */
export const EvidenceKind = z.enum(["vendor_claim", "observed_behavior", "executed_test", "user_input"]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const ExtractionMethod = z.enum(["dom", "vision", "api", "manual"]);

export const ErrorCode = z.enum([
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_conflict",
  "budget_exceeded",
  "quota_exceeded",
  "rate_limited",
  "inference_unavailable",
  "inference_invalid_output",
  "runner_unavailable",
  "runner_timeout",
  "policy_denied",
  "approval_required",
  "approval_expired",
  "approval_invalid",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Every non-2xx API response body, and every `error` run event. */
export const ApiError = z.object({
  code: ErrorCode,
  /** Human-readable, safe to show the user. Says what went wrong and what to do. */
  message: z.string().min(1),
  correlationId: Id,
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;
