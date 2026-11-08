/**
 * Types for the Wallio API responses this connector reads. A copy of web/src/lib/api/contract.ts
 * (which mirrors packages/contracts/src/api.ts); kept separate so the connector has no dependency on web/.
 * Type-only: nothing here exists at runtime.
 */

export type RunStage = "planning" | "researching" | "testing" | "verifying" | "reporting" | "done";
export type RunOutcome = "pending" | "succeeded" | "partial" | "failed" | "timed_out" | "cancelled";
export type RunStatus =
  | "CREATED"
  | "QUEUED"
  | "PREPARING"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "VERIFYING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT"
  | "CANCELLED"
  | "CLEANING"
  | "CLEANED"
  | "CLEANUP_FAILED"
  | (string & {});
export type AccessMode = "researched" | "tested_integration" | "tested_owned_demo";
export type EvidenceKind = "vendor_claim" | "observed_behavior" | "executed_test" | "user_input";
export type RunKind = "comparison" | "trial_request" | "containment";

export interface ApiError {
  code: string;
  message: string;
  correlationId?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export interface Health {
  ok: boolean;
  runMode: "mock" | "live" | (string & {});
}

export interface CatalogTool {
  id: string;
  name: string;
  provider: string;
  category: string;
  homepageUrl: string;
  pricingUrl: string | null;
}

export interface ProfileAttribute {
  key: string;
  value: string | number | boolean | string[];
  origin: "user_stated" | "inferred";
  /** Required when origin is "inferred". */
  source: string | null;
  confidence: "low" | "medium" | "high" | null;
  confirmed: boolean;
  updatedAt: string;
}

/** POST /api/profile/versions body. Every save is a new version. */
export interface ProfileVersionInput {
  primaryRole: string;
  /** 1 to 3. */
  workflows: { id: string; name: string; description: string; priority: number }[];
  budget: { currency: string; maxMonthlyMinor: number };
  deploymentPreference: "local" | "cloud" | "either";
  dataSensitivity: "low" | "medium" | "high";
  willingnessToSwitch: "low" | "medium" | "high";
  requiredIntegrations: string[];
  attributes: ProfileAttribute[];
}

export interface ProfileVersion extends ProfileVersionInput {
  id: string;
  version: number;
  createdAt: string;
}

// ───────────────────────── Inventory ─────────────────────────

export type Price = { known: true; amountMinor: number; currency: string } | { known: false; reason: string };
export type BillingCadence = "monthly" | "annual" | "usage_based" | "free";

export interface ApiSubscription {
  id: string;
  toolId: string;
  plan: string;
  price: Price;
  cadence: BillingCadence;
  seats: number;
  renewalDate: string | null;
  taxIncluded: boolean | null;
  source: "user_entered" | "imported" | "seed";
  status: "active" | "paused" | "archived";
  lastVerifiedAt: string | null;
}

/** POST /api/inventory body (PATCH takes any part of it, plus status). */
export interface SubscriptionInput {
  toolId: string;
  plan: string;
  price: Price;
  cadence: BillingCadence;
  seats: number;
  renewalDate: string | null;
  taxIncluded: boolean | null;
}

/** Computed by the server. The UI never adds prices up itself. */
export interface InventorySummary {
  currency: string;
  /** Sum of known monthly equivalents. Null if every price is unknown. */
  knownMonthlyEquivalentMinor: number | null;
  unknownPriceCount: number;
  upcomingRenewals: { subscriptionId: string; renewalDate: string; amount: { amountMinor: number; currency: string } }[];
  calculationVersion: string;
  computedAt: string;
}

export interface InventoryResponse {
  subscriptions: ApiSubscription[];
  tools: CatalogTool[];
  summary: InventorySummary;
}

export interface ComparisonRequest {
  idempotencyKey: string;
  profileVersionId: string;
  workflowId: string;
  taskId: string;
  incumbentToolId: string;
  candidateToolIds: string[];
  spendCapMinor?: number;
}

export interface Accepted {
  runId: string;
  status: "QUEUED";
  eventsUrl: string;
  statusUrl: string;
}

export interface Run {
  id: string;
  kind: RunKind;
  correlationId: string;
  status: RunStatus;
  outcome: RunOutcome;
  stage: RunStage;
  cleanup: "not_started" | "pending" | "cleaned" | "failed";
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  lastEventSeq: number;
  coverage: { evidenceCount: number; candidatesResearched: number; candidatesTested: number };
  spend: { currency: string; reservedMinor: number; actualMinor: number; capMinor: number };
  pendingApprovalId: string | null;
  recommendationId: string | null;
  error: ApiError | null;
}

type Base<T extends string, D> = {
  runId: string;
  seq: number;
  ts: string;
  stage: RunStage;
  message: string;
  type: T;
  data: D;
};

export type RunEvent =
  | Base<"status_changed", { from: RunStatus; to: RunStatus }>
  | Base<"stage_changed", { from: RunStage; to: RunStage }>
  | Base<"step", { stepIndex: number; maxSteps: number; actionType: string; url: string | null; candidateToolId: string | null }>
  | Base<"evidence_captured", { evidenceId: string; kind: EvidenceKind; url: string | null; candidateToolId: string | null }>
  | Base<"inference_call", { purpose: "plan" | "extract" | "verify" | "explain" | "task"; model: string; latencyMs: number; ok: boolean }>
  | Base<"policy_denied", { attemptedAction: string; target: string; reason: string }>
  | Base<"approval_required", { approvalId: string }>
  | Base<"approval_resolved", { approvalId: string; result: "approved" | "declined" | "expired" | "invalidated" }>
  | Base<"action_result", { approvalId: string; result: "submitted" | "uncertain" | "refused" | "simulated"; evidenceId: string | null }>
  | Base<
      "containment_result",
      {
        contained: boolean;
        deniedRequests: number;
        refusedActions: number;
        sentinel: { before: number; after: number } | null;
        cleanupVerified: boolean;
        evidenceId: string | null;
      }
    >
  | Base<"warning", { detail: string }>
  | Base<"error", { error: ApiError }>
  | Base<"result_ready", { recommendationId: string; outcome: RunOutcome }>
  | Base<"cleanup", { result: "cleaned" | "failed"; containerRemoved: boolean; volumeRemoved: boolean }>;

export interface Evidence {
  id: string;
  runId: string | null;
  kind: EvidenceKind;
  candidateToolId: string | null;
  accessMode: AccessMode | null;
  url: string | null;
  canonicalUrl: string | null;
  capturedAt: string;
  contentHash: string | null;
  hasScreenshot: boolean;
  extractionMethod: "dom" | "vision" | "api" | "manual";
  excerpt: string;
  limitation: string;
}

export type RecommendationAction =
  | "keep"
  | "try"
  | "compare_further"
  | "replace_after_validation"
  | "review_renewal"
  | "no_action";

export interface Statement {
  text: string;
  role: "supporting" | "counter" | "uncertainty" | "next_step";
  evidenceIds: string[];
  userInputRefs: string[];
}

export interface CandidateAssessment {
  toolId: string;
  role: "incumbent" | "candidate";
  accessMode: AccessMode;
  hardConstraints: { passed: boolean; failures: string[] };
  score: { min: number; max: number } | null;
  known: string[];
  missing: string[];
  needsTesting: string[];
  testResult: { evidenceId: string; passed: number; attempts: number; medianLatencyMs: number | null } | null;
}

export interface SpendingScenario {
  label: string;
  monthlyEquivalentDeltaMinor: number | null;
  immediateCashSavingMinor: number;
  renewalAvoidanceMinor: number | null;
  assumptions: string[];
}

export interface Recommendation {
  id: string;
  runId: string;
  profileVersionId: string;
  createdAt: string;
  goal: string;
  action: RecommendationAction;
  targetToolId: string | null;
  headline: string;
  statements: Statement[];
  candidates: CandidateAssessment[];
  spending: { currency: string; scenarios: SpendingScenario[] };
  confidence: "low" | "medium" | "high";
  limitations: string[];
  evidence: Evidence[];
}

export interface ApprovalIntent {
  id: string;
  runId: string;
  actionType: "submit_form";
  targetOrigin: string;
  targetUrl: string;
  fields: { name: string; label: string; value: string }[];
  consequence: string;
  screenshotEvidenceId: string;
  intentHash: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "declined" | "expired" | "consumed" | "invalidated";
}

// ───────────────────────── Decisions (v0.3) ─────────────────────────

export type DecisionChoice = "accept" | "dismiss" | "defer" | "disagree";

/** POST /api/decisions body. */
export interface DecisionRequest {
  recommendationId: string;
  choice: DecisionChoice;
  reason?: string;
  reviewDate?: string;
}

/** 201 from POST /api/decisions, /api/recommendations/:id/defer and /dismiss. */
export interface Decision extends DecisionRequest {
  id: string;
  profileVersionId: string;
  evidenceSnapshotIds: string[];
  createdAt: string;
}

/** One line of the decision history: the latest decision on a recommendation. */
export interface DecisionLogEntry {
  /** The decision's id (POST /api/decisions/:id/outcome). */
  id: string;
  recommendationId: string;
  runId: string;
  choice: "accept" | "dismiss" | "disagree";
  action: RecommendationAction;
  targetToolId: string | null;
  targetToolName: string | null;
  headline: string;
  decidedAt: string;
  /** When Wallio asks whether it helped. Accepted decisions only. */
  checkInOn: string | null;
  /** `pending` until answered; null when there's nothing to check (dismissed, disagreed). */
  result: "helped" | "no_change" | "pending" | null;
  resultAt: string | null;
  /** The recommendation's own estimate, not a measured saving. Null = unknown: show nothing, never 0. */
  estimatedAnnualSavingMinor: number | null;
}

/** GET /api/decisions */
export interface DecisionsOverview {
  approvals: ApprovalIntent[];
  recommendations: Recommendation[];
  deferred: { recommendationId: string; headline: string; until: string }[];
  history: DecisionLogEntry[];
}
