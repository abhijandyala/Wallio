import type { ErrorCode } from "@wallio/contracts";

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  budget_exceeded: 402,
  quota_exceeded: 429,
  rate_limited: 429,
  inference_unavailable: 503,
  inference_invalid_output: 502,
  runner_unavailable: 503,
  runner_timeout: 504,
  policy_denied: 403,
  approval_required: 409,
  approval_expired: 410,
  approval_invalid: 409,
  internal: 500,
};

const RETRYABLE = new Set<ErrorCode>(["rate_limited", "inference_unavailable", "runner_unavailable", "runner_timeout", "internal"]);

/** Throw from any handler; the app turns it into an ApiError response with a correlation ID. */
export class HttpError extends Error {
  override name = "HttpError";
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
  toBody(correlationId: string) {
    return {
      code: this.code,
      message: this.message,
      correlationId,
      retryable: RETRYABLE.has(this.code),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export const notFound = (what: string) => new HttpError("not_found", `${what} was not found.`);
