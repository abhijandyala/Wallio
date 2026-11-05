/**
 * Live research run (P5): plan → policy-checked browser steps through the
 * runner → stored evidence (text hash + screenshot) → grounded findings →
 * per-tool knowledge (known / missing / needs testing).
 *
 * Scoring and the recommendation are P6; the owned task test and approvals are
 * later phases. This executor never fills forms or clicks anything with an
 * external effect.
 */
import { createHash } from "node:crypto";
import type { runner as rc } from "@wallio/contracts";
import type { InferenceGateway, UsageRecord } from "../inference/index.ts";
import { InferenceError } from "../inference/index.ts";
import { RunnerClient, RunnerError } from "../runner/client.ts";
import { checkAction, observationInPolicy, type PolicySpec, type PolicyState } from "../runner/policy.ts";
import { extractFindings, type Finding } from "../research/extract.ts";
import { baselineQuestions, defaultPages, planResearch, policyFor, type PlanOutcome, type ProfileForPlan, type ToolForPlan } from "../research/planner.ts";
import { writeRecommendation } from "./recommend-step.ts";
import { newEvalToken, parseResult, proposeFix } from "../eval/harness.ts";
import { RunFailure, type Cleaner, type CleanupReport, type ExecResult, type RunContext, type RunExecutor } from "./worker.ts";

const sha256 = (b: Buffer | string) => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const LIMITATION = "What the vendor's own page said at capture time. A published claim, not verified by testing.";

export interface ToolKnowledge {
  known: Array<Finding & { evidenceId: string }>;
  missing: string[];
  needsTesting: string[];
  blocked: Array<{ url: string; reason: string }>;
}
export interface HarnessResult { passed: number; total: number; pass: boolean; model: string; evidenceId: string }
export interface RunKnowledge {
  harness?: HarnessResult | null;
  plannedBy: "model" | "default";
  questions: Array<{ toolId: string; topic: string; question: string }>;
  tools: Record<string, ToolKnowledge>;
}

export interface LiveExecutorDeps {
  runner: RunnerClient;
  /** Creates a gateway whose usage records are passed to onUsage. */
  gateway: (onUsage: (u: UsageRecord) => void) => InferenceGateway;
  /** Hosts the runner may reach besides the tools' own (owned eval/form pages), host → path prefixes. */
  ownedHosts?: Record<string, string[]>;
  /** Public https origin serving /eval/<token>. Without it the testing stage is skipped. */
  evalBaseUrl?: string | null;
}

export class LiveExecutor implements RunExecutor {
  private readonly deps: LiveExecutorDeps;
  constructor(deps: LiveExecutorDeps) {
    this.deps = deps;
  }

  private runHarness(ctx: RunContext, gw: InferenceGateway, infer: <T>(fn: () => Promise<T>) => Promise<T>, act: Act) {
    return runHarnessStage({ runner: this.deps.runner, evalBaseUrl: this.deps.evalBaseUrl! }, ctx, gw, infer, act);
  }

  async execute(ctx: RunContext): Promise<ExecResult> {
    const { runner } = this.deps;
    const pending: UsageRecord[] = [];
    const gw = this.deps.gateway((u) => pending.push(u));
    /** Runs a model call, then charges its usage (the per-run cap applies here). */
    const infer = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } finally {
        for (const u of pending.splice(0)) await ctx.recordInference(u);
      }
    };

    // ── inputs ──
    const { tools, profile, goal } = await ctx.q(async (q) => {
      const row = (await q(
        `SELECT c.request, p.body AS profile FROM runs r JOIN comparisons c ON c.id = r.comparison_id
           JOIN profile_versions p ON p.id = (c.request->>'profileVersionId')::uuid AND p.tenant_id = r.tenant_id
          WHERE r.id = $1 AND r.tenant_id = $2`,
        [ctx.runId, ctx.tenantId],
      )).rows[0];
      const req = row.request as { incumbentToolId: string; candidateToolIds: string[]; workflowId: string };
      const ids = [req.incumbentToolId, ...req.candidateToolIds];
      const rows = (await q("SELECT id, name, homepage_url, pricing_url FROM catalog_tools WHERE id = ANY($1)", [ids])).rows;
      const tools: ToolForPlan[] = ids.map((id) => {
        const t = rows.find((r) => r.id === id)!;
        return { id, name: t.name, role: id === req.incumbentToolId ? "incumbent" : "candidate", homepageUrl: t.homepage_url, pricingUrl: t.pricing_url };
      });
      const p = row.profile;
      const wf = p.workflows.find((w: { id: string }) => w.id === req.workflowId) ?? p.workflows[0];
      const profile: ProfileForPlan = {
        primaryRole: p.primaryRole, topWorkflow: wf.name, budgetMonthlyMinor: p.budget.maxMonthlyMinor, currency: p.budget.currency,
        dataSensitivity: p.dataSensitivity, requiredIntegrations: p.requiredIntegrations,
      };
      return { tools, profile, goal: `Decide whether to keep ${tools[0]!.name} for ${wf.name.toLowerCase()} or try ${tools.slice(1).map((t) => t.name).join(", ")}` };
    });

    const owned: Record<string, string[]> = { ...(this.deps.ownedHosts ?? {}) };
    if (this.deps.evalBaseUrl) (owned[new URL(this.deps.evalBaseUrl).hostname] ??= []).push("/eval");
    const policy: PolicySpec = policyFor(tools, owned, { maxActions: 20, maxScreenshots: 12, deadlineAt: ctx.deadlineAt });

    // ── plan ──
    let plan: PlanOutcome;
    try {
      plan = await infer(() => planResearch(gw, { correlationId: ctx.runId, goal, tools, profile, policy }));
    } catch (e) {
      if (!(e instanceof InferenceError)) throw e;
      plan = { pages: defaultPages(tools), questions: baselineQuestions(tools, profile), plannedBy: "default", refused: [] };
      await ctx.emit({ type: "warning", message: "The AI plan was unusable, so the official pricing pages are used", data: { detail: e.code } });
    }
    for (const r of plan.refused) {
      await ctx.emit({ type: "policy_denied", message: "Skipped a proposed page outside the allowed sites", data: { attemptedAction: "navigate", target: r.url.slice(0, 200), reason: r.reason } });
    }

    // ── runner job ──
    const allowedHosts = Object.keys(policy.allowed);
    const deadlineMs = Math.max(10_000, Math.min(180_000, ctx.deadlineAt.getTime() - Date.now() - 5_000));
    let job: rc.RunnerJobStatus;
    try {
      job = await runner.createJob({
        jobId: `job_${ctx.runId}`, runId: ctx.runId, correlationId: ctx.runId,
        purpose: `Research official pages for ${tools.map((t) => t.name).join(" and ")}`.slice(0, 200),
        allowedHosts, limits: { deadlineMs, maxActions: policy.maxActions, maxScreenshots: policy.maxScreenshots },
      });
    } catch (e) {
      throw new RunFailure("runner_unavailable", "The browser runner isn't reachable right now. Try again in a minute.");
    }
    // Persist the resource id before doing anything else, so cleanup can always find it (PRD §15).
    await ctx.q((q) => q("UPDATE runs SET runner_job_id = $3 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId, job.jobId]));
    await ctx.stage("researching", "Researching official pages in an isolated browser");

    // ── browse ──
    const state: PolicyState = { actionsUsed: 0, screenshotsUsed: 0, elements: null };
    let step = 0;
    const knowledge: RunKnowledge = {
      plannedBy: plan.plannedBy,
      questions: plan.questions,
      tools: Object.fromEntries(tools.map((t) => [t.id, { known: [], missing: [], needsTesting: ["Quality on your own debugging task"], blocked: [] }])),
    };

    const act = async (action: rc.RunnerAction, toolId: string | null, displayUrl?: string): Promise<rc.RunnerActionResult | null> => {
      ctx.checkpoint();
      const d = checkAction(policy, state, action);
      if (!d.ok) {
        await ctx.emit({ type: "policy_denied", message: d.needsApproval ? "Held an action that needs your approval" : "Refused an action outside policy", data: { attemptedAction: action.type, target: "url" in action ? action.url.slice(0, 200) : action.type, reason: d.reason } });
        return null;
      }
      const stepIndex = step++;
      if (action.type === "navigate") {
        const shown = displayUrl ?? action.url;
        await ctx.emit({ type: "step", message: `Opening ${new URL(shown).hostname}${new URL(shown).pathname}`.slice(0, 300), data: { stepIndex, maxSteps: policy.maxActions, actionType: "navigate", url: shown, candidateToolId: toolId } });
      }
      // Read-only navigation is retried at most twice on a transient failure (PRD §15).
      for (let attempt = 0; ; attempt++) {
        let res: rc.RunnerActionResult;
        try {
          res = await runner.act(job.jobId, { actionId: `a_${ctx.runId.slice(0, 8)}_${stepIndex}_${attempt}`, stepIndex, action });
        } catch (e) {
          if (e instanceof RunnerError && e.code === "deadline_exceeded") throw new RunFailure("runner_timeout", "The browser hit its time limit.");
          throw new RunFailure("runner_unavailable", "The browser runner stopped responding during research.");
        }
        state.actionsUsed++;
        if (action.type === "screenshot" && res.status === "ok") state.screenshotsUsed++;
        if (res.status === "ok" || action.type !== "navigate" || !res.error?.retryable || attempt >= 2) return res;
        ctx.checkpoint();
      }
    };

    for (const page of plan.pages) {
      const tool = tools.find((t) => t.id === page.toolId)!;
      const tk = knowledge.tools[tool.id]!;
      const nav = await act({ type: "navigate", url: page.url }, tool.id);
      if (!nav) { tk.blocked.push({ url: page.url, reason: "refused by policy" }); continue; }
      for (const dr of nav.observation?.deniedRequests ?? []) {
        await ctx.emit({ type: "policy_denied", message: "The runner blocked a request outside the allowed sites", data: { attemptedAction: "request", target: dr.url.slice(0, 200), reason: dr.reason } });
      }
      if (nav.status !== "ok" || !nav.observation) {
        tk.blocked.push({ url: page.url, reason: nav.error?.message ?? nav.status });
        await ctx.emit({ type: "warning", message: `Couldn't open a ${tool.name} page; continuing with partial evidence`, data: { detail: nav.error?.code ?? nav.status } });
        continue;
      }
      const obs = nav.observation;
      if (obs.blocked) {
        tk.blocked.push({ url: page.url, reason: obs.blocked.reason });
        await ctx.emit({ type: "warning", message: `A ${tool.name} page asked for ${obs.blocked.reason.replace("_", " ")}; not bypassed`, data: { detail: obs.blocked.reason } });
        continue;
      }
      const inPolicy = observationInPolicy(policy, obs);
      if (!inPolicy.ok) {
        tk.blocked.push({ url: page.url, reason: inPolicy.reason });
        await ctx.emit({ type: "policy_denied", message: "The page redirected outside the allowed sites; its content was not used", data: { attemptedAction: "navigate", target: obs.url.slice(0, 200), reason: inPolicy.reason } });
        continue;
      }

      // Screenshot, copied out of the runner and checked against the hash it reported.
      let shot: { bytes: Buffer; hash: string } | null = null;
      const snap = await act({ type: "screenshot", fullPage: false }, tool.id);
      if (snap?.status === "ok" && snap.observation?.screenshot) {
        try {
          const bytes = await runner.artifact(snap.observation.screenshot.artifactId);
          if (sha256(bytes) === snap.observation.screenshot.sha256) shot = { bytes, hash: sha256(bytes) };
          else await ctx.emit({ type: "warning", message: "A screenshot didn't match its reported hash and was discarded", data: { detail: "hash_mismatch" } });
        } catch {
          await ctx.emit({ type: "warning", message: "A screenshot couldn't be downloaded; text evidence is kept", data: { detail: "artifact_failed" } });
        }
      }

      const text = obs.textExcerpt ?? "";
      const evidenceId = await ctx.q(async (q) => {
        const ev = (await q<{ id: string }>(
          `INSERT INTO evidence (tenant_id, run_id, kind, candidate_tool_id, access_mode, url, canonical_url, captured_at, content_hash, screenshot_key, extraction_method, excerpt, limitation)
           VALUES ($1,$2,'vendor_claim',$3,'researched',$4,$5,$6,$7,$8,'dom','',$9) RETURNING id`,
          [ctx.tenantId, ctx.runId, tool.id, obs.url, canonical(obs.url), obs.capturedAt, obs.textSha256 ?? sha256(text), shot ? "db" : null, LIMITATION],
        )).rows[0]!.id;
        if (shot) await q("INSERT INTO evidence_screenshots (evidence_id, tenant_id, sha256, mime, bytes) VALUES ($1,$2,$3,'image/png',$4)", [ev, ctx.tenantId, shot.hash, shot.bytes]);
        await q("UPDATE runs SET evidence_count = evidence_count + 1 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId]);
        return ev;
      });
      await ctx.emit({ type: "evidence_captured", message: `Captured ${tool.name}'s page${shot ? " with a screenshot" : ""}`, data: { evidenceId, kind: "vendor_claim", url: obs.url, candidateToolId: tool.id } });

      // Findings from the page text (untrusted), grounded by verbatim quotes.
      const questions = plan.questions.filter((q) => q.toolId === tool.id).map((q) => q.question);
      if (!text || !questions.length) continue;
      try {
        const r = await infer(() => extractFindings(gw, { correlationId: ctx.runId, toolName: tool.name, url: obs.url, pageText: text, questions }));
        for (const f of r.grounded) if (!tk.known.some((k) => k.question === f.question)) tk.known.push({ ...f, evidenceId });
        const excerpt = r.grounded.map((f) => `"${f.quote}"`).join(" … ").slice(0, 2000);
        await ctx.q((q) => q("UPDATE evidence SET excerpt = $3 WHERE id = $1 AND tenant_id = $2", [evidenceId, ctx.tenantId, excerpt]));
        if (r.ungrounded) await ctx.emit({ type: "warning", message: `Discarded ${r.ungrounded} AI finding(s) that weren't quoted from the page`, data: { detail: "ungrounded" } });
      } catch (e) {
        if (!(e instanceof InferenceError)) throw e;
        await ctx.emit({ type: "warning", message: `Couldn't read ${tool.name}'s page with the AI service; the capture is kept`, data: { detail: e.code } });
      }
    }

    // ── knowledge ──
    for (const t of tools) {
      const tk = knowledge.tools[t.id]!;
      tk.missing = plan.questions.filter((q) => q.toolId === t.id && !tk.known.some((k) => k.question === q.question)).map((q) => q.question);
    }
    await ctx.q((q) =>
      q(
        `UPDATE runs SET knowledge = $3,
           candidates_researched = (SELECT count(DISTINCT candidate_tool_id) FROM evidence WHERE run_id = $1 AND tenant_id = $2 AND access_mode = 'researched')
         WHERE id = $1 AND tenant_id = $2`,
        [ctx.runId, ctx.tenantId, knowledge],
      ),
    );
    const everyToolHasEvidence = tools.every((t) => knowledge.tools[t.id]!.blocked.length < plan.pages.filter((p) => p.toolId === t.id).length);

    // ── owned test (harness on Vultr, run inside the runner's browser) ──
    if (this.deps.evalBaseUrl) knowledge.harness = await this.runHarness(ctx, gw, infer, act);
    if (knowledge.harness !== undefined) await ctx.q((q) => q("UPDATE runs SET knowledge = $3 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId, knowledge]));

    // ── score and recommend (P6) ──
    await ctx.transition("VERIFYING", { stage: "verifying" });
    await ctx.stage("reporting", "Scoring the tools and writing the recommendation");
    const recommendationId = await writeRecommendation(ctx, gw, infer);
    await ctx.emit({ type: "result_ready", message: "Recommendation ready", data: { recommendationId, outcome: everyToolHasEvidence ? "succeeded" : "partial" } });
    return { outcome: everyToolHasEvidence ? "succeeded" : "partial" };
  }
}

type Act = (action: rc.RunnerAction, toolId: string | null, displayUrl?: string) => Promise<rc.RunnerActionResult | null>;

export interface HarnessDeps { runner: RunnerClient; evalBaseUrl: string }

/** Generates a fix on Vultr, opens the owned test page in the runner, records the result as evidence. */
export async function runHarnessStage(deps: HarnessDeps, ctx: RunContext, gw: InferenceGateway, infer: <T>(fn: () => Promise<T>) => Promise<T>, act: Act): Promise<HarnessResult | null> {
  await ctx.stage("testing", "Running the sample bug through a Vultr model in the owned test page");
  const task = await ctx.q(async (q) => {
    const r = (await q(`SELECT t.* FROM runs r JOIN comparisons c ON c.id = r.comparison_id JOIN eval_tasks t ON t.id = c.request->>'taskId' WHERE r.id = $1 AND r.tenant_id = $2`, [ctx.runId, ctx.tenantId])).rows[0];
    return r ? { id: r.id, title: r.title, description: r.description, sanitizedInput: r.sanitized_input, entrypoint: r.entrypoint, tests: r.tests } : null;
  });
  if (!task || !task.entrypoint || !task.tests.length) return null;
  let fix: { code: string; model: string };
  try {
    fix = await infer(() => proposeFix(gw, ctx.runId, task));
  } catch (e) {
    await ctx.emit({ type: "warning", message: "The model didn't produce a usable fix, so the owned test was skipped", data: { detail: (e as Error).message.slice(0, 200) } });
    return null;
  }
  const { token, hash } = newEvalToken();
  const sessionId = await ctx.q(async (q) =>
    (await q<{ id: string }>(`INSERT INTO eval_sessions (tenant_id, run_id, token_hash, task_id, candidate_code, model, expires_at) VALUES ($1,$2,$3,$4,$5,$6, now() + interval '10 minutes') RETURNING id`,
      [ctx.tenantId, ctx.runId, hash, task.id, fix.code, fix.model])).rows[0]!.id);
  const base = deps.evalBaseUrl.replace(/\/+$/, "");
  const shownUrl = `${base}/eval/session-${sessionId}`; // the token never appears in events or evidence

  const nav = await act({ type: "navigate", url: `${base}/eval/${token}` }, null, shownUrl);
  const result = parseResult(nav?.observation?.textExcerpt ?? null);
  if (!nav || nav.status !== "ok" || !result) {
    await ctx.emit({ type: "warning", message: "The owned test page didn't report a result", data: { detail: nav?.error?.code ?? (nav ? "no_result_line" : "refused") } });
    return null;
  }
  let shot: { bytes: Buffer; hash: string } | null = null;
  const snap = await act({ type: "screenshot", fullPage: false }, null);
  if (snap?.status === "ok" && snap.observation?.screenshot) {
    try {
      const bytes = await deps.runner.artifact(snap.observation.screenshot.artifactId);
      if (sha256(bytes) === snap.observation.screenshot.sha256) shot = { bytes, hash: sha256(bytes) };
    } catch { /* text result is still evidence */ }
  }
  const evidenceId = await ctx.q(async (q) => {
    const ev = (await q<{ id: string }>(
      `INSERT INTO evidence (tenant_id, run_id, kind, candidate_tool_id, access_mode, url, canonical_url, captured_at, content_hash, screenshot_key, extraction_method, excerpt, limitation)
       VALUES ($1,$2,'executed_test',NULL,'tested_owned_demo',$3,$3,now(),$4,$5,'dom',$6,$7) RETURNING id`,
      [ctx.tenantId, ctx.runId, shownUrl, nav.observation!.textSha256 ?? sha256(nav.observation!.textExcerpt ?? ""), shot ? "db" : null,
       `${result.line} (fix proposed by ${fix.model} on Vultr)`,
       "Tests Wallio's own harness running the sample bug through a Vultr model. It does not measure GitHub Copilot, Zed or any other product."],
    )).rows[0]!.id;
    if (shot) await q("INSERT INTO evidence_screenshots (evidence_id, tenant_id, sha256, mime, bytes) VALUES ($1,$2,$3,'image/png',$4)", [ev, ctx.tenantId, shot.hash, shot.bytes]);
    await q("UPDATE runs SET evidence_count = evidence_count + 1 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId]);
    return ev;
  });
  await ctx.emit({ type: "evidence_captured", message: `Owned test: ${result.passed}/${result.total} cases passed`, data: { evidenceId, kind: "executed_test", url: shownUrl, candidateToolId: null } });
  return { passed: result.passed, total: result.total, pass: result.pass, model: fix.model, evidenceId };
}

/** Drops fragments and common tracking parameters. */
export function canonical(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** Tears down the runner job and waits for its verified report (PRD §15). */
export class LiveCleaner implements Cleaner {
  private readonly runner: RunnerClient;
  private readonly pollMs: number;
  constructor(runner: RunnerClient, pollMs = 500) {
    this.runner = runner;
    this.pollMs = pollMs;
  }
  async cleanup(args: { runnerJobId: string | null }): Promise<CleanupReport> {
    if (!args.runnerJobId) return { result: "cleaned", containerRemoved: true, volumeRemoved: true, detail: "No browser was started for this comparison" };
    let rep: rc.CleanupReport;
    try {
      rep = await this.runner.finish(args.runnerJobId);
    } catch {
      await this.runner.cancel(args.runnerJobId, "shutdown").catch(() => {});
      rep = await this.runner.cleanup(args.runnerJobId);
    }
    const until = Date.now() + 20_000;
    while (rep.status === "pending" && Date.now() < until) {
      await new Promise((r) => setTimeout(r, this.pollMs));
      rep = await this.runner.cleanup(args.runnerJobId);
    }
    if (rep.status === "cleaned") {
      return { result: "cleaned", containerRemoved: rep.containerRemoved, volumeRemoved: rep.volumeRemoved, detail: "Browser container and its storage removed and verified" };
    }
    return { result: "failed", containerRemoved: rep.containerRemoved, volumeRemoved: rep.volumeRemoved, detail: rep.detail ? `Browser cleanup not verified: ${rep.detail}` : "Browser cleanup was not verified" };
  }
}
