/**
 * Executors and cleaners per run mode.
 *
 * mock: demo playback for UI development. It drives the real orchestrator
 *       (queue, lease, deadline, cleanup) and writes real rows, but every
 *       evidence item and the recommendation say plainly they are sample data.
 * live: the real planner + browser runner. Arrives in P5; until then a live
 *       run fails honestly with runner_unavailable.
 */
import { createHash } from "node:crypto";
import { api } from "@wallio/contracts";
import type { Query } from "../db/pool.ts";
import { appendEvent } from "./state.ts";
import { RunFailure, type Cleaner, type CleanupReport, type ExecResult, type RunContext, type RunExecutor } from "./worker.ts";

const SAMPLE_LIMITATION = "Sample evidence from demo playback; not captured by a live browser in this run.";
const fakeHash = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;

export function evidenceToContract(r: any) {
  return {
    id: r.id,
    runId: r.run_id,
    kind: r.kind,
    candidateToolId: r.candidate_tool_id,
    accessMode: r.access_mode,
    url: r.url,
    canonicalUrl: r.canonical_url,
    capturedAt: new Date(r.captured_at).toISOString(),
    contentHash: r.content_hash,
    hasScreenshot: Boolean(r.screenshot_key),
    extractionMethod: r.extraction_method,
    excerpt: r.excerpt,
    limitation: r.limitation,
  };
}

export class MockExecutor implements RunExecutor {
  stepMs: number;
  constructor(stepMs: number) {
    this.stepMs = stepMs;
  }

  async execute(ctx: RunContext): Promise<ExecResult> {
    const { tenantId, runId } = ctx;
    const req = await ctx.q(async (q) =>
      (await q("SELECT c.request FROM runs r JOIN comparisons c ON c.id = r.comparison_id WHERE r.id = $1 AND r.tenant_id = $2", [runId, tenantId])).rows[0]!.request as {
        incumbentToolId: string; candidateToolIds: string[]; profileVersionId: string;
      });
    const incumbent = req.incumbentToolId;
    const candidate = req.candidateToolIds[0]!;
    const tools = await ctx.q(async (q) =>
      Object.fromEntries((await q<{ id: string; name: string; pricing_url: string | null; homepage_url: string }>("SELECT id, name, pricing_url, homepage_url FROM catalog_tools WHERE id = ANY($1)", [[incumbent, candidate]])).rows.map((r) => [r.id, r])));
    const urlOf = (id: string) => tools[id]?.pricing_url ?? tools[id]?.homepage_url ?? "https://example.com/";
    const ev: Record<string, string> = {};
    const step = async (fn: (q: Query) => Promise<void>) => {
      await ctx.sleep(this.stepMs);
      await ctx.q(fn);
    };

    await ctx.emit({ type: "warning", message: "Demo playback: this run uses sample data, not a live browser", data: { detail: "RUN_MODE=mock" } });
    await step((q) => appendEvent(q, tenantId, runId, { type: "inference_call", message: "Planned the research (sample)", data: { purpose: "plan", model: "mock-playback", latencyMs: 0, ok: true } }).then(() => {}));
    await ctx.sleep(this.stepMs);
    await ctx.stage("researching", "Researching official pricing pages");
    await step((q) => appendEvent(q, tenantId, runId, { type: "step", message: `Opening the ${tools[incumbent]?.name ?? "incumbent"} pricing page`, data: { stepIndex: 0, maxSteps: 20, actionType: "navigate", url: urlOf(incumbent), candidateToolId: incumbent } }).then(() => {}));
    await step(async (q) => { ev.inc = await addEvidence(q, ctx, { kind: "vendor_claim", toolId: incumbent, mode: "researched", url: urlOf(incumbent), excerpt: `Sample: ${tools[incumbent]?.name} pricing page` }); });
    await step((q) => appendEvent(q, tenantId, runId, { type: "step", message: `Opening the ${tools[candidate]?.name ?? "candidate"} pricing page`, data: { stepIndex: 1, maxSteps: 20, actionType: "navigate", url: urlOf(candidate), candidateToolId: candidate } }).then(() => {}));
    await step(async (q) => { ev.cand = await addEvidence(q, ctx, { kind: "vendor_claim", toolId: candidate, mode: "researched", url: urlOf(candidate), excerpt: `Sample: ${tools[candidate]?.name} pricing page` }); });
    await ctx.sleep(this.stepMs);
    await ctx.stage("testing", "Running the sample task in the owned test page");
    await step(async (q) => { ev.test = await addEvidence(q, ctx, { kind: "executed_test", toolId: null, mode: "tested_owned_demo", url: "https://eval.wallio.example/run/sample", excerpt: "Sample: off-by-one test PASS" }); });
    await ctx.sleep(this.stepMs);
    await ctx.transition("VERIFYING", { stage: "verifying" });
    await step(async (q) => {
      await q("UPDATE runs SET stage = 'reporting' WHERE id = $1 AND tenant_id = $2", [runId, tenantId]);
      await appendEvent(q, tenantId, runId, { type: "stage_changed", stage: "reporting", message: "Writing the recommendation", data: { from: "verifying", to: "reporting" } });
      const recId = await storeSampleRecommendation(q, ctx, req.profileVersionId, incumbent, candidate, tools, ev);
      await q("UPDATE runs SET recommendation_id = $3 WHERE id = $1 AND tenant_id = $2", [runId, tenantId, recId]);
      await appendEvent(q, tenantId, runId, { type: "result_ready", message: "Recommendation ready (sample)", data: { recommendationId: recId, outcome: "succeeded" } });
    });
    return { outcome: "succeeded" };
  }
}

async function addEvidence(q: Query, ctx: RunContext, e: { kind: string; toolId: string | null; mode: string; url: string; excerpt: string }): Promise<string> {
  const r = await q<{ id: string }>(
    `INSERT INTO evidence (tenant_id, run_id, kind, candidate_tool_id, access_mode, url, canonical_url, captured_at, content_hash, extraction_method, excerpt, limitation)
     VALUES ($1,$2,$3,$4,$5,$6,$6,now(),$7,'manual',$8,$9) RETURNING id`,
    [ctx.tenantId, ctx.runId, e.kind, e.toolId, e.mode, e.url, fakeHash(e.url + e.excerpt), e.excerpt, SAMPLE_LIMITATION],
  );
  await q(
    `UPDATE runs SET evidence_count = evidence_count + 1,
       candidates_researched = candidates_researched + CASE WHEN $3 = 'researched' THEN 1 ELSE 0 END,
       candidates_tested = candidates_tested + CASE WHEN $3 = 'tested_owned_demo' THEN 1 ELSE 0 END
     WHERE id = $1 AND tenant_id = $2`,
    [ctx.runId, ctx.tenantId, e.mode],
  );
  await appendEvent(q, ctx.tenantId, ctx.runId, {
    type: "evidence_captured",
    message: e.mode === "tested_owned_demo" ? "Recorded the sample test result" : "Recorded sample pricing evidence",
    data: { evidenceId: r.rows[0]!.id, kind: e.kind, url: e.url, candidateToolId: e.toolId },
  });
  return r.rows[0]!.id;
}

async function storeSampleRecommendation(
  q: Query, ctx: RunContext, profileVersionId: string, incumbent: string, candidate: string,
  t: Record<string, { name: string }>, ev: Record<string, string>,
): Promise<string> {
  const evidence = (await q("SELECT * FROM evidence WHERE tenant_id = $1 AND run_id = $2 ORDER BY created_at", [ctx.tenantId, ctx.runId])).rows.map(evidenceToContract);
  const inc = t[incumbent]?.name ?? "your current tool";
  const cand = t[candidate]?.name ?? "the alternative";
  const body = {
    id: "pending",
    runId: ctx.runId,
    profileVersionId,
    calculationVersion: "sample",
    createdAt: new Date().toISOString(),
    goal: `Decide whether to keep ${inc} for debugging or try ${cand}`,
    action: "compare_further",
    targetToolId: candidate,
    headline: `Sample result: run a live comparison before deciding between ${inc} and ${cand}`,
    statements: [
      { text: `This is demo playback. The pricing captures for ${inc} and ${cand} are placeholders.`, role: "uncertainty", evidenceIds: [ev.inc, ev.cand], userInputRefs: [] },
      { text: "The sample test result shows how a passed task will appear; it was not executed.", role: "uncertainty", evidenceIds: [ev.test], userInputRefs: [] },
      { text: "Run the comparison in live mode to get real captures and a real recommendation.", role: "next_step", evidenceIds: [], userInputRefs: [] },
    ],
    candidates: [
      { toolId: incumbent, role: "incumbent", accessMode: "researched", hardConstraints: { passed: true, failures: [] }, score: null, known: [], missing: ["Live pricing capture"], needsTesting: ["Quality on your own task"], testResult: null },
      { toolId: candidate, role: "candidate", accessMode: "researched", hardConstraints: { passed: true, failures: [] }, score: null, known: [], missing: ["Live pricing capture", "Privacy policy"], needsTesting: ["Quality on your own task"], testResult: null },
    ],
    spending: { currency: "USD", scenarios: [] },
    confidence: "low",
    limitations: ["Demo playback: no live browser, no real model calls, no real test."],
    evidence,
  };
  const id = (await q<{ id: string }>("INSERT INTO recommendations (tenant_id, run_id, profile_version_id, body) VALUES ($1,$2,$3,$4) RETURNING id", [ctx.tenantId, ctx.runId, profileVersionId, body])).rows[0]!.id;
  const full = { ...body, id };
  const check = api.Recommendation.safeParse(full);
  if (!check.success) throw new Error(`sample recommendation breaks the contract: ${check.error.issues.map((i) => i.message).join("; ")}`);
  await q("UPDATE recommendations SET body = $3 WHERE id = $1 AND tenant_id = $2", [id, ctx.tenantId, full]);
  return id;
}

export class MockCleaner implements Cleaner {
  async cleanup(): Promise<CleanupReport> {
    return { result: "cleaned", containerRemoved: true, volumeRemoved: true, detail: "Nothing to clean up in demo playback" };
  }
}

/** Replaced by the planner + runner client in P5. */
export class LiveExecutorUnavailable implements RunExecutor {
  async execute(): Promise<ExecResult> {
    throw new RunFailure("runner_unavailable", "Live comparisons aren't connected to the browser runner yet. Use demo mode for now.");
  }
}

/** Until the runner client exists (P5), a live run never starts a browser, so there is nothing to remove. */
export class NoRunnerCleaner implements Cleaner {
  async cleanup(args: { runnerJobId: string | null }): Promise<CleanupReport> {
    if (args.runnerJobId) return { result: "failed", containerRemoved: false, volumeRemoved: false, detail: "A runner job exists but no runner client is configured to remove it." };
    return { result: "cleaned", containerRemoved: true, volumeRemoved: true, detail: "No browser was started for this comparison" };
  }
}
