/**
 * Recommendation (PRD F08, §10).
 *
 * - Code decides the action from deterministic scores; the model never picks it.
 * - Code builds a numbered fact list, each fact tied to evidence IDs or user inputs.
 * - The model only writes sentences that cite fact IDs. A sentence is rejected if it
 *   cites an unknown fact, cites nothing (except a next step), or contains a number
 *   that isn't in the facts it cites. One repair attempt, then a template.
 * - Conservative by default: published claims can justify a trial, never "better".
 */
import { z } from "zod";
import type { InferenceGateway } from "../inference/index.ts";
import { assess, fmt, SCORE_VERSION, type Assessment, type ProfileFacts, type ToolFacts, type Topic, type Weights, DEFAULT_WEIGHTS } from "./scoring.ts";
import { SPEND_CALCULATION_VERSION } from "./spending.ts";

export type Action = "keep" | "try" | "compare_further" | "replace_after_validation" | "review_renewal" | "no_action";

export interface Fact { id: string; text: string; evidenceIds: string[]; userInputRefs: string[] }
export interface Statement { text: string; role: "supporting" | "counter" | "uncertainty" | "next_step"; evidenceIds: string[]; userInputRefs: string[] }

export interface Decision {
  action: Action;
  targetToolId: string | null;
  confidence: "low" | "medium" | "high";
  reason: string;
}

export interface RecommendInput {
  goal: string;
  tools: ToolFacts[];
  profile: ProfileFacts;
  topicOf: (q: string) => Topic;
  incumbentRenewal: { date: string; amountMinor: number; subscriptionId: string; cadence: string } | null;
  /** Owned harness result: tests Wallio's harness on a Vultr model, not the products. */
  harness?: { passed: number; total: number; model: string; evidenceId: string } | null;
  today: string;
  weights?: Weights;
}

// ───────────────────────── decision (deterministic) ─────────────────────────

export function decide(assessments: Assessment[], tools: ToolFacts[], renewalSoon: boolean): Decision {
  const inc = assessments.find((a) => a.role === "incumbent")!;
  const cands = assessments.filter((a) => a.role === "candidate");
  const withEvidence = (a: Assessment) => (tools.find((t) => t.toolId === a.toolId)?.evidenceCount ?? 0) > 0;

  if (!assessments.some(withEvidence)) return { action: "no_action", targetToolId: null, confidence: "low", reason: "No evidence could be captured, so there's nothing to base a change on." };
  const viable = cands.filter((c) => c.hardConstraints.passed && withEvidence(c));
  if (!viable.length) {
    const failed = cands.find((c) => !c.hardConstraints.passed);
    return { action: "keep", targetToolId: null, confidence: failed ? "medium" : "low", reason: failed ? `The alternative fails a requirement: ${failed.hardConstraints.failures[0]}.` : "The alternative couldn't be researched." };
  }
  const best = viable.sort((a, b) => b.max - a.max || b.min - a.min)[0]!;
  const conf: Decision["confidence"] = best.accessMode === "tested_integration" && inc.accessMode === "tested_integration" ? "high" : Math.min(best.knownComponents, inc.knownComponents) >= 3 ? "medium" : "low";

  if (best.min > inc.max) {
    // Even the worst case for the alternative beats the best case for the incumbent.
    return best.accessMode === "tested_integration"
      ? { action: "replace_after_validation", targetToolId: best.toolId, confidence: conf, reason: "The alternative scores higher even with every unknown counted against it." }
      : { action: "try", targetToolId: best.toolId, confidence: conf, reason: "The alternative scores higher even with every unknown counted against it, but it hasn't been tested on your task." };
  }
  if (best.max < inc.min) return { action: "keep", targetToolId: null, confidence: conf, reason: "Your current tool scores higher even with every unknown counted in the alternative's favour." };
  if (renewalSoon) return { action: "review_renewal", targetToolId: best.toolId, confidence: "low", reason: "The evidence doesn't separate the tools and your current plan renews soon." };
  return { action: "compare_further", targetToolId: best.toolId, confidence: "low", reason: "The evidence doesn't separate the tools; the biggest unknown is quality on your own task." };
}

// ───────────────────────── facts (deterministic) ─────────────────────────

export function buildFacts(input: RecommendInput, assessments: Assessment[], decision: Decision): Fact[] {
  const facts: Fact[] = [];
  const add = (text: string, evidenceIds: string[] = [], userInputRefs: string[] = []) => facts.push({ id: `F${facts.length + 1}`, text, evidenceIds, userInputRefs });
  const name = (id: string) => input.tools.find((t) => t.toolId === id)?.name ?? id;

  add(`Your monthly budget for AI tools is ${fmt(input.profile.budgetMonthlyMinor)}.`, [], ["budget"]);
  for (const a of assessments) {
    const t = input.tools.find((x) => x.toolId === a.toolId)!;
    if (a.monthlyPrice?.source === "user_input") add(`You pay ${fmt(a.monthlyPrice.amountMinor)} per month for ${t.name}.`, [], [a.monthlyPrice.ref]);
    if (a.monthlyPrice?.source === "vendor_claim") add(`${t.name}'s pricing page lists ${fmt(a.monthlyPrice.amountMinor)} per month.`, [a.monthlyPrice.ref]);
    for (const k of t.known.slice(0, 4)) add(`${t.name}'s page says: "${k.quote}"`, [k.evidenceId]);
    for (const f of a.hardConstraints.failures) add(`${t.name}: ${f}.`, a.components.cost.evidenceIds, a.components.cost.userInputRefs);
    if (!a.monthlyPrice) add(`${t.name}'s monthly price wasn't confirmed from a capture.`, [], ["budget"]);
    if (a.components.privacy.value === null && input.profile.dataSensitivity !== "low") add(`No privacy or training statement was captured for ${t.name}.`, [], ["dataSensitivity"]);
    for (const b of t.blocked) add(`A ${t.name} page couldn't be read (${b.reason.replace(/_/g, " ")}).`, [], ["workflow"]);
    if (!t.test) add(`${t.name} was not tested on your own task, so its quality for you is unknown.`, [], ["workflow"]);
  }
  if (input.incumbentRenewal) {
    add(`Your ${name(input.tools.find((t) => t.role === "incumbent")!.toolId)} plan renews on ${input.incumbentRenewal.date} for ${fmt(input.incumbentRenewal.amountMinor)}.`, [], [`subscription:${input.incumbentRenewal.subscriptionId}`]);
  }
  if (input.harness) {
    add(`Wallio's owned test ran the sample bug through ${input.harness.model} on Vultr: ${input.harness.passed} of ${input.harness.total} test cases passed. This tests Wallio's harness, not either product.`, [input.harness.evidenceId]);
  }
  add(`Your willingness to switch tools is ${input.profile.willingnessToSwitch}.`, [], ["willingnessToSwitch"]);
  add(`Decision: ${decision.reason}`, [], ["workflow"]);
  return facts;
}

// ───────────────────────── statements ─────────────────────────

const MONEYISH = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?\s?%|\b\d{2,}\b/g;
const numbersIn = (s: string) => [...s.matchAll(MONEYISH)].map((m) => m[0].replace(/\s/g, "").replace(/,/g, "").replace(/\.00$/, ""));

export const ExplainOutput = z.object({
  statements: z.array(z.object({ text: z.string().min(5).max(300), role: z.enum(["supporting", "counter", "uncertainty", "next_step"]), factIds: z.array(z.string()).max(6) })).min(2).max(7),
});

/** Pure: maps fact IDs to citations and drops statements that aren't grounded in their facts. */
export function validateStatements(raw: z.infer<typeof ExplainOutput>["statements"], facts: Fact[]): { ok: Statement[]; problems: string[] } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ok: Statement[] = [];
  const problems: string[] = [];
  for (const [i, s] of raw.entries()) {
    const cited = s.factIds.map((id) => byId.get(id));
    if (cited.some((c) => !c)) { problems.push(`statement ${i + 1} cites a fact that doesn't exist`); continue; }
    const fs = cited as Fact[];
    if (s.role !== "next_step" && fs.length === 0) { problems.push(`statement ${i + 1} cites no facts`); continue; }
    const allowed = new Set(fs.flatMap((f) => numbersIn(f.text)));
    const stray = numbersIn(s.text).filter((n) => !allowed.has(n));
    if (stray.length) { problems.push(`statement ${i + 1} uses ${stray.join(", ")}, which isn't in the facts it cites`); continue; }
    ok.push({ text: s.text.trim(), role: s.role, evidenceIds: [...new Set(fs.flatMap((f) => f.evidenceIds))], userInputRefs: [...new Set(fs.flatMap((f) => f.userInputRefs))] });
  }
  return { ok, problems };
}

export function templateStatements(input: RecommendInput, assessments: Assessment[], decision: Decision, facts: Fact[]): Statement[] {
  const cite = (f: Fact | undefined) => (f ? { evidenceIds: f.evidenceIds, userInputRefs: f.userInputRefs } : { evidenceIds: [], userInputRefs: ["workflow"] });
  const out: Statement[] = [];
  for (const a of assessments) {
    const t = input.tools.find((x) => x.toolId === a.toolId)!;
    const priceFact = facts.find((f) => f.text.includes(t.name) && /per month/.test(f.text));
    if (priceFact) out.push({ text: priceFact.text, role: "supporting", ...cite(priceFact) });
  }
  const untested = facts.find((f) => /not tested on your own task/.test(f.text));
  if (untested) out.push({ text: "Neither tool was tested on your own task, so quality for you is still unknown.", role: "uncertainty", ...cite(untested) });
  const failure = facts.find((f) => /: .*(budget|support|training)/.test(f.text));
  if (failure) out.push({ text: failure.text, role: "counter", ...cite(failure) });
  out.push({ text: nextStep(decision, input), role: "next_step", evidenceIds: [], userInputRefs: [] });
  return out;
}

export function nextStep(d: Decision, input: RecommendInput): string {
  const name = (id: string | null) => input.tools.find((t) => t.toolId === id)?.name ?? "the alternative";
  switch (d.action) {
    case "try": return `Start a trial of ${name(d.targetToolId)} and use it on your next real bug before deciding.`;
    case "replace_after_validation": return `Move to ${name(d.targetToolId)} after confirming it on one more of your own tasks.`;
    case "review_renewal": return `Before your plan renews, try ${name(d.targetToolId)} on one real bug and decide then.`;
    case "compare_further": return `Run ${name(d.targetToolId)} on one of your own bugs to settle the quality question.`;
    case "keep": return "Keep your current setup; revisit if your needs or prices change.";
    case "no_action": return "Try the comparison again later, or add the tools' prices yourself.";
  }
}

export function headline(d: Decision, input: RecommendInput): string {
  const inc = input.tools.find((t) => t.role === "incumbent")!.name;
  const tgt = input.tools.find((t) => t.toolId === d.targetToolId)?.name ?? "the alternative";
  return {
    try: `Try ${tgt} on a real task before changing anything`,
    replace_after_validation: `${tgt} looks better than ${inc}; confirm on one more task, then switch`,
    review_renewal: `Review ${inc} before it renews, with a short ${tgt} trial`,
    compare_further: `Keep ${inc} for now and test ${tgt} on your own task`,
    keep: `Keep ${inc}`,
    no_action: "Not enough evidence to recommend a change",
  }[d.action].slice(0, 160);
}

export async function explain(gw: InferenceGateway, correlationId: string, input: RecommendInput, decision: Decision, facts: Fact[]): Promise<{ statements: Statement[]; by: "model" | "template"; problems: string[] }> {
  const ask = async (extra: string) => {
    const out = await gw.chatJSON({
      purpose: "explain",
      correlationId,
      schema: ExplainOutput,
      messages: [
        {
          role: "system",
          content:
            "You explain an AI-tool decision that has ALREADY been made by rules. Do not change or argue with the decision. " +
            'Reply with ONLY JSON: {"statements": [{"text", "role", "factIds"}]} with 3 to 6 statements. ' +
            'role is "supporting", "counter", "uncertainty" or "next_step". Every statement except next_step must cite the fact IDs it relies on. ' +
            "Use only the facts given. Never introduce a number, price or percentage that isn't written in a cited fact. " +
            "Never claim one tool is better or faster unless a fact says so. Plain, short sentences.",
        },
        { role: "user", content: JSON.stringify({ goal: input.goal, decision: { action: decision.action, reason: decision.reason }, facts: facts.map((f) => ({ id: f.id, text: f.text })) }) + extra },
      ],
    });
    return validateStatements(out.data.statements, facts);
  };
  let problems: string[] = [];
  try {
    let r = await ask("");
    if (r.problems.length || r.ok.filter((s) => s.role !== "next_step").length < 2) {
      problems = r.problems;
      r = await ask(`\n\nYour previous answer had problems: ${r.problems.join("; ") || "too few grounded statements"}. Fix them.`);
    }
    const grounded = r.ok.filter((s) => s.role !== "next_step");
    if (grounded.length >= 2) {
      const statements = [...grounded, { text: nextStep(decision, input), role: "next_step" as const, evidenceIds: [], userInputRefs: [] }];
      return { statements, by: "model", problems: [...problems, ...r.problems] };
    }
    problems = [...problems, ...r.problems];
  } catch (e) {
    problems.push((e as Error).message.slice(0, 200));
  }
  return { statements: templateStatements(input, assessments(input), decision, facts), by: "template", problems };
}

// ───────────────────────── assembly ─────────────────────────

export function assessments(input: RecommendInput): Assessment[] {
  return input.tools.map((t) => assess(t, input.profile, input.topicOf, input.weights ?? DEFAULT_WEIGHTS));
}

export interface Scenario {
  label: string;
  monthlyEquivalentDeltaMinor: number | null;
  immediateCashSavingMinor: number;
  renewalAvoidanceMinor: number | null;
  assumptions: string[];
}

export function spendingScenarios(input: RecommendInput, as: Assessment[], d: Decision): Scenario[] {
  const inc = as.find((a) => a.role === "incumbent")!;
  const target = as.find((a) => a.toolId === d.targetToolId) ?? as.find((a) => a.role === "candidate");
  const scenarios: Scenario[] = [{ label: "Keep your current setup", monthlyEquivalentDeltaMinor: 0, immediateCashSavingMinor: 0, renewalAvoidanceMinor: 0, assumptions: ["No change to your subscriptions"] }];
  if (target) {
    const name = input.tools.find((t) => t.toolId === target.toolId)!.name;
    const both = inc.monthlyPrice && target.monthlyPrice;
    scenarios.push({
      label: `Switch to ${name} at your next renewal`,
      monthlyEquivalentDeltaMinor: both ? target.monthlyPrice!.amountMinor - inc.monthlyPrice!.amountMinor : null,
      immediateCashSavingMinor: 0,
      renewalAvoidanceMinor: input.incumbentRenewal ? input.incumbentRenewal.amountMinor : null,
      assumptions: [
        "Nothing is refunded; savings start at your next renewal",
        target.monthlyPrice ? `${name}'s price is ${fmt(target.monthlyPrice.amountMinor)}/month as listed at capture time, before tax` : `${name}'s price wasn't confirmed`,
        "Usage beyond included credits isn't counted",
      ],
    });
  }
  return scenarios;
}

export const CALCULATION_VERSION = `${SCORE_VERSION}+${SPEND_CALCULATION_VERSION}`;
