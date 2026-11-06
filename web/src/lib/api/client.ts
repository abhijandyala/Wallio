"use client";

import { useEffect, useState } from "react";
import type {
  Accepted,
  ApiError,
  ApprovalIntent,
  CatalogTool,
  ComparisonRequest,
  Decision,
  DecisionLogEntry,
  DecisionRequest,
  DecisionsOverview,
  Evidence,
  Health,
  ProfileVersion,
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

/**
 * A sentence a person can act on, for any failed call. Rate limits say when to try again;
 * an offline browser runner says so plainly instead of a raw error.
 */
export function explainFailure(e: unknown): string {
  if (e instanceof ApiFailure) {
    const { code, message, details } = e.error;
    if (code === "rate_limited" || e.status === 429) {
      const wait = Number(details?.retryAfterSeconds);
      return Number.isFinite(wait) && wait > 0
        ? `Too many runs at once. Try again in ${Math.ceil(wait)} second${Math.ceil(wait) === 1 ? "" : "s"}.`
        : "Too many runs at once. Try again in a moment.";
    }
    if (code === "runner_unavailable") {
      return "The sandboxed browser on Vultr isn't available right now, so nothing ran. Try again shortly, or play the recorded run.";
    }
    return message;
  }
  if (e instanceof TypeError) return "Can't reach the Wallio API. Check your connection and try again.";
  return e instanceof Error ? e.message : "Something went wrong.";
}

/** Seconds to wait before retrying, when the API said so (429 rate_limited). */
export function retryAfter(e: unknown): number | null {
  if (!(e instanceof ApiFailure)) return null;
  if (e.error.code !== "rate_limited" && e.status !== 429) return null;
  const wait = Number(e.error.details?.retryAfterSeconds);
  return Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : null;
}

/** Forget this browser's guest workspace. The next API call starts a fresh one. */
export async function resetGuestSession(): Promise<void> {
  await fetch("/session/reset", { method: "POST" });
}

export type ApiStatus =
  | { state: "checking" }
  | { state: "online"; runMode: Health["runMode"] }
  | { state: "offline" };

/** Is the Wallio API reachable, and is it playing demo runs or running live ones? */
export function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    const timeout = AbortSignal.timeout(6000);
    fetch("/api/health", { cache: "no-store", signal: timeout })
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : Promise.reject()))
      .then((h) => alive && setStatus(h.ok ? { state: "online", runMode: h.runMode } : { state: "offline" }))
      .catch(() => alive && setStatus({ state: "offline" }));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
