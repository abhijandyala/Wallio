import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, parseMonthlyPriceMinor, type ProfileFacts, type ToolFacts } from "../src/domain/scoring.ts";
import { assessments, buildFacts, decide, spendingScenarios, validateStatements, type RecommendInput } from "../src/domain/recommend.ts";

test("parses one monthly USD price from real-world quotes, refuses ambiguity", () => {
  assert.equal(parseMonthlyPriceMinor("Pro For everyday coding with agents in GitHub Copilot. $ 10 USD per user / month"), 1000);
  assert.equal(parseMonthlyPriceMinor("Pro Free Trial $10 per month"), 1000);
  assert.equal(parseMonthlyPriceMinor("$19.99/mo billed monthly"), 1999);
  assert.equal(parseMonthlyPriceMinor("$5 of tokens included Usage-based billing beyond $5"), null, "not a monthly price");
  assert.equal(parseMonthlyPriceMinor("Pro $10 per month, Pro+ $39 per month"), null, "two prices: ambiguous");
});

const profile: ProfileFacts = { budgetMonthlyMinor: 4000, currency: "USD", dataSensitivity: "medium", requiredIntegrations: [], willingnessToSwitch: "medium" };
const topic = (q: string) => (/cost/.test(q) ? "price" : /integration|support for/i.test(q) ? "integrations" : /train/.test(q) ? "privacy" : "features") as any;
const tool = (over: Partial<ToolFacts>): ToolFacts => ({ toolId: "t", name: "T", role: "candidate", userPrice: null, known: [], missing: [], blocked: [], test: null, evidenceCount: 1, ...over });
const price = (q: string, ev = "ev1") => ({ question: "What does it cost per month?", answer: "supported" as const, statement: "s", quote: q, evidenceId: ev });

test("unknown components widen the range instead of guessing", () => {
  const a = assess(tool({ known: [price("$10 per month")] }), profile, topic);
  assert.equal(a.components.quality.value, null, "a published claim never yields a quality score");
  assert.equal(a.components.privacy.value, null);
  assert.equal(a.components.cost.value, 0.75);
  assert.ok(a.max - a.min >= 0.4 + 0.2 + 0.15 - 1e-9, "quality, fit and privacy all unknown");
  assert.equal(a.monthlyPrice?.source, "vendor_claim");
});

test("what the user pays beats a vendor claim; over-budget fails the hard constraint", () => {
  const a = assess(tool({ role: "incumbent", userPrice: { monthlyMinor: 1000, subscriptionId: "s1" }, known: [price("$99 per month")] }), profile, topic);
  assert.equal(a.monthlyPrice?.amountMinor, 1000);
  const over = assess(tool({ known: [price("$59 per month")] }), profile, topic);
  assert.equal(over.hardConstraints.passed, false);
  assert.match(over.hardConstraints.failures[0]!, /budget/);
});

test("required integration contradicted → excluded; high sensitivity + trains on data → excluded", () => {
  const p = { ...profile, requiredIntegrations: ["VS Code"] };
  const a = assess(tool({ known: [{ question: "Does T state support for VS Code?", answer: "contradicted", statement: "No", quote: "VS Code is not supported", evidenceId: "e" }] }), p, topic);
  assert.equal(a.hardConstraints.passed, false);
  const hi = { ...profile, dataSensitivity: "high" as const };
  const b = assess(tool({ known: [{ question: "Does it use code to train?", answer: "supported", statement: "Yes", quote: "We may use your prompts to train our models", evidenceId: "e" }] }), hi, topic);
  assert.equal(b.hardConstraints.passed, false);
  const c = assess(tool({ known: [{ question: "Does it use code to train?", answer: "supported", statement: "No", quote: "Your code is never used to train models", evidenceId: "e" }] }), hi, topic);
  assert.equal(c.components.privacy.value, 1);
});

const input = (tools: ToolFacts[], renewal = false): RecommendInput => ({
  goal: "g", tools, profile, topicOf: topic, today: "2026-11-05",
  incumbentRenewal: renewal ? { date: "2026-11-20", amountMinor: 1000, subscriptionId: "s1", cadence: "monthly" } : null,
});
const inc = tool({ toolId: "inc", name: "Copilot", role: "incumbent", userPrice: { monthlyMinor: 1000, subscriptionId: "s1" } });
const cand = tool({ toolId: "cand", name: "Zed", known: [price("Pro Free Trial $10 per month", "evZ")] });

test("decisions are conservative: overlapping ranges never become 'try' or 'replace'", () => {
  const i = input([inc, cand]);
  const d = decide(assessments(i), i.tools, false);
  assert.equal(d.action, "compare_further");
  assert.equal(d.targetToolId, "cand");
  assert.equal(d.confidence, "low");
  const r = input([inc, cand], true);
  assert.equal(decide(assessments(r), r.tools, true).action, "review_renewal");
});

test("a candidate failing a requirement → keep; no evidence at all → no_action", () => {
  const over = tool({ toolId: "cand", name: "Zed", known: [price("$80 per month", "evZ")] });
  assert.equal(decide(assessments(input([inc, over])), [inc, over], false).action, "keep");
  const none = [tool({ ...inc, evidenceCount: 0 }), tool({ ...cand, evidenceCount: 0 })];
  assert.equal(decide(assessments(input(none)), none, false).action, "no_action");
});

test("spending: no refund claims, delta only when both prices are known", () => {
  const i = input([inc, cand], true);
  const as = assessments(i);
  const s = spendingScenarios(i, as, decide(as, i.tools, true));
  const sw = s.find((x) => x.label.startsWith("Switch"))!;
  assert.equal(sw.immediateCashSavingMinor, 0);
  assert.equal(sw.monthlyEquivalentDeltaMinor, 0, "$10 vs $10");
  assert.equal(sw.renewalAvoidanceMinor, 1000);
  const unknown = input([inc, tool({ toolId: "cand", name: "Zed" })]);
  const as2 = assessments(unknown);
  assert.equal(spendingScenarios(unknown, as2, decide(as2, unknown.tools, false)).find((x) => x.label.startsWith("Switch"))!.monthlyEquivalentDeltaMinor, null);
});

test("statement validator: citations required, numbers must come from cited facts", () => {
  const i = input([inc, cand]);
  const as = assessments(i);
  const facts = buildFacts(i, as, decide(as, i.tools, false));
  const zedPrice = facts.find((f) => f.text.includes("Zed") && f.text.includes("per month"))!;
  const budget = facts.find((f) => f.text.includes("budget"))!;
  const r = validateStatements([
    { text: "Zed's Pro plan is listed at $10 per month.", role: "supporting", factIds: [zedPrice.id] },
    { text: "Zed is listed at $8 per month.", role: "supporting", factIds: [zedPrice.id] },
    { text: "Zed is cheaper and 30% faster.", role: "supporting", factIds: [budget.id] },
    { text: "Zed is great.", role: "supporting", factIds: [] },
    { text: "Zed exists.", role: "supporting", factIds: ["F999"] },
    { text: "Try it on one bug.", role: "next_step", factIds: [] },
  ], facts);
  assert.equal(r.ok.length, 2);
  assert.deepEqual(r.ok[0]!.evidenceIds, ["evZ"]);
  assert.equal(r.problems.length, 4);
});
