/**
 * UI ↔ API contract (Anish ↔ UI owner).
 * Endpoints are listed in docs/CONTRACTS.md. All bodies are JSON.
 */
import { z } from "zod";
import {
  AccessMode,
  ApiError,
  CurrencyCode,
  EvidenceKind,
  ExtractionMethod,
  HttpsUrl,
  Id,
  Money,
  Price,
  RunOutcome,
  RunStage,
  RunStatus,
  Sha256,
  Timestamp,
} from "./common.ts";

// ───────────────────────── Catalog & inventory ─────────────────────────

export const Claim = z.object({
  id: Id,
  text: z.string().min(1),
  /** Unknown means we have no evidence either way. Never assume present or absent. */
  status: z.enum(["supported", "contradicted", "unknown"]),
  evidenceIds: z.array(Id),
  capturedAt: Timestamp.nullable(),
});

export const CatalogTool = z.object({
  id: Id,
  name: z.string().min(1),
  provider: z.string().min(1),
  category: z.string().min(1),
  homepageUrl: HttpsUrl,
  pricingUrl: HttpsUrl.nullable(),
  claims: z.array(Claim),
  reviewStatus: z.enum(["curated", "pending_review"]),
});
export type CatalogTool = z.infer<typeof CatalogTool>;

export const BillingCadence = z.enum(["monthly", "annual", "usage_based", "free"]);

export const Subscription = z.object({
  id: Id,
  toolId: Id,
  plan: z.string().min(1),
  price: Price,
  cadence: BillingCadence,
  seats: z.int().positive(),
  renewalDate: z.iso.date().nullable(),
  taxIncluded: z.boolean().nullable(),
  /** Where the figure came from. Shown next to every number (PRD F01). */
  source: z.enum(["user_entered", "imported", "seed"]),
  status: z.enum(["active", "paused", "archived"]),
  lastVerifiedAt: Timestamp.nullable(),
});
export type Subscription = z.infer<typeof Subscription>;

/** Fields the client may send on POST /api/inventory (server assigns id, status, lastVerifiedAt). */
export const SubscriptionInput = Subscription.omit({ id: true, status: true, lastVerifiedAt: true, source: true });

/** Computed server-side, deterministically. The UI never does billing arithmetic. */
export const InventorySummary = z.object({
  currency: CurrencyCode,
  /** Sum of known monthly equivalents (annual ÷ 12, × seats). Null if every price is unknown. */
  knownMonthlyEquivalentMinor: z.int().nonnegative().nullable(),
  unknownPriceCount: z.int().nonnegative(),
  upcomingRenewals: z.array(z.object({ subscriptionId: Id, renewalDate: z.iso.date(), amount: Money })),
  calculationVersion: z.string().min(1),
  computedAt: Timestamp,
});

export const InventoryResponse = z.object({
  subscriptions: z.array(Subscription),
  tools: z.array(CatalogTool),
  summary: InventorySummary,
});
export type InventoryResponse = z.infer<typeof InventoryResponse>;

// ───────────────────────── Profile ─────────────────────────

export const ProfileAttribute = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  origin: z.enum(["user_stated", "inferred"]),
  /** Required when origin is "inferred". */
  source: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  confirmed: z.boolean(),
  updatedAt: Timestamp,
}).refine((a) => a.origin === "user_stated" || (a.source !== null && a.confidence !== null), {
  message: "inferred attributes need a source and confidence band",
});

export const Workflow = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string(),
  priority: z.int().min(1).max(3),
});

export const ProfileVersionInput = z.object({
  primaryRole: z.string().min(1),
  workflows: z.array(Workflow).min(1).max(3),
  budget: z.object({ currency: CurrencyCode, maxMonthlyMinor: z.int().nonnegative() }),
  deploymentPreference: z.enum(["local", "cloud", "either"]),
  dataSensitivity: z.enum(["low", "medium", "high"]),
  willingnessToSwitch: z.enum(["low", "medium", "high"]),
  requiredIntegrations: z.array(z.string()),
  attributes: z.array(ProfileAttribute),
});

export const ProfileVersion = ProfileVersionInput.extend({
  id: Id,
  version: z.int().positive(),
  createdAt: Timestamp,
});
export type ProfileVersion = z.infer<typeof ProfileVersion>;

// ───────────────────────── Comparisons & runs ─────────────────────────

export const ScoreWeights = z.object({
  quality: z.number().min(0).max(1),
  fit: z.number().min(0).max(1),
  cost: z.number().min(0).max(1),
  privacy: z.number().min(0).max(1),
  switching: z.number().min(0).max(1),
}).refine((w) => Math.abs(w.quality + w.fit + w.cost + w.privacy + w.switching - 1) < 1e-6, {
  message: "weights must sum to 1",
});

/** Default weights from PRD §10. */
export const DEFAULT_WEIGHTS = { quality: 0.4, fit: 0.2, cost: 0.15, privacy: 0.15, switching: 0.1 } as const;

/** POST /api/comparisons */
export const ComparisonRequest = z.object({
  /** Client-generated UUID. Same key + same body returns the same run; different body → idempotency_conflict. */
  idempotencyKey: z.uuid(),
  profileVersionId: Id,
  workflowId: Id,
  taskId: Id,
  incumbentToolId: Id,
  candidateToolIds: z.array(Id).min(1).max(2),
  weights: ScoreWeights.optional(),
  /** Execution spend cap for this run (inference + runner). Server also enforces its own ceiling. */
  spendCapMinor: z.int().positive().optional(),
});
export type ComparisonRequest = z.infer<typeof ComparisonRequest>;

/** What a run does. Trial requests and containment runs are created by their own endpoints. */
export const RunKind = z.enum(["comparison", "trial_request", "containment"]);
export type RunKind = z.infer<typeof RunKind>;

/**
 * POST /api/trial-requests. Prepares a SYNTHETIC trial request on Wallio's own form
 * (forms.<domain>) for a candidate from a recommendation. Nothing is submitted until
 * the user approves the exact intent; no vendor ever receives it.
 */
export const TrialRequestCreate = z.object({
  idempotencyKey: z.uuid(),
  recommendationId: Id,
  toolId: Id,
});
export type TrialRequestCreate = z.infer<typeof TrialRequestCreate>;

/** POST /api/containment-runs. Opens Wallio's own hostile test page in the isolated browser. */
export const ContainmentRunCreate = z.object({ idempotencyKey: z.uuid() });
export type ContainmentRunCreate = z.infer<typeof ContainmentRunCreate>;

/** 202 Accepted from POST /api/comparisons, /api/trial-requests and /api/containment-runs */
export const ComparisonAccepted = z.object({
  runId: Id,
  status: z.literal("QUEUED"),
  eventsUrl: z.string().startsWith("/api/runs/"),
  statusUrl: z.string().startsWith("/api/runs/"),
});

/** GET /api/runs/:id */
export const Run = z.object({
  id: Id,
  kind: RunKind,
  /** Ties the run's request, runner jobs, model calls, evidence, approvals and logs together. Quote it in support requests. */
  correlationId: Id,
  status: RunStatus,
  outcome: RunOutcome,
  stage: RunStage,
  cleanup: z.enum(["not_started", "pending", "cleaned", "failed"]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deadlineAt: Timestamp,
  /** Last event seq. Reconnect SSE with Last-Event-ID to resume after this. */
  lastEventSeq: z.int().nonnegative(),
  coverage: z.object({
    evidenceCount: z.int().nonnegative(),
    candidatesResearched: z.int().nonnegative(),
    candidatesTested: z.int().nonnegative(),
  }),
  spend: z.object({
    currency: CurrencyCode,
    reservedMinor: z.int().nonnegative(),
    actualMinor: z.int().nonnegative(),
    capMinor: z.int().positive(),
  }),
  pendingApprovalId: Id.nullable(),
  recommendationId: Id.nullable(),
  error: ApiError.nullable(),
});
export type Run = z.infer<typeof Run>;

// ───────────────────────── Run events (SSE) ─────────────────────────

const EventBase = z.object({
  runId: Id,
  /** Strictly increasing per run, starts at 1. Used as SSE `id:`. */
  seq: z.int().positive(),
  ts: Timestamp,
  stage: RunStage,
  /** One short line, safe to show the user. Never contains tokens or secrets. */
  message: z.string().min(1).max(300),
});

export const RunEvent = z.discriminatedUnion("type", [
  EventBase.extend({ type: z.literal("status_changed"), data: z.object({ from: RunStatus, to: RunStatus }) }),
  EventBase.extend({ type: z.literal("stage_changed"), data: z.object({ from: RunStage, to: RunStage }) }),
  EventBase.extend({
    type: z.literal("step"),
    data: z.object({
      stepIndex: z.int().nonnegative(),
      maxSteps: z.int().positive(),
      actionType: z.string(),
      url: HttpsUrl.nullable(),
      candidateToolId: Id.nullable(),
    }),
  }),
  EventBase.extend({
    type: z.literal("evidence_captured"),
    data: z.object({ evidenceId: Id, kind: EvidenceKind, url: HttpsUrl.nullable(), candidateToolId: Id.nullable() }),
  }),
  EventBase.extend({
    type: z.literal("inference_call"),
    data: z.object({ purpose: z.enum(["plan", "extract", "verify", "explain", "task"]), model: z.string(), latencyMs: z.int().nonnegative(), ok: z.boolean() }),
  }),
  EventBase.extend({
    type: z.literal("policy_denied"),
    data: z.object({ attemptedAction: z.string(), target: z.string(), reason: z.string() }),
  }),
  EventBase.extend({ type: z.literal("approval_required"), data: z.object({ approvalId: Id }) }),
  EventBase.extend({
    type: z.literal("approval_resolved"),
    data: z.object({ approvalId: Id, result: z.enum(["approved", "declined", "expired", "invalidated"]) }),
  }),
  /** Trial request: what happened to the approved action. "simulated" only in demo playback. */
  EventBase.extend({
    type: z.literal("action_result"),
    data: z.object({ approvalId: Id, result: z.enum(["submitted", "uncertain", "refused", "simulated"]), evidenceId: Id.nullable() }),
  }),
  /** Containment run summary. sentinel is null when the sentinel couldn't be read (or in demo playback). */
  EventBase.extend({
    type: z.literal("containment_result"),
    data: z.object({
      contained: z.boolean(),
      deniedRequests: z.int().nonnegative(),
      refusedActions: z.int().nonnegative(),
      sentinel: z.object({ before: z.int().nonnegative(), after: z.int().nonnegative() }).nullable(),
      cleanupVerified: z.boolean(),
      evidenceId: Id.nullable(),
    }),
  }),
  EventBase.extend({ type: z.literal("warning"), data: z.object({ detail: z.string() }) }),
  EventBase.extend({ type: z.literal("error"), data: z.object({ error: ApiError }) }),
  EventBase.extend({ type: z.literal("result_ready"), data: z.object({ recommendationId: Id, outcome: RunOutcome }) }),
  EventBase.extend({
    type: z.literal("cleanup"),
    data: z.object({ result: z.enum(["cleaned", "failed"]), containerRemoved: z.boolean(), volumeRemoved: z.boolean() }),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

// ───────────────────────── Evidence ─────────────────────────

/** GET /api/evidence/:id (metadata). Screenshot bytes via GET /api/evidence/:id/screenshot after ownership check. */
export const Evidence = z.object({
  id: Id,
  runId: Id.nullable(),
  kind: EvidenceKind,
  candidateToolId: Id.nullable(),
  accessMode: AccessMode.nullable(),
  url: HttpsUrl.nullable(),
  canonicalUrl: HttpsUrl.nullable(),
  capturedAt: Timestamp,
  contentHash: Sha256.nullable(),
  hasScreenshot: z.boolean(),
  extractionMethod: ExtractionMethod,
  /** Short quoted text the claim rests on (bounded, redacted). */
  excerpt: z.string().max(2000),
  /** What this evidence does NOT prove. Required. */
  limitation: z.string().min(1),
});
export type Evidence = z.infer<typeof Evidence>;

// ───────────────────────── Recommendation ─────────────────────────

export const RecommendationAction = z.enum([
  "keep",
  "try",
  "compare_further",
  "replace_after_validation",
  "review_renewal",
  "no_action",
]);

/**
 * Every factual statement must cite evidence or a user input (PRD F08).
 * The backend validator rejects model output that breaks this before storing.
 */
export const Statement = z.object({
  text: z.string().min(1),
  role: z.enum(["supporting", "counter", "uncertainty", "next_step"]),
  evidenceIds: z.array(Id),
  /** Profile attribute keys or subscription IDs the statement relies on. */
  userInputRefs: z.array(z.string()),
}).refine((s) => s.role === "next_step" || s.evidenceIds.length + s.userInputRefs.length > 0, {
  message: "factual statements need at least one evidenceId or userInputRef",
});

const ScoreComponent = z.object({
  /** null = unknown. Never substitute a favourable value. */
  value: z.number().min(0).max(1).nullable(),
  weight: z.number().min(0).max(1),
  evidenceIds: z.array(Id),
});

export const CandidateAssessment = z.object({
  toolId: Id,
  role: z.enum(["incumbent", "candidate"]),
  accessMode: AccessMode,
  hardConstraints: z.object({ passed: z.boolean(), failures: z.array(z.string()) }),
  score: z.object({
    /** With unknown components, total is an interval [min, max]. */
    min: z.number().min(0).max(1),
    max: z.number().min(0).max(1),
    components: z.object({
      quality: ScoreComponent,
      fit: ScoreComponent,
      cost: ScoreComponent,
      privacy: ScoreComponent,
      switching: ScoreComponent,
    }),
  }).nullable(),
  known: z.array(z.string()),
  missing: z.array(z.string()),
  needsTesting: z.array(z.string()),
  testResult: z.object({
    evidenceId: Id,
    passed: z.int().nonnegative(),
    attempts: z.int().positive(),
    medianLatencyMs: z.int().nonnegative().nullable(),
  }).nullable(),
});

export const SpendingScenario = z.object({
  label: z.string(),
  /** Change in monthly equivalent cost. Negative = cheaper. Null if a needed price is unknown. */
  monthlyEquivalentDeltaMinor: z.int().nullable(),
  /** Cash saved now. 0 for annual prepaid plans (no refund claims). */
  immediateCashSavingMinor: z.int().nonnegative(),
  /** Avoided at next renewal, shown separately from immediate cash. */
  renewalAvoidanceMinor: z.int().nonnegative().nullable(),
  assumptions: z.array(z.string()).min(1),
});

/** GET /api/recommendations/:id */
export const Recommendation = z.object({
  id: Id,
  runId: Id,
  profileVersionId: Id,
  calculationVersion: z.string(),
  createdAt: Timestamp,
  goal: z.string(),
  action: RecommendationAction,
  targetToolId: Id.nullable(),
  headline: z.string().max(160),
  statements: z.array(Statement).min(1),
  candidates: z.array(CandidateAssessment).min(1),
  spending: z.object({ currency: CurrencyCode, scenarios: z.array(SpendingScenario) }),
  confidence: z.enum(["low", "medium", "high"]),
  limitations: z.array(z.string()).min(1),
  evidence: z.array(Evidence),
}).superRefine((rec, ctx) => {
  // Every cited evidence ID must be shipped with the recommendation, so the UI can always open it.
  const known = new Set(rec.evidence.map((e) => e.id));
  const cited = [
    ...rec.statements.flatMap((s) => s.evidenceIds),
    ...rec.candidates.flatMap((c) =>
      c.score ? Object.values(c.score.components).flatMap((k) => k.evidenceIds) : [],
    ),
    ...rec.candidates.flatMap((c) => (c.testResult ? [c.testResult.evidenceId] : [])),
  ];
  for (const id of new Set(cited)) {
    if (!known.has(id)) ctx.addIssue({ code: "custom", message: `cited evidence "${id}" is missing from evidence[]` });
  }
});
export type Recommendation = z.infer<typeof Recommendation>;

// ───────────────────────── Approvals ─────────────────────────

/** GET /api/approvals/:id. What the user sees before approving (PRD Flow E). */
export const ApprovalIntent = z.object({
  id: Id,
  runId: Id,
  actionType: z.enum(["submit_form"]),
  targetOrigin: HttpsUrl,
  targetUrl: HttpsUrl,
  fields: z.array(z.object({ name: z.string(), label: z.string(), value: z.string() })),
  consequence: z.string().min(1),
  screenshotEvidenceId: Id,
  /** sha256 of the canonical intent. Client echoes it back so approval binds to exactly what was shown. */
  intentHash: Sha256,
  createdAt: Timestamp,
  expiresAt: Timestamp,
  status: z.enum(["pending", "approved", "declined", "expired", "consumed", "invalidated"]),
});
export type ApprovalIntent = z.infer<typeof ApprovalIntent>;

/** POST /api/approvals/:id/decision */
export const ApprovalDecisionRequest = z.object({
  decision: z.enum(["approve", "decline"]),
  intentHash: Sha256,
});

export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequest>;

// ───────────────────────── Decisions ─────────────────────────

/** POST /api/decisions */
export const DecisionRequest = z.object({
  recommendationId: Id,
  choice: z.enum(["accept", "dismiss", "defer", "disagree"]),
  reason: z.string().max(1000).optional(),
  reviewDate: z.iso.date().optional(),
});

export const Decision = DecisionRequest.extend({
  id: Id,
  profileVersionId: Id,
  evidenceSnapshotIds: z.array(Id),
  createdAt: Timestamp,
});
export type Decision = z.infer<typeof Decision>;

/** POST /api/recommendations/:id/defer. Hides it until `until` (default: 14 days from today). */
export const DeferRequest = z.object({
  until: z.iso.date().optional(),
  reason: z.string().max(1000).optional(),
});
export type DeferRequest = z.infer<typeof DeferRequest>;

/** POST /api/recommendations/:id/dismiss */
export const DismissRequest = z.object({ reason: z.string().max(1000).optional() });
export type DismissRequest = z.infer<typeof DismissRequest>;

/** POST /api/decisions/:id/outcome. The check-in answer, for accepted recommendations only. */
export const DecisionOutcomeRequest = z.object({ result: z.enum(["helped", "no_change"]) });
export type DecisionOutcomeRequest = z.infer<typeof DecisionOutcomeRequest>;

/** One line of the decision history: the latest decision on a recommendation. */
export const DecisionLogEntry = z.object({
  /** The decision's id (use it for POST /api/decisions/:id/outcome). */
  id: Id,
  recommendationId: Id,
  runId: Id,
  choice: z.enum(["accept", "dismiss", "disagree"]),
  action: RecommendationAction,
  targetToolId: Id.nullable(),
  targetToolName: z.string().nullable(),
  headline: z.string(),
  decidedAt: Timestamp,
  /** When Wallio asks whether it helped. Accepted decisions only. */
  checkInOn: z.iso.date().nullable(),
  /** `pending` until the user answers the check-in; null when there is nothing to check (dismissed, disagreed). */
  result: z.enum(["helped", "no_change", "pending"]).nullable(),
  resultAt: Timestamp.nullable(),
  /**
   * The recommendation's own estimate: 12 × the monthly saving of its first scenario with a known,
   * negative monthly change. Null if accepted-but-unknown or not accepted. An estimate, never a measured saving.
   */
  estimatedAnnualSavingMinor: z.int().nonnegative().nullable(),
});
export type DecisionLogEntry = z.infer<typeof DecisionLogEntry>;

/** GET /api/decisions: everything the Decisions page shows, for this workspace only. */
export const DecisionsOverview = z.object({
  /** Approvals still waiting on the user (pending and unexpired), newest first. */
  approvals: z.array(ApprovalIntent),
  /** Recommendations with no decision yet, or deferred until today or earlier. Newest first, at most 20. */
  recommendations: z.array(Recommendation),
  /** Recommendations deferred to a future date. */
  deferred: z.array(z.object({ recommendationId: Id, headline: z.string(), until: z.iso.date() })),
  /** Latest decision per recommendation (except deferrals), newest first, at most 50. */
  history: z.array(DecisionLogEntry),
});
export type DecisionsOverview = z.infer<typeof DecisionsOverview>;

export { ApiError };
