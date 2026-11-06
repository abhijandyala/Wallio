"use client";

import { useEffect, useState } from "react";
import type {
  Accepted,
  ApiError,
  ApprovalIntent,
  CatalogTool,
  ComparisonRequest,
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
};

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
