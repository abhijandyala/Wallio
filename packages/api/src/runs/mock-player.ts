/**
 * Demo playback for RUN_MODE=mock, so the UI can be built before the real
 * orchestrator (P4) and runner exist. It drives the real state machine and
 * writes real rows, but every evidence item and the recommendation say plainly
 * that they are sample data. Replaced by the orchestrator in live mode.
 */
import { createHash } from "node:crypto";
import { api, type RunStatus } from "@wallio/contracts";
import type { Db, Query } from "../db/pool.ts";
import { appendEvent, changeStage, transition, TERMINAL } from "./state.ts";

/** States another actor (cancel, failure handling) moves a run into. SUCCEEDED and CLEANING are the player's own. */
const STOPPED_ELSEWHERE: ReadonlySet<RunStatus> = new Set(["CANCELLED", "FAILED", "TIMED_OUT", "CLEANED", "CLEANUP_FAILED"]);

const SAMPLE_LIMITATION ="Sample evidence from demo playback; not captured by a live browser in this run.";
const fakeHash = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;

interface Ctx { db: Db; tenantId: string; runId: string; stepMs: number }

async function step(ctx: Ctx, fn: (q: Query) => Promise<void>): Promise<boolean> {
  await new Promise((r) => setTimeout(r, ctx.stepMs));
  return ctx.db.withTenant(ctx.tenantId, async (q) => {
    const s = await q<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId]);
    const status = s.rows[0]?.status;
    if (!status || STOPPED_ELSEWHERE.has(status)) return false; // cancelled, failed or already cleaned: stop
    await fn(q);
    return true;
  });
}

async function addEvidence(q: Query, ctx: Ctx, e: { kind: string; toolId: string | null; mode: string; url: string; excerpt: string }): Promise<string> {
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
    message: e.mode === "tested_owned_demo" ? "Recorded the sample test result" : `Recorded sample pricing evidence`,
    data: { evidenceId: r.rows[0]!.id, kind: e.kind, url: e.url, candidateToolId: e.toolId },
  });
  return r.rows[0]!.id;
}

export async function playMockRun(db: Db, tenantId: string, runId: string, stepMs: number): Promise<void> {
  const ctx: Ctx = { db, tenantId, runId, stepMs };
  const ev: Record<string, string> = {};
  try {
    const run = await db.withTenant(tenantId, (q) =>
      q<{ request: any; profile_version_id: string }>(
        `SELECT c.request, (c.request->>'profileVersionId') AS profile_version_id
           FROM runs r JOIN comparisons c ON c.id = r.comparison_id WHERE r.id = $1 AND r.tenant_id = $2`,
        [runId, tenantId],
      ),
    );
    const req = run.rows[0]!.request as { incumbentToolId: string; candidateToolIds: string[]; profileVersionId: string };
    const incumbent = req.incumbentToolId;
    const candidate = req.candidateToolIds[0]!;
    const tools = await db.withSystem((q) => q<{ id: string; name: string; pricing_url: string | null; homepage_url: string }>(
      "SELECT id, name, pricing_url, homepage_url FROM catalog_tools WHERE id = ANY($1)", [[incumbent, candidate]]));
    const t = Object.fromEntries(tools.rows.map((r) => [r.id, r]));
    const urlOf = (id: string) => t[id]?.pricing_url ?? t[id]?.homepage_url ?? "https://example.com/";

    const steps: Array<(q: Query) => Promise<void>> = [
      async (q) => {
        await appendEvent(q, tenantId, runId, { type: "warning", message: "Demo playback: this run uses sample data, not a live browser", data: { detail: "RUN_MODE=mock" } });
        await transition(q, tenantId, runId, "PREPARING");
      },
      async (q) => { await transition(q, tenantId, runId, "RUNNING"); },
      async (q) => {
        await appendEvent(q, tenantId, runId, { type: "inference_call", message: "Planned the research (sample)", data: { purpose: "plan", model: "mock-playback", latencyMs: 0, ok: true } });
        await changeStage(q, tenantId, runId, "researching", "Researching official pricing pages");
      },
      async (q) => {
        await appendEvent(q, tenantId, runId, { type: "step", message: `Opening the ${t[incumbent]?.name ?? "incumbent"} pricing page`, data: { stepIndex: 0, maxSteps: 20, actionType: "navigate", url: urlOf(incumbent), candidateToolId: incumbent } });
      },
      async (q) => { ev.inc = await addEvidence(q, ctx, { kind: "vendor_claim", toolId: incumbent, mode: "researched", url: urlOf(incumbent), excerpt: `Sample: ${t[incumbent]?.name} pricing page` }); },
      async (q) => {
        await appendEvent(q, tenantId, runId, { type: "step", message: `Opening the ${t[candidate]?.name ?? "candidate"} pricing page`, data: { stepIndex: 1, maxSteps: 20, actionType: "navigate", url: urlOf(candidate), candidateToolId: candidate } });
      },
      async (q) => { ev.cand = await addEvidence(q, ctx, { kind: "vendor_claim", toolId: candidate, mode: "researched", url: urlOf(candidate), excerpt: `Sample: ${t[candidate]?.name} pricing page` }); },
      async (q) => { await changeStage(q, tenantId, runId, "testing", "Running the sample task in the owned test page"); },
      async (q) => { ev.test = await addEvidence(q, ctx, { kind: "executed_test", toolId: null, mode: "tested_owned_demo", url: "https://eval.wallio.example/run/sample", excerpt: "Sample: off-by-one test PASS" }); },
      async (q) => { await transition(q, tenantId, runId, "VERIFYING", { stage: "verifying" }); },
      async (q) => {
        await changeStage(q, tenantId, runId, "reporting", "Writing the recommendation");
        const recId = await storeSampleRecommendation(q, ctx, req.profileVersionId, incumbent, candidate, t, ev);
        await q("UPDATE runs SET recommendation_id = $3 WHERE id = $1 AND tenant_id = $2", [runId, tenantId, recId]);
        await appendEvent(q, tenantId, runId, { type: "result_ready", message: "Recommendation ready (sample)", data: { recommendationId: recId, outcome: "succeeded" } });
        await transition(q, tenantId, runId, "SUCCEEDED", { outcome: "succeeded" });
      },
      async (q) => { await transition(q, tenantId, runId, "CLEANING", { cleanup: "pending" }); },
      async (q) => {
        await appendEvent(q, tenantId, runId, { type: "cleanup", message: "Nothing to clean up in demo playback", data: { result: "cleaned", containerRemoved: true, volumeRemoved: true } });
        await transition(q, tenantId, runId, "CLEANED", { cleanup: "cleaned", stage: "done" });
      },
    ];
    for (const s of steps) if (!(await step(ctx, s))) return;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "mock run failed", runId, error: (err as Error).message }));
    await db.withTenant(tenantId, async (q) => {
      const s = (await q<{ status: RunStatus }>("SELECT status FROM runs WHERE id = $1 AND tenant_id = $2", [runId, tenantId])).rows[0]?.status;
      if (s && !TERMINAL.has(s)) {
        await transition(q, tenantId, runId, "FAILED", { outcome: "failed", error: { code: "internal", message: "Demo playback failed.", correlationId: runId, retryable: true } });
        await transition(q, tenantId, runId, "CLEANING", { cleanup: "pending" });
        await transition(q, tenantId, runId, "CLEANED", { cleanup: "cleaned", stage: "done" });
      }
    }).catch(() => {});
  }
}

async function storeSampleRecommendation(
  q: Query, ctx: Ctx, profileVersionId: string, incumbent: string, candidate: string,
  t: Record<string, { name: string }>, ev: Record<string, string>,
): Promise<string> {
  const evRows = await q("SELECT * FROM evidence WHERE tenant_id = $1 AND run_id = $2 ORDER BY created_at", [ctx.tenantId, ctx.runId]);
  const evidence = evRows.rows.map(evidenceToContract);
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
  const ins = await q<{ id: string }>(
    "INSERT INTO recommendations (tenant_id, run_id, profile_version_id, body) VALUES ($1,$2,$3,$4) RETURNING id",
    [ctx.tenantId, ctx.runId, profileVersionId, body],
  );
  const id = ins.rows[0]!.id;
  const full = { ...body, id };
  const check = api.Recommendation.safeParse(full);
  if (!check.success) throw new Error(`sample recommendation breaks the contract: ${check.error.issues.map((i) => i.message).join("; ")}`);
  await q("UPDATE recommendations SET body = $3 WHERE id = $1 AND tenant_id = $2", [id, ctx.tenantId, full]);
  return id;
}

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
