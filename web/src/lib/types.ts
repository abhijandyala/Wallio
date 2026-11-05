// Proposed UI <-> API contract shapes. Draft for agreement with the backend owner (Anish).
// Field names mirror the PRD data model (section 16). Money is integer cents.

/** Where a fact came from. Every number or claim on screen carries one. */
export type EvidenceKind =
  | "tested" // executed in an owned or authorized evaluation run
  | "researched" // captured from public sources by the browser agent
  | "user_input" // the user told us
  | "sample" // seeded demo data
  | "unknown";

export type DataSource = "manual" | "imported" | "connector" | "sample";

export interface Subscription {
  id: string;
  toolName: string;
  category: string;
  plan: string;
  /** Monthly equivalent in cents, computed by the backend. null = unknown price. */
  monthlyCents: number | null;
  /** Actual renewal charge in cents (e.g. the annual amount). */
  renewalCents: number | null;
  cadence: "monthly" | "annual" | "unknown";
  renewsOn: string | null; // ISO date
  source: DataSource;
  status: "active" | "paused" | "archived";
}

export interface Claim {
  text: string;
  kind: EvidenceKind;
  evidenceIds: string[];
}

export type RecommendedAction =
  | "keep"
  | "try"
  | "compare"
  | "replace_after_validation"
  | "review_renewal"
  | "no_action";

export interface DecisionCard {
  id: string;
  trigger: "renewal" | "update" | "comparison_ready" | "new_match";
  title: string;
  summary: string;
  action: RecommendedAction;
  claims: Claim[];
  /** Estimated benefit, computed by the backend. Always labeled as an estimate. */
  estimatedAnnualSavingsCents: number | null;
  dueOn: string | null;
  primaryCta: string;
  secondaryCta: string;
}

/** One line in the Home inbox. Includes approvals, ready results, and changes that touch a decision. */
export interface InboxItem {
  id: string;
  kind: "approval" | "comparison_ready" | "update";
  title: string;
  /** Short right-side text written by the backend: "Needs you", "Today", "Nov 4". */
  meta: string;
  needsYou: boolean;
  href: string;
}

export interface Outcome {
  id: string;
  decidedOn: string;
  summary: string;
  result: "helped" | "no_change" | "pending";
}

export interface Coverage {
  manualEntries: number;
  connectors: { name: string; connected: boolean }[];
}

export interface HomeSummary {
  userFirstName: string;
  today: string;
  monthlyBudgetCents: number;
  totals: {
    monthlyCents: number;
    unknownPriceCount: number;
    activeTools: number;
    renewalsNext30: number;
    testedTools: number;
    /** Short backend-written note, e.g. "2 overlap in coding". */
    overlapNote: string | null;
  };
  nextDecision: DecisionCard | null;
  /** Monthly equivalent spend per month, oldest first. Computed by the backend. */
  spendHistory: { month: string; cents: number }[];
  /** Spend grouped by category for the current month. Unknown prices are counted, not summed. */
  categories: { name: string; cents: number; tools: number }[];
  /** Evidence collected per tool in the stack, by kind. */
  evidenceByTool: {
    toolName: string;
    tested: number;
    researched: number;
    unknown: number;
  }[];
  lastComparison: {
    title: string;
    finishedOn: string;
    verdict: string;
    candidates: { toolName: string; passed: number; attempts: number }[];
  } | null;
  /** Short backend-written deltas for the stat strip. */
  deltas: {
    activeTools: string;
    renewals: string;
    tested: string;
    savings: string;
  };
  subscriptions: Subscription[];
  inbox: InboxItem[];
  outcomes: Outcome[];
  coverage: Coverage;
}

// ─── Profile (My AI) ──────────────────────────────────────────────

export type ProfileSource = "stated" | "inferred";

export interface ProfileField {
  id: string;
  label: string;
  value: string;
  source: ProfileSource;
  /** For inferred fields: where it came from, e.g. "GitHub: wallio-demo repo". */
  inferredFrom?: string;
  confidence?: "low" | "medium" | "high";
  /** Inferred fields stay pending until the user confirms or removes them. */
  status: "confirmed" | "pending";
}

export interface Workflow {
  id: string;
  name: string;
  priority: number; // 1 = most important
  /** Tools in the stack the user uses for this workflow. */
  tools?: string[];
}

export interface Profile {
  version: number;
  updatedOn: string;
  fields: ProfileField[];
  workflows: Workflow[];
}

// ─── Discover ─────────────────────────────────────────────────────

/** The five parts of a fit score (PRD scoring model). Weights are a starting hypothesis. */
export type FitComponentKey =
  | "workflow"
  | "features"
  | "cost"
  | "privacy"
  | "switching";

export interface FitComponent {
  key: FitComponentKey;
  /** Share of the total, in percent. All five add up to 100. */
  weight: number;
  /** 0–100. null = not enough evidence, never guessed. */
  score: number | null;
}

/** One of the user's hard requirements, checked against a candidate. */
export interface RequirementCheck {
  label: string;
  status: "met" | "missing" | "unknown";
  /** Short value shown on the right, e.g. "$15 a month". */
  detail: string;
}

export interface Match {
  id: string;
  workflowId: string;
  toolName: string;
  /** One short reason it fits. */
  fit: string;
  /** One short reason it might not. */
  risk: string;
  monthlyCents: number | null;
  evidence: EvidenceKind; // researched | tested
  /** Which tool in the user's stack this would be compared against. */
  comparesTo: string | null;
  /** Weighted score, computed by the backend. low < high when a component is unknown. */
  score: { low: number; high: number };
  components: FitComponent[];
  requirements: RequirementCheck[];
  /** One sentence on what has been verified, e.g. "Read from 3 public pages. Not tested yet." */
  verified: string;
  sources: Evidence[];
}

export interface DiscoverData {
  workflows: Workflow[];
  /** Ranked by the backend, best first. The UI never re-sorts. */
  matches: Match[];
  /** Candidates removed by a hard requirement, with the reason. */
  excluded: { id: string; workflowId: string; toolName: string; reason: string }[];
  /** Workflows where nothing beat the current setup. Shown honestly. */
  noBetterMatch: {
    workflowId: string;
    currentTool: string;
    currentScore: number;
    closest: { toolName: string; score: number; reason: string }[];
  }[];
  /** How each workflow's shortlist was researched. */
  research: {
    workflowId: string;
    checked: number;
    pagesRead: number;
    researchedOn: string; // ISO date
  }[];
}

// ─── Compare (runs) ───────────────────────────────────────────────
// Lifecycle mirrors PRD section 15. The UI only displays it.

export type RunStatus =
  | "created"
  | "queued"
  | "preparing"
  | "running"
  | "awaiting_approval"
  | "verifying"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export type StepStatus = "pending" | "active" | "done" | "blocked" | "failed";

export interface RunStep {
  id: string;
  label: string;
  status: StepStatus;
  /** Seconds since run start, set by backend when the step finishes. */
  atSeconds: number | null;
  /** Short note shown only for blocked/failed steps. */
  note?: string;
  /** What the step is doing, so the live view can show the right thing. */
  kind?: "plan" | "research" | "test" | "verify" | "report" | "cleanup";
  /** The page or place the sandbox is working in, e.g. "cursor.com/pricing". */
  host?: string;
  /** For test steps: which tool is being run. */
  toolName?: string;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  source: string; // display host, e.g. "windsurf.com/pricing"
  capturedAt: string; // ISO datetime
  limitation?: string;
}

/** One attempt of the task. Failed and timed-out attempts stay in the report. */
export interface AttemptResult {
  toolName: string;
  attempt: number;
  passed: boolean;
  /** null when the attempt timed out. */
  seconds: number | null;
  note?: string;
}

export interface CandidateResult {
  toolName: string;
  isCurrent: boolean;
  passed: number;
  attempts: number;
  medianSeconds: number | null;
  runCostCents: number | null; // estimated inference cost of the evaluation
  monthlyCents: number | null;
}

export interface RunResult {
  runId: string;
  workflow: string;
  task: string;
  finishedAt: string;
  candidates: CandidateResult[];
  recommendation: {
    action: RecommendedAction;
    title: string;
    reason: string;
  };
  evidence: Evidence[];
  attempts: AttemptResult[];
  /** What this result does not show. Always displayed with the verdict. */
  limitations: string[];
  /** Policy checks on every browser action the agent proposed. */
  policy: { allowed: number; stopped: number };
  /** Lifecycle cleanup, stored apart from the outcome (PRD section 15). */
  cleanup: { status: "cleaned" | "cleanup_failed" | "pending"; at: string | null };
}

export interface CompareSetupData {
  workflows: Workflow[];
  tasks: { id: string; workflowId: string; title: string }[];
  tools: {
    name: string;
    isCurrent: boolean;
    monthlyCents: number | null;
    /** Workflows this tool can be tested on. */
    workflowIds: string[];
  }[];
  recent: { id: string; title: string; finishedOn: string; outcome: string }[];
}

// ─── Decisions ────────────────────────────────────────────────────

/** Exactly what the agent wants to do. The server re-validates the hash before executing. */
export interface ApprovalIntent {
  id: string;
  title: string;
  destination: string;
  fields: { label: string; value: string }[];
  consequence: string;
  expiresAt: string; // ISO datetime
  screenshotLabel: string;
}

export interface Recommendation {
  id: string;
  title: string;
  action: RecommendedAction;
  evidence: EvidenceKind;
  href: string;
  /** Label for the button that acts on it, e.g. "Compare". */
  cta: string;
  /** When it matters, e.g. the renewal date. */
  dueOn: string | null;
}

export interface DecisionLogEntry {
  id: string;
  summary: string;
  decidedOn: string;
  result: "helped" | "no_change" | "pending";
  /** Tool the decision was about, for its logo. */
  toolName: string;
  /** For pending entries: when Wallio asks whether it helped. */
  checkInOn?: string;
  /** Estimated yearly saving from this decision, computed by the backend. */
  savedAnnualCents?: number | null;
}

export interface DecisionsData {
  approvals: ApprovalIntent[];
  recommendations: Recommendation[];
  history: DecisionLogEntry[];
}
