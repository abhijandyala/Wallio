/**
 * Maps between the Wallio API's inventory and profile (contracts) and the shapes the My AI
 * screen already draws (lib/types). The API stays the source of truth: totals come from its
 * summary, and every profile edit becomes a new profile version.
 */
import type { Profile, ProfileField, Subscription, Workflow } from "@/lib/types";
import type { ApiSubscription, CatalogTool, ProfileVersion, ProfileVersionInput, SubscriptionInput } from "./contract";

const CATEGORY: Record<string, string> = {
  coding_assistant: "Coding",
  chat_assistant: "Chat",
  research: "Research",
  writing: "Writing",
  image: "Images",
};
export const categoryLabel = (c: string) =>
  CATEGORY[c] ?? c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());

const SOURCE: Record<ApiSubscription["source"], Subscription["source"]> = {
  user_entered: "manual",
  imported: "imported",
  seed: "sample",
};

/** One API subscription as a My AI row. */
export function toUiSubscription(s: ApiSubscription, tools: Map<string, CatalogTool>): Subscription {
  const tool = tools.get(s.toolId);
  const amount = s.price.known ? s.price.amountMinor * s.seats : null;
  // The per-row monthly figure uses the server's own rule (annual ÷ 12, × seats) for display;
  // the page total always comes from the server's summary.
  const monthly =
    s.cadence === "free" ? 0 : amount === null ? null : s.cadence === "annual" ? Math.round(amount / 12) : s.cadence === "monthly" ? amount : null;
  return {
    id: s.id,
    toolId: s.toolId,
    seats: s.seats,
    toolName: tool?.name ?? s.toolId,
    category: tool ? categoryLabel(tool.category) : "Other",
    plan: s.plan,
    monthlyCents: monthly,
    renewalCents: s.cadence === "free" ? 0 : amount,
    cadence: s.cadence === "monthly" || s.cadence === "annual" ? s.cadence : "unknown",
    renewsOn: s.renewalDate,
    source: SOURCE[s.source],
    status: s.status,
    overlapsWith: [],
    lastCheckedOn: s.lastVerifiedAt ? s.lastVerifiedAt.slice(0, 10) : null,
    manageUrl: tool?.pricingUrl ?? tool?.homepageUrl ?? null,
  };
}

/** A My AI row (as saved in the drawer) as the API's input. A blank price stays unknown. */
export function toSubscriptionInput(s: Subscription): SubscriptionInput {
  const seats = s.seats ?? 1;
  return {
    toolId: s.toolId ?? "",
    plan: s.plan,
    price:
      s.renewalCents === null
        ? { known: false, reason: "You haven't entered the price yet" }
        : { known: true, amountMinor: Math.round(s.renewalCents / seats), currency: "USD" },
    cadence: s.cadence === "annual" ? "annual" : "monthly",
    seats,
    renewalDate: s.renewsOn,
    taxIncluded: null,
  };
}

// ───────────────────────── Profile ─────────────────────────

const DEPLOY: Record<ProfileVersion["deploymentPreference"], string> = {
  local: "On my device",
  cloud: "In the cloud",
  either: "Either",
};
const LEVEL: Record<"low" | "medium" | "high", string> = { low: "Low", medium: "Medium", high: "High" };

const ATTR_LABEL: Record<string, string> = {
  top_workflow: "Top workflow",
  primary_language: "Main language",
  editor: "Editor",
  main_stack: "Main stack",
};
const attrLabel = (k: string) => ATTR_LABEL[k] ?? k.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());
const attrValue = (v: ProfileAttribute["value"]) => (Array.isArray(v) ? v.join(", ") : String(v));
type ProfileAttribute = ProfileVersion["attributes"][number];

export const BUDGET_FIELD = "pf_budget";
const money = (minor: number) => "$" + (minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** The latest profile version as the screen's facts and workflows. */
export function toUiProfile(p: ProfileVersion): Profile {
  const fields: ProfileField[] = [
    { id: "pf_role", label: "Role", value: p.primaryRole, source: "stated", status: "confirmed" },
    { id: BUDGET_FIELD, label: "Monthly budget", value: money(p.budget.maxMonthlyMinor), source: "stated", status: "confirmed" },
    { id: "pf_deploy", label: "Prefers tools that run", value: DEPLOY[p.deploymentPreference], source: "stated", status: "confirmed" },
    { id: "pf_sensitivity", label: "Data sensitivity", value: LEVEL[p.dataSensitivity], source: "stated", status: "confirmed" },
    { id: "pf_switch", label: "Open to switching", value: LEVEL[p.willingnessToSwitch], source: "stated", status: "confirmed" },
    ...p.attributes.map(
      (a): ProfileField => ({
        id: `attr:${a.key}`,
        label: attrLabel(a.key),
        value: attrValue(a.value),
        source: a.origin === "inferred" ? "inferred" : "stated",
        inferredFrom: a.source ?? undefined,
        confidence: a.confidence ?? undefined,
        status: a.confirmed ? "confirmed" : "pending",
      }),
    ),
  ];
  return {
    version: p.version,
    updatedOn: p.createdAt.slice(0, 10),
    fields,
    workflows: [...p.workflows].sort((a, b) => a.priority - b.priority).map((w) => ({ id: w.id, name: w.name, priority: w.priority })),
  };
}

/** Thrown when an edit can't be saved as typed; the message is shown to the person. */
export class ProfileInputError extends Error {}

const parseLevel = (v: string): "low" | "medium" | "high" => {
  const t = v.trim().toLowerCase();
  if (/^(low|no|rarely)/.test(t)) return "low";
  if (/^(high|yes|very)/.test(t)) return "high";
  if (/^(medium|mid|some)/.test(t)) return "medium";
  throw new ProfileInputError("Use low, medium or high.");
};
const parseDeploy = (v: string): ProfileVersion["deploymentPreference"] => {
  const t = v.trim().toLowerCase();
  if (/local|device|on.?prem/.test(t)) return "local";
  if (/cloud/.test(t)) return "cloud";
  if (/either|any|both|don.?t mind/.test(t)) return "either";
  throw new ProfileInputError("Use on my device, in the cloud, or either.");
};
const parseMoney = (v: string) => {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new ProfileInputError("Enter an amount, like $40.");
  return Math.round(n * 100);
};

/**
 * The screen's current facts and workflows as the next profile version. Starts from the
 * version they were loaded from, so anything the screen doesn't show is kept as it was.
 */
export function toProfileInput(base: ProfileVersion, fields: ProfileField[], workflows: Workflow[]): ProfileVersionInput {
  if (workflows.length < 1) throw new ProfileInputError("Keep at least one workflow.");
  if (workflows.length > 3) throw new ProfileInputError("Wallio works with up to three workflows. Remove one first.");
  if (workflows.some((w) => !w.name.trim())) throw new ProfileInputError("Give every workflow a name.");
  const byId = new Map(fields.map((f) => [f.id, f]));
  const val = (id: string) => byId.get(id)?.value;
  const now = new Date().toISOString();
  const describe = new Map(base.workflows.map((w) => [w.id, w.description]));

  const attributes = base.attributes.flatMap((a): ProfileAttribute[] => {
    const f = byId.get(`attr:${a.key}`);
    if (!f) return []; // removed on screen
    const edited = f.value !== attrValue(a.value);
    if (edited) {
      const value = Array.isArray(a.value) ? f.value.split(",").map((x) => x.trim()).filter(Boolean) : f.value;
      return [{ key: a.key, value, origin: "user_stated", source: null, confidence: null, confirmed: true, updatedAt: now }];
    }
    const confirmed = f.status === "confirmed";
    return [{ ...a, confirmed, updatedAt: confirmed !== a.confirmed ? now : a.updatedAt }];
  });

  return {
    primaryRole: (val("pf_role") ?? base.primaryRole).trim() || base.primaryRole,
    workflows: [...workflows]
      .sort((a, b) => a.priority - b.priority)
      .map((w, i) => ({ id: w.id, name: w.name.trim(), description: describe.get(w.id) ?? "", priority: i + 1 })),
    budget: {
      currency: base.budget.currency,
      maxMonthlyMinor: val(BUDGET_FIELD) === money(base.budget.maxMonthlyMinor) ? base.budget.maxMonthlyMinor : parseMoney(val(BUDGET_FIELD) ?? ""),
    },
    deploymentPreference: val("pf_deploy") === DEPLOY[base.deploymentPreference] ? base.deploymentPreference : parseDeploy(val("pf_deploy") ?? ""),
    dataSensitivity: val("pf_sensitivity") === LEVEL[base.dataSensitivity] ? base.dataSensitivity : parseLevel(val("pf_sensitivity") ?? ""),
    willingnessToSwitch: val("pf_switch") === LEVEL[base.willingnessToSwitch] ? base.willingnessToSwitch : parseLevel(val("pf_switch") ?? ""),
    requiredIntegrations: base.requiredIntegrations,
    attributes,
  };
}
