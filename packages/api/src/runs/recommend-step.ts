/**
 * Turns a run's research (runs.knowledge + evidence) and the user's inputs into a
 * stored, contract-valid Recommendation (P6).
 */
import { api } from "@wallio/contracts";
import type { InferenceGateway } from "../inference/index.ts";
import { assessments, buildFacts, CALCULATION_VERSION, decide, explain, headline, spendingScenarios, type RecommendInput } from "../domain/recommend.ts";
import { monthlyEquivalentMinor, renewalAmountMinor, type SubscriptionForSpend } from "../domain/spending.ts";
import type { ToolFacts, Topic } from "../domain/scoring.ts";
import { evidenceToContract } from "./executors.ts";
import type { RunKnowledge } from "./live-executor.ts";
import type { RunContext } from "./worker.ts";

export async function writeRecommendation(ctx: RunContext, gw: InferenceGateway, infer: <T>(fn: () => Promise<T>) => Promise<T>): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const data = await ctx.q(async (q) => {
    const row = (await q(
      `SELECT r.knowledge, c.request, p.id AS profile_id, p.body AS profile
         FROM runs r JOIN comparisons c ON c.id = r.comparison_id
         JOIN profile_versions p ON p.id = (c.request->>'profileVersionId')::uuid AND p.tenant_id = r.tenant_id
        WHERE r.id = $1 AND r.tenant_id = $2`,
      [ctx.runId, ctx.tenantId],
    )).rows[0];
    const req = row.request as { incumbentToolId: string; candidateToolIds: string[]; workflowId: string; weights?: RecommendInput["weights"] };
    const ids = [req.incumbentToolId, ...req.candidateToolIds];
    const names = Object.fromEntries((await q("SELECT id, name FROM catalog_tools WHERE id = ANY($1)", [ids])).rows.map((r) => [r.id, r.name]));
    const subs = (await q("SELECT * FROM subscriptions WHERE tenant_id = $1 AND tool_id = ANY($2) AND status = 'active'", [ctx.tenantId, ids])).rows;
    const evidence = (await q("SELECT * FROM evidence WHERE tenant_id = $1 AND run_id = $2 ORDER BY created_at", [ctx.tenantId, ctx.runId])).rows;
    return { knowledge: row.knowledge as RunKnowledge, req, ids, names, subs, evidence, profileId: row.profile_id as string, profile: row.profile };
  });

  const { knowledge, req, names, subs, evidence, profile } = data;
  const toSpend = (s: any): SubscriptionForSpend => ({
    id: s.id, cadence: s.cadence, seats: s.seats, renewalDate: s.renewal_date, status: s.status,
    price: s.price_known ? { known: true, amountMinor: Number(s.amount_minor), currency: s.currency.trim() } : { known: false, reason: s.unknown_reason },
  });

  const tools: ToolFacts[] = data.ids.map((id) => {
    const tk = knowledge.tools[id] ?? { known: [], missing: [], needsTesting: [], blocked: [] };
    const sub = subs.find((s) => s.tool_id === id);
    const monthly = sub ? monthlyEquivalentMinor(toSpend(sub), profile.budget.currency) : null;
    return {
      toolId: id, name: names[id] ?? id, role: id === req.incumbentToolId ? "incumbent" : "candidate",
      userPrice: sub && monthly !== null ? { monthlyMinor: monthly, subscriptionId: sub.id } : null,
      known: tk.known, missing: tk.missing, blocked: tk.blocked, test: null,
      evidenceCount: evidence.filter((e) => e.candidate_tool_id === id).length,
    };
  });

  const incSub = subs.find((s) => s.tool_id === req.incumbentToolId);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const renewalAmt = incSub ? renewalAmountMinor(toSpend(incSub)) : null;
  const incumbentRenewal = incSub && incSub.renewal_date && incSub.renewal_date >= today && incSub.renewal_date <= in30 && renewalAmt !== null
    ? { date: incSub.renewal_date as string, amountMinor: renewalAmt, subscriptionId: incSub.id as string, cadence: incSub.cadence as string }
    : null;

  const topics = new Map(knowledge.questions.map((q) => [q.question, q.topic as Topic]));
  const wf = profile.workflows.find((w: { id: string }) => w.id === req.workflowId) ?? profile.workflows[0];
  const input: RecommendInput = {
    goal: `Decide whether to keep ${tools[0]!.name} for ${String(wf.name).toLowerCase()} or try ${tools.slice(1).map((t) => t.name).join(", ")}`,
    tools,
    profile: {
      budgetMonthlyMinor: profile.budget.maxMonthlyMinor, currency: profile.budget.currency, dataSensitivity: profile.dataSensitivity,
      requiredIntegrations: profile.requiredIntegrations, willingnessToSwitch: profile.willingnessToSwitch,
    },
    topicOf: (q) => topics.get(q) ?? "other",
    incumbentRenewal,
    harness: knowledge.harness ?? null,
    today,
    weights: req.weights,
  };

  const as = assessments(input);
  const decision = decide(as, tools, incumbentRenewal !== null);
  const facts = buildFacts(input, as, decision);
  const expl = await infer(() => explain(gw, ctx.correlationId, input, decision, facts));
  if (expl.by === "template") {
    await ctx.emit({ type: "warning", message: "The AI explanation didn't pass the citation checks, so a plain template was used", data: { detail: expl.problems.join("; ").slice(0, 200) || "template" } });
  }

  const limitations = [
    "Prices and features are what each vendor's page said at capture time, before tax.",
    "Neither product was tested on your own task; published claims are not measured results.",
    ...tools.flatMap((t) => t.blocked.map((b) => `A ${t.name} page couldn't be read (${b.reason.replace(/_/g, " ")}).`)),
    ...(knowledge.harness ? [`The owned test (${knowledge.harness.passed}/${knowledge.harness.total} passed) measures Wallio's harness on a Vultr model, not the products compared.`] : []),
    ...(expl.by === "template" ? ["The explanation was written from a template because the AI version failed its checks."] : []),
  ];

  const body = {
    id: "pending",
    runId: ctx.runId,
    profileVersionId: data.profileId,
    calculationVersion: CALCULATION_VERSION,
    createdAt: new Date().toISOString(),
    goal: input.goal,
    action: decision.action,
    targetToolId: decision.targetToolId,
    headline: headline(decision, input),
    statements: expl.statements,
    candidates: as.map((a) => {
      const t = tools.find((x) => x.toolId === a.toolId)!;
      return {
        toolId: a.toolId, role: a.role, accessMode: a.accessMode,
        hardConstraints: { passed: a.hardConstraints.passed, failures: a.hardConstraints.failures },
        score: { min: a.min, max: a.max, components: Object.fromEntries(Object.entries(a.components).map(([k, c]) => [k, { value: c.value, weight: c.weight, evidenceIds: c.evidenceIds }])) },
        known: t.known.map((k) => k.statement).slice(0, 8),
        missing: [...a.hardConstraints.unknown, ...t.missing].slice(0, 10),
        needsTesting: (knowledge.tools[a.toolId]?.needsTesting ?? []).slice(0, 5),
        testResult: null,
      };
    }),
    spending: { currency: profile.budget.currency, scenarios: spendingScenarios(input, as, decision) },
    confidence: decision.confidence,
    limitations,
    evidence: evidence.map(evidenceToContract),
  };

  return ctx.q(async (q) => {
    const id = (await q<{ id: string }>("INSERT INTO recommendations (tenant_id, run_id, profile_version_id, body) VALUES ($1,$2,$3,$4) RETURNING id", [ctx.tenantId, ctx.runId, data.profileId, body])).rows[0]!.id;
    const full = { ...body, id };
    const check = api.Recommendation.safeParse(full);
    if (!check.success) throw new Error(`recommendation breaks the contract: ${check.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    await q("UPDATE recommendations SET body = $3 WHERE id = $1 AND tenant_id = $2", [id, ctx.tenantId, full]);
    await q("UPDATE runs SET recommendation_id = $3 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId, id]);
    return id;
  });
}
