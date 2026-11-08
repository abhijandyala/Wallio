/**
 * Onboarding (PRD F02 and Flow A): main tasks, current tools, spending range, privacy, then a
 * first decision. Everything here only shapes what the person chose into the API's inputs;
 * the API stores it, and totals and rankings still come from the API.
 */
import type { ApiSubscription, ProfileAttribute, ProfileVersion, ProfileVersionInput, SubscriptionInput } from "@/lib/api/contract";
import type { GithubFinding } from "@/lib/github-import";

/** The first comparison Wallio can run end to end today (the golden path). Matches Compare's live mode. */
export const FIRST_COMPARISON = {
  workflowId: "wf_debugging",
  taskTitle: "Fix an off-by-one bug",
  incumbent: "tool_copilot",
  candidate: "tool_zed",
} as const;

export const ROLES = [
  "Independent web developer",
  "Engineer on a product team",
  "Engineering lead",
  "Student or learning to code",
  "Founder building a product",
] as const;

/** Coding workflows the curated catalog covers. Only debugging has an owned test today. */
export const WORKFLOWS = [
  { id: "wf_debugging", name: "Debugging a small web app", description: "Find and fix front-end bugs in a TypeScript project", tested: true },
  { id: "wf_features", name: "Building new features", description: "Write new code from a short spec", tested: false },
  { id: "wf_review", name: "Reviewing pull requests", description: "Read changes and catch problems before merge", tested: false },
  { id: "wf_tests", name: "Writing tests", description: "Add unit and integration tests to existing code", tested: false },
  { id: "wf_refactor", name: "Refactoring older code", description: "Clean up code without changing what it does", tested: false },
  { id: "wf_onboard", name: "Learning a new codebase", description: "Understand an unfamiliar project quickly", tested: false },
] as const;
export type WorkflowId = (typeof WORKFLOWS)[number]["id"];

export const BUDGETS = [
  { id: "0", label: "Nothing yet", minor: 0 },
  { id: "2000", label: "Up to $20", minor: 2000 },
  { id: "5000", label: "Up to $50", minor: 5000 },
  { id: "10000", label: "Up to $100", minor: 10000 },
  { id: "custom", label: "Another amount", minor: null },
] as const;

export type Level = "low" | "medium" | "high";
export type Deploy = ProfileVersion["deploymentPreference"];

/** One tool the person says they use, as typed. A blank price stays unknown. */
export interface OwnedTool {
  toolId: string;
  plan: string;
  price: string;
  cadence: "monthly" | "annual" | "free";
}

export interface OnboardingAnswers {
  role: string;
  workflows: WorkflowId[];
  tools: OwnedTool[];
  budgetMinor: number | null;
  deploy: Deploy | null;
  sensitivity: Level | null;
  switching: Level | null;
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  role: "",
  workflows: [],
  tools: [],
  budgetMinor: null,
  deploy: null,
  sensitivity: null,
  switching: null,
};

/** "12.5" → 1250. Blank → null (unknown). Anything else → NaN, which the screen refuses. */
export function parseDollars(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(parseFloat(t) * 100);
}

/** The person's tool as the API's inventory input. */
export function toSubscription(t: OwnedTool): SubscriptionInput {
  const minor = parseDollars(t.price);
  return {
    toolId: t.toolId,
    plan: t.plan.trim() || (t.cadence === "free" ? "Free" : "Plan not given"),
    price:
      t.cadence === "free"
        ? { known: true, amountMinor: 0, currency: "USD" }
        : minor === null || Number.isNaN(minor)
          ? { known: false, reason: "You haven't entered the price yet" }
          : { known: true, amountMinor: minor, currency: "USD" },
    cadence: t.cadence,
    seats: 1,
    renewalDate: null,
    taxIncluded: null,
  };
}

/**
 * What a public GitHub repository suggests, as profile facts. The repository name is the
 * person's own statement; everything read from it is inferred, with its source and a
 * confidence band (PRD F02). Facts the person removed on the review step are left out.
 */
export function githubAttributes(f: GithubFinding, keep: Record<string, boolean> = {}): ProfileAttribute[] {
  const now = f.readAt;
  const source = `github.com/${f.repo.fullName}`;
  const inferred = (key: string, value: string | string[], confidence: "low" | "medium" | "high"): ProfileAttribute => ({
    key, value, origin: "inferred", source, confidence, confirmed: true, updatedAt: now,
  });
  const out: ProfileAttribute[] = [
    { key: "github_repo", value: f.repo.fullName, origin: "user_stated", source: null, confidence: null, confirmed: true, updatedAt: now },
  ];
  const top = f.languages[0];
  if (top) out.push(inferred("primary_language", top.name, top.share >= 0.6 ? "high" : "medium"));
  if (f.frameworks.length) out.push(inferred("frameworks", f.frameworks, "medium"));
  if (f.tools.length) out.push(inferred("ai_tools_in_repo", f.tools.map((t) => t.name), "high"));
  return out.filter((x) => x.origin === "user_stated" || keep[x.key] !== false);
}

/** The answers as a new, confirmed profile version: the person's statements, plus any GitHub facts they kept. */
export function toProfileInput(a: OnboardingAnswers, github: GithubFinding | null = null, keep: Record<string, boolean> = {}): ProfileVersionInput {
  const now = new Date().toISOString();
  const workflows = a.workflows.slice(0, 3).map((id, i) => {
    const w = WORKFLOWS.find((x) => x.id === id)!;
    return { id: w.id, name: w.name, description: w.description, priority: i + 1 };
  });
  return {
    primaryRole: a.role.trim(),
    workflows,
    budget: { currency: "USD", maxMonthlyMinor: a.budgetMinor ?? 0 },
    deploymentPreference: a.deploy ?? "either",
    dataSensitivity: a.sensitivity ?? "medium",
    willingnessToSwitch: a.switching ?? "medium",
    requiredIntegrations: [],
    attributes: [
      ...(workflows.length
        ? [{ key: "top_workflow", value: workflows[0]!.name, origin: "user_stated" as const, source: null, confidence: null, confirmed: true, updatedAt: now }]
        : []),
      ...(github ? githubAttributes(github, keep) : []),
    ],
  };
}

/**
 * The sample developer's profile as a confirmed version: their stated facts stay, and each
 * inferred fact is kept (now confirmed) or dropped, as the person chose on the review step.
 */
export function confirmSample(p: ProfileVersion, keep: Record<string, boolean>): ProfileVersionInput {
  const now = new Date().toISOString();
  return {
    primaryRole: p.primaryRole,
    workflows: p.workflows.map(({ id, name, description, priority }) => ({ id, name, description, priority })),
    budget: p.budget,
    deploymentPreference: p.deploymentPreference,
    dataSensitivity: p.dataSensitivity,
    willingnessToSwitch: p.willingnessToSwitch,
    requiredIntegrations: p.requiredIntegrations,
    attributes: p.attributes
      .filter((a) => a.origin === "user_stated" || keep[a.key] !== false)
      .map((a) => (a.origin === "inferred" && !a.confirmed ? { ...a, confirmed: true, updatedAt: now } : a)),
  };
}

/**
 * Answers from a workspace that was already set up, so running setup again edits what's
 * there instead of adding copies. Returns the custom role and budget text too.
 */
export function fromExisting(p: ProfileVersion, subs: ApiSubscription[]) {
  const known = ROLES.find((r) => r === p.primaryRole);
  const budget = BUDGETS.find((b) => b.minor === p.budget.maxMonthlyMinor);
  const mine = subs.filter((s) => s.source === "user_entered" && s.status === "active");
  const answers: OnboardingAnswers = {
    role: known ?? "custom",
    workflows: [...p.workflows]
      .sort((x, y) => x.priority - y.priority)
      .map((w) => w.id)
      .filter((id): id is WorkflowId => WORKFLOWS.some((w) => w.id === id)),
    tools: mine.map((s) => ({
      toolId: s.toolId,
      plan: s.plan,
      price: s.price.known ? String(s.price.amountMinor / 100) : "",
      cadence: s.cadence === "annual" ? "annual" : s.cadence === "free" ? "free" : "monthly",
    })),
    budgetMinor: p.budget.maxMonthlyMinor,
    deploy: p.deploymentPreference,
    sensitivity: p.dataSensitivity,
    switching: p.willingnessToSwitch,
  };
  return {
    answers,
    customRole: known ? "" : p.primaryRole,
    budgetChoice: budget ? budget.id : "custom",
    customBudget: budget ? "" : String(p.budget.maxMonthlyMinor / 100),
    created: Object.fromEntries(mine.map((s) => [s.toolId, s.id])) as Record<string, string>,
  };
}

/** The same profile as a new version with one more of Wallio's workflows (last in priority). */
export function withWorkflow(p: ProfileVersion, id: WorkflowId): ProfileVersionInput {
  const w = WORKFLOWS.find((x) => x.id === id)!;
  return {
    primaryRole: p.primaryRole,
    workflows: [
      ...p.workflows.map(({ id, name, description, priority }) => ({ id, name, description, priority })),
      { id: w.id, name: w.name, description: w.description, priority: p.workflows.length + 1 },
    ],
    budget: p.budget,
    deploymentPreference: p.deploymentPreference,
    dataSensitivity: p.dataSensitivity,
    willingnessToSwitch: p.willingnessToSwitch,
    requiredIntegrations: p.requiredIntegrations,
    attributes: p.attributes,
  };
}

/** Seeded sample tools to set aside when the person enters their own. Archived, never deleted. */
export const sampleSubscriptions = (subs: ApiSubscription[]) => subs.filter((s) => s.source === "seed" && s.status !== "archived");

// ───────────── first-run flag (this browser only) ─────────────

const DONE_KEY = "wallio.onboarding.v1";

export function onboardingDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) !== null;
  } catch {
    return false;
  }
}

export function markOnboardingDone(path: "own" | "sample") {
  try {
    window.localStorage.setItem(DONE_KEY, JSON.stringify({ path, at: new Date().toISOString() }));
  } catch {}
}

export function clearOnboardingDone() {
  try {
    window.localStorage.removeItem(DONE_KEY);
  } catch {}
}
