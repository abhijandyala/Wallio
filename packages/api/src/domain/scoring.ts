/**
 * Deterministic scoring (score-v1, PRD §10). Same inputs → same output.
 *
 * 1. Hard constraints first (budget, required integrations, privacy for
 *    high-sensitivity users). A failed constraint excludes a candidate.
 * 2. Weighted components in [0, 1]: quality 40, fit 20, cost 15, privacy 15,
 *    switching 10 (user-adjustable weights).
 * 3. A component with no evidence is null, never a guess. The total is then an
 *    interval: min assumes unknowns score 0, max assumes they score 1.
 * 4. Researched and tested candidates are kept apart via accessMode; a published
 *    claim never produces a quality score.
 */
export const SCORE_VERSION = "score-v1";

export type Weights = { quality: number; fit: number; cost: number; privacy: number; switching: number };
export const DEFAULT_WEIGHTS: Weights = { quality: 0.4, fit: 0.2, cost: 0.15, privacy: 0.15, switching: 0.1 };

export interface KnownFinding { question: string; answer: "supported" | "contradicted"; statement: string; quote: string; evidenceId: string }
export interface ToolFacts {
  toolId: string;
  name: string;
  role: "incumbent" | "candidate";
  /** What the user pays now (user input), if this tool is in their inventory. */
  userPrice: { monthlyMinor: number; subscriptionId: string } | null;
  known: KnownFinding[];
  missing: string[];
  blocked: Array<{ url: string; reason: string }>;
  /** Executed test result for THIS product (tested_integration only). Null for researched products. */
  test: { passed: number; attempts: number; evidenceId: string } | null;
  evidenceCount: number;
}
export interface ProfileFacts {
  budgetMonthlyMinor: number;
  currency: string;
  dataSensitivity: "low" | "medium" | "high";
  requiredIntegrations: string[];
  willingnessToSwitch: "low" | "medium" | "high";
}
export type Topic = "price" | "plan_limits" | "features" | "integrations" | "privacy" | "other";

export interface Component { value: number | null; weight: number; evidenceIds: string[]; userInputRefs: string[]; basis: string }
export interface Assessment {
  toolId: string;
  role: "incumbent" | "candidate";
  accessMode: "researched" | "tested_integration";
  monthlyPrice: { amountMinor: number; source: "user_input" | "vendor_claim"; ref: string } | null;
  hardConstraints: { passed: boolean; failures: string[]; unknown: string[] };
  components: Record<keyof Weights, Component>;
  min: number;
  max: number;
  knownComponents: number;
}

/**
 * Reads one monthly USD price from a quote, e.g. "$ 10 USD per user / month" → 1000.
 * Returns null if there's no monthly price or more than one distinct amount (ambiguous).
 */
export function parseMonthlyPriceMinor(quote: string): number | null {
  if (!/(month|\/\s?mo\b|monthly)/i.test(quote)) return null;
  const amounts = [...quote.matchAll(/\$\s?(\d{1,4}(?:\.\d{2})?)/g)].map((m) => Math.round(Number(m[1]) * 100));
  const distinct = [...new Set(amounts)];
  return distinct.length === 1 ? distinct[0]! : null;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 1000) / 1000;

export function assess(t: ToolFacts, profile: ProfileFacts, topicOf: (question: string) => Topic, weights: Weights = DEFAULT_WEIGHTS): Assessment {
  const byTopic = (topic: Topic) => t.known.filter((k) => topicOf(k.question) === topic);

  // Price: what the user actually pays wins over a vendor claim.
  let monthlyPrice: Assessment["monthlyPrice"] = null;
  if (t.userPrice) monthlyPrice = { amountMinor: t.userPrice.monthlyMinor, source: "user_input", ref: `subscription:${t.userPrice.subscriptionId}` };
  else {
    for (const k of byTopic("price")) {
      const p = k.answer === "supported" ? parseMonthlyPriceMinor(k.quote) : null;
      if (p !== null) { monthlyPrice = { amountMinor: p, source: "vendor_claim", ref: k.evidenceId }; break; }
    }
  }

  // Hard constraints.
  const failures: string[] = [];
  const unknown: string[] = [];
  if (monthlyPrice && monthlyPrice.amountMinor > profile.budgetMonthlyMinor) failures.push(`Costs more than your ${fmt(profile.budgetMonthlyMinor)}/month budget`);
  if (!monthlyPrice) unknown.push("Monthly price");
  for (const integ of profile.requiredIntegrations) {
    const f = byTopic("integrations").find((k) => k.question.toLowerCase().includes(integ.toLowerCase()));
    if (f?.answer === "contradicted") failures.push(`Doesn't support ${integ}`);
    else if (!f) unknown.push(`Support for ${integ}`);
  }
  const privacy = privacyValue(byTopic("privacy"));
  if (profile.dataSensitivity === "high" && privacy.value === 0) failures.push("States it may use your code or prompts for training");

  // Components.
  const quality: Component = t.test
    ? { value: round(t.test.passed / t.test.attempts), weight: weights.quality, evidenceIds: [t.test.evidenceId], userInputRefs: [], basis: `${t.test.passed}/${t.test.attempts} test runs passed` }
    : { value: null, weight: weights.quality, evidenceIds: [], userInputRefs: [], basis: "Not tested on your task" };

  const fitAsked = t.known.filter((k) => ["features", "integrations"].includes(topicOf(k.question)));
  const fitTotal = fitAsked.length + t.missing.filter((m) => ["features", "integrations"].includes(topicOf(m))).length;
  const fit: Component = fitTotal > 0 && fitAsked.length > 0
    ? { value: round(fitAsked.filter((k) => k.answer === "supported").length / fitTotal), weight: weights.fit, evidenceIds: fitAsked.map((k) => k.evidenceId), userInputRefs: [], basis: `${fitAsked.filter((k) => k.answer === "supported").length} of ${fitTotal} feature questions confirmed` }
    : { value: null, weight: weights.fit, evidenceIds: [], userInputRefs: [], basis: "No feature evidence" };

  const cost: Component = monthlyPrice
    ? { value: round(clamp(1 - monthlyPrice.amountMinor / Math.max(1, profile.budgetMonthlyMinor))), weight: weights.cost,
        evidenceIds: monthlyPrice.source === "vendor_claim" ? [monthlyPrice.ref] : [], userInputRefs: monthlyPrice.source === "user_input" ? [monthlyPrice.ref, "budget"] : ["budget"],
        basis: `${fmt(monthlyPrice.amountMinor)}/month against a ${fmt(profile.budgetMonthlyMinor)} budget` }
    : { value: null, weight: weights.cost, evidenceIds: [], userInputRefs: ["budget"], basis: "Price unknown" };

  const privacyC: Component = { value: privacy.value, weight: weights.privacy, evidenceIds: privacy.evidenceIds, userInputRefs: [], basis: privacy.basis };

  const switchingValue = t.role === "incumbent" ? 1 : { low: 0.2, medium: 0.5, high: 0.8 }[profile.willingnessToSwitch];
  const switching: Component = { value: switchingValue, weight: weights.switching, evidenceIds: [], userInputRefs: ["willingnessToSwitch"], basis: t.role === "incumbent" ? "No switch needed" : `You said your willingness to switch is ${profile.willingnessToSwitch}` };

  const components = { quality, fit, cost, privacy: privacyC, switching };
  let min = 0, max = 0, knownComponents = 0;
  for (const c of Object.values(components)) {
    if (c.value === null) { max += c.weight; continue; }
    min += c.weight * c.value;
    max += c.weight * c.value;
    knownComponents++;
  }
  return {
    toolId: t.toolId, role: t.role, accessMode: t.test ? "tested_integration" : "researched", monthlyPrice,
    hardConstraints: { passed: failures.length === 0, failures, unknown },
    components, min: round(min), max: round(max), knownComponents,
  };
}

function privacyValue(findings: KnownFinding[]): { value: number | null; evidenceIds: string[]; basis: string } {
  for (const f of findings) {
    const q = f.quote.toLowerCase();
    if (/\b(not|never|won't|will not|do not|don't)\b[^.]{0,40}\btrain/.test(q) || /zero[- ]data[- ]retention|no (data )?retention/.test(q)) {
      return { value: 1, evidenceIds: [f.evidenceId], basis: "States your code isn't used for training" };
    }
    if (/\b(use|used|using)\b[^.]{0,40}\btrain/.test(q)) return { value: 0, evidenceIds: [f.evidenceId], basis: "States data may be used for training" };
  }
  return { value: null, evidenceIds: [], basis: "No privacy policy statement captured" };
}

export function fmt(minor: number, currency = "USD"): string {
  return currency === "USD" ? `$${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}` : `${(minor / 100).toFixed(2)} ${currency}`;
}
