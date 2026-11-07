"use client";

import type {
  Accepted,
  ApiError,
  ApprovalIntent,
  CatalogTool,
  ApiSubscription,
  ComparisonRequest,
  Decision,
  DecisionLogEntry,
  DecisionRequest,
  DecisionsOverview,
  Evidence,
  Health,
  InventoryResponse,
  ProfileVersion,
  ProfileVersionInput,
  SubscriptionInput,
  Recommendation,
  Run,
} from "./contract";

/**
 * Calls to the Wallio API. Everything goes to /api on this site (see app/api/[...path]/route.ts),
 * so the guest-session cookie is first-party. Errors come back as the API's own ApiError body.
 */

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { accept: "application/json", ...(init?.json !== undefined ? { "content-type": "application/json" } : {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "message" in body
        ? (body as ApiError)
        : { code: "internal", message: `The Wallio API answered ${res.status}.` };
    throw new ApiFailure(res.status, err);
  }
  return body as T;
}

const key = () => crypto.randomUUID();

export const api = {
  health: () => call<Health>("/api/health"),
  catalog: () => call<CatalogTool[]>("/api/catalog"),
  profile: () => call<ProfileVersion>("/api/profile"),
  startComparison: (req: Omit<ComparisonRequest, "idempotencyKey">) =>
    call<Accepted>("/api/comparisons", { json: { idempotencyKey: key(), ...req } }),
  startContainment: () => call<Accepted>("/api/containment-runs", { json: { idempotencyKey: key() } }),
  startTrialRequest: (recommendationId: string, toolId: string) =>
    call<Accepted>("/api/trial-requests", { json: { idempotencyKey: key(), recommendationId, toolId } }),
  run: (id: string) => call<Run>(`/api/runs/${id}`),
  cancel: (id: string) => call<Run>(`/api/runs/${id}/cancel`, { json: {} }),
  recommendation: (id: string) => call<Recommendation>(`/api/recommendations/${id}`),
  evidence: (id: string) => call<Evidence>(`/api/evidence/${id}`),
  screenshotUrl: (id: string) => `/api/evidence/${id}/screenshot`,
  approval: (id: string) => call<ApprovalIntent>(`/api/approvals/${id}`),
  decide: (id: string, decision: "approve" | "decline", intentHash: string) =>
    call<ApprovalIntent>(`/api/approvals/${id}/decision`, { json: { decision, intentHash } }),
  // My AI
  inventory: () => call<InventoryResponse>("/api/inventory"),
  addSubscription: (input: SubscriptionInput) => call<ApiSubscription>("/api/inventory", { json: input }),
  updateSubscription: (id: string, patch: Partial<SubscriptionInput> & { status?: ApiSubscription["status"] }) =>
    call<ApiSubscription>(`/api/inventory/${id}`, { method: "PATCH", json: patch }),
  saveProfile: (input: ProfileVersionInput) => call<ProfileVersion>("/api/profile/versions", { json: input }),
  // Decisions (v0.3)
  decisions: () => call<DecisionsOverview>("/api/decisions"),
  recordDecision: (req: DecisionRequest) => call<Decision>("/api/decisions", { json: req }),
  defer: (recommendationId: string, body: { until?: string; reason?: string } = {}) =>
    call<Decision>(`/api/recommendations/${recommendationId}/defer`, { json: body }),
  dismiss: (recommendationId: string, reason?: string) =>
    call<Decision>(`/api/recommendations/${recommendationId}/dismiss`, { json: reason ? { reason } : {} }),
  outcome: (decisionId: string, result: "helped" | "no_change") =>
    call<DecisionLogEntry>(`/api/decisions/${decisionId}/outcome`, { json: { result } }),
};

/** "in 40 seconds", "in about 12 minutes", "in about an hour". Retry-After can be close to 3600. */
export function waitPhrase(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s < 60) return `in ${s} second${s === 1 ? "" : "s"}`;
  if (s < 55 * 60) {
    const m = Math.ceil(s / 60);
    return `in about ${m} minute${m === 1 ? "" : "s"}`;
  }
  return "in about an hour";
}

/**
 * The API's own error as a sentence a person can act on. The API's messages are already
 * written for people; rate limits get a readable wait instead of a raw number of seconds.
 */
export function explainApiError(err: ApiError, status?: number): string {
  const { code, message, details } = err;
  if (code === "rate_limited" || (status === 429 && code !== "quota_exceeded")) {
    const wait = Number(details?.retryAfterSeconds);
    // Drop the API's own "try again later" (also ", or try again later") and say when instead.
    let what = message.replace(/[,;]?\s*(?:or\s+)?try again[^.]*\.?\s*$/i, "").trim() || "Too many requests";
    if (!/[.!?]$/.test(what)) what += ".";
    return Number.isFinite(wait) && wait > 0 ? `${what} Try again ${waitPhrase(wait)}.` : `${what} Try again in a moment.`;
  }
  if (code === "quota_exceeded" && typeof details?.limit === "number") {
    const n = details.limit;
    return `This workspace has used all ${n} ${n === 1 ? "run" : "runs"} for today. More open up at midnight UTC.`;
  }
  return message || "Something went wrong.";
}

/** Any failed call as a sentence: API errors via explainApiError, a dropped network plainly. */
export function explainFailure(e: unknown): string {
  if (e instanceof ApiFailure) return explainApiError(e.error, e.status);
  if (e instanceof TypeError) return "Can't reach the Wallio API. Check your connection and try again.";
  return e instanceof Error ? e.message : "Something went wrong.";
}

/** A finished run that didn't succeed, as a sentence; null when it worked. */
export function explainRun(run: Run): string | null {
  if (run.outcome === "succeeded" || run.outcome === "partial") return null;
  if (run.error) return explainApiError(run.error);
  if (run.outcome === "cancelled") return "The run was cancelled.";
  if (run.outcome === "timed_out") return "The run took too long and was stopped. Nothing was left running.";
  if (run.outcome === "failed") return "The run failed. Nothing was left running.";
  return null;
}

/** The run that's already going, when a start was refused with 409 conflict. */
export function activeRunId(e: unknown): string | null {
  if (!(e instanceof ApiFailure) || e.error.code !== "conflict") return null;
  const id = e.error.details?.runId;
  return typeof id === "string" ? id : null;
}

/** Forget this browser's guest workspace. The next API call starts a fresh one. */
export async function resetGuestSession(): Promise<void> {
  await fetch("/session/reset", { method: "POST" });
}

