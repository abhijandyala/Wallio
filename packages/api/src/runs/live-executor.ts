/**
 * Live research run (P5): plan → policy-checked browser steps through the
 * runner → stored evidence (text hash + screenshot) → grounded findings →
 * per-tool knowledge (known / missing / needs testing).
 *
 * Runner jobs: one per purpose, one at a time (the runner runs a single job).
 * Each tool's research gets its own job whose allowlist is only that tool's hosts
 * (plus measured asset hosts), and the owned test gets its own job on the eval
 * host. Each job is finished and verified cleaned before the next one starts.
 *
 * This executor never fills forms or clicks anything with an external effect.
 */
import type { runner as rc } from "@wallio/contracts";
import type { InferenceGateway, UsageRecord } from "../inference/index.ts";
import { InferenceError } from "../inference/index.ts";
import type { RunnerClient } from "../runner/client.ts";
import { jobHosts, observationInPolicy, type PolicySpec } from "../runner/policy.ts";
import { extractFindings, type Finding } from "../research/extract.ts";
import { baselineQuestions, defaultPages, planResearch, policyFor, type PlanOutcome, type ProfileForPlan, type ToolForPlan } from "../research/planner.ts";
import { writeRecommendation } from "./recommend-step.ts";
import { newEvalToken, parseResult, proposeFix } from "../eval/harness.ts";
import { RunFailure, type Cleaner, type CleanupReport, type ExecResult, type RunContext, type RunExecutor } from "./worker.ts";
import { BrowserSession, sha256, verifiedCleanup } from "./browser-session.ts";
import { runTrialRequest } from "./trial-request.ts";
import { runContainment, type Sentinel } from "./containment.ts";
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
  /** https origin of Wallio's own synthetic trial form. Trial requests need it and approvalKey. */
  formsBaseUrl?: string | null;
  /** Signs approval tokens the runner verifies. */
  approvalKey?: string | null;
  approvalTtlSecs?: number;
  /** https origin of Wallio's own hostile containment page. */
  hostileBaseUrl?: string | null;
  sentinel?: Sentinel | null;
}

export class LiveExecutor implements RunExecutor {
  private readonly deps: LiveExecutorDeps;
  constructor(deps: LiveExecutorDeps) {
    this.deps = deps;
  }

  async execute(ctx: RunContext): Promise<ExecResult> {
    const { kind, request } = await ctx.q(async (q) =>
      (await q<{ kind: string; request: any }>("SELECT c.kind, c.request FROM runs r JOIN comparisons c ON c.id = r.comparison_id WHERE r.id = $1 AND r.tenant_id = $2", [ctx.runId, ctx.tenantId])).rows[0]!);
    const d = this.deps;
    const owned = (base: string, paths: string[], extra: Partial<PolicySpec> = {}): PolicySpec =>
      ({ allowed: { [new URL(base).hostname.toLowerCase()]: paths }, maxActions: 20, maxScreenshots: 6, deadlineAt: ctx.deadlineAt, ...extra });
    if (kind === "trial_request") {
      if (!d.formsBaseUrl || !d.approvalKey) throw new RunFailure("runner_unavailable", "Trial requests aren't set up on this server yet (form host or approval key missing).");
      const session = new BrowserSession(d.runner, ctx, owned(d.formsBaseUrl, ["/trial/"], { fillHosts: [new URL(d.formsBaseUrl).hostname.toLowerCase()] }));
      return runTrialRequest(ctx, session, { formsBaseUrl: d.formsBaseUrl, approvalKey: d.approvalKey, approvalTtlSecs: d.approvalTtlSecs ?? 120 }, request);
    }
    if (kind === "containment") {
      if (!d.hostileBaseUrl) throw new RunFailure("runner_unavailable", "The containment test isn't set up on this server yet (hostile page host missing).");
      const session = new BrowserSession(d.runner, ctx, owned(d.hostileBaseUrl, ["/"], { maxActions: 8, maxScreenshots: 2 }));
      return runContainment(ctx, session, { hostileBaseUrl: d.hostileBaseUrl, sentinel: d.sentinel ?? null });
    }
    return this.research(ctx);
  }

  private async research(ctx: RunContext): Promise<ExecResult> {
    const { runner } = this.deps;
    const pending: UsageRecord[] = [];
    // Degraded path: once the AI service is down in this run, later calls are skipped at once
    // (each would otherwise retry and time out), and the run falls back to captures and rules.
    const health = { down: false };
    const gw = withBreaker(this.deps.gateway((u) => pending.push(u)), health);
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
      plan = await infer(() => planResearch(gw, { correlationId: ctx.correlationId, goal, tools, profile, policy }));
    } catch (e) {
      if (!(e instanceof InferenceError)) throw e;
      plan = { pages: defaultPages(tools), questions: baselineQuestions(tools, profile), plannedBy: "default", refused: [] };
      await ctx.emit({ type: "warning", message: "The AI plan was unusable, so the official pricing pages are used", data: { detail: e.code } });
    }
    for (const r of plan.refused) {
      await ctx.emit({ type: "policy_denied", message: "Skipped a proposed page outside the allowed sites", data: { attemptedAction: "navigate", target: r.url.slice(0, 200), reason: r.reason } });
    }

    const session = new BrowserSession(runner, ctx, policy);
    await ctx.stage("researching", "Researching official pages in an isolated browser");
    const knowledge: RunKnowledge = {
      plannedBy: plan.plannedBy,
      questions: plan.questions,
      tools: Object.fromEntries(tools.map((t) => [t.id, { known: [], missing: [], needsTesting: ["Quality on your own debugging task"], blocked: [] }])),
    };

    for (const tool of tools) {
      const pages = plan.pages.filter((p) => p.toolId === tool.id);
      if (!pages.length) continue;
      await session.open(`research_${tool.id}`, `Research ${tool.name}'s official pages`, jobHosts(policyFor([tool], {}, { maxActions: policy.maxActions, maxScreenshots: policy.maxScreenshots, deadlineAt: policy.deadlineAt }).allowed));
      for (const page of pages) {
      const tk = knowledge.tools[tool.id]!;
      const nav = await session.act({ type: "navigate", url: page.url }, { toolId: tool.id });
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
      const shot = await session.screenshot(tool.id);

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
        const r = await infer(() => extractFindings(gw, { correlationId: ctx.correlationId, toolName: tool.name, url: obs.url, pageText: text, questions }));
        for (const f of r.grounded) if (!tk.known.some((k) => k.question === f.question)) tk.known.push({ ...f, evidenceId });
        const excerpt = r.grounded.map((f) => `"${f.quote}"`).join(" … ").slice(0, 2000);
        await ctx.q((q) => q("UPDATE evidence SET excerpt = $3 WHERE id = $1 AND tenant_id = $2", [evidenceId, ctx.tenantId, excerpt]));
        if (r.ungrounded) await ctx.emit({ type: "warning", message: `Discarded ${r.ungrounded} AI finding(s) that weren't quoted from the page`, data: { detail: "ungrounded" } });
      } catch (e) {
        if (!(e instanceof InferenceError)) throw e;
        await ctx.emit({ type: "warning", message: `Couldn't read ${tool.name}'s page with the AI service; the capture is kept`, data: { detail: e.code } });
      }
      }
      await session.close();
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
    if (this.deps.evalBaseUrl) {
      const evalHost = new URL(this.deps.evalBaseUrl).hostname;
      knowledge.harness = await runHarnessStage({ evalBaseUrl: this.deps.evalBaseUrl, openJob: () => session.open("eval", "Run Wallio's owned test page", [evalHost]) }, ctx, gw, infer, session);
      await session.close();
    }
    if (knowledge.harness !== undefined) await ctx.q((q) => q("UPDATE runs SET knowledge = $3 WHERE id = $1 AND tenant_id = $2", [ctx.runId, ctx.tenantId, knowledge]));

    // ── score and recommend (P6) ──
    await ctx.transition("VERIFYING", { stage: "verifying" });
    await ctx.stage("reporting", "Scoring the tools and writing the recommendation");
    const recommendationId = await writeRecommendation(ctx, gw, infer);
    const outcome = everyToolHasEvidence && !health.down ? "succeeded" : "partial";
    if (health.down) {
      await ctx.emit({ type: "warning", message: "The AI service was unavailable, so this result uses the captures and fixed rules only", data: { detail: "inference_unavailable" } });
    }
    await ctx.emit({ type: "result_ready", message: health.down ? "Recommendation ready (partial: AI service unavailable)" : "Recommendation ready", data: { recommendationId, outcome } });
    return { outcome };
  }
}

export interface HarnessDeps {
  evalBaseUrl: string;
  /** Opens the eval job (eval host only), after the fix is generated so the job's clock isn't spent waiting on inference. */
  openJob: () => Promise<void>;
}

/** Generates a fix on Vultr, opens the owned test page in the runner, records the result as evidence. */
export async function runHarnessStage(deps: HarnessDeps, ctx: RunContext, gw: InferenceGateway, infer: <T>(fn: () => Promise<T>) => Promise<T>, session: BrowserSession): Promise<HarnessResult | null> {
  await ctx.stage("testing", "Running the sample bug through a Vultr model in the owned test page");
  const task = await ctx.q(async (q) => {
    const r = (await q(`SELECT t.* FROM runs r JOIN comparisons c ON c.id = r.comparison_id JOIN eval_tasks t ON t.id = c.request->>'taskId' WHERE r.id = $1 AND r.tenant_id = $2`, [ctx.runId, ctx.tenantId])).rows[0];
    return r ? { id: r.id, title: r.title, description: r.description, sanitizedInput: r.sanitized_input, entrypoint: r.entrypoint, tests: r.tests } : null;
  });
  if (!task || !task.entrypoint || !task.tests.length) return null;
  let fix: { code: string; model: string };
  try {
    fix = await infer(() => proposeFix(gw, ctx.correlationId, task));
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
  await deps.openJob();

  const nav = await session.act({ type: "navigate", url: `${base}/eval/${token}` }, { displayUrl: shownUrl });
  const result = parseResult(nav?.observation?.textExcerpt ?? null);
  if (!nav || nav.status !== "ok" || !result) {
    await ctx.emit({ type: "warning", message: "The owned test page didn't report a result", data: { detail: nav?.error?.code ?? (nav ? "no_result_line" : "refused") } });
    return null;
  }
  const shot = await session.screenshot();
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

/** Verifies every runner job the run created was torn down (PRD §15). */
export class LiveCleaner implements Cleaner {
  private readonly runner: RunnerClient;
  private readonly pollMs: number;
  constructor(runner: RunnerClient, pollMs = 500) {
    this.runner = runner;
    this.pollMs = pollMs;
  }
  async cleanup(args: { runnerJobIds: string[] }): Promise<CleanupReport> {
    const ids = [...new Set(args.runnerJobIds)];
    let started = 0, containerRemoved = true, volumeRemoved = true;
    const problems: string[] = [];
    for (const id of ids) {
      let rep: rc.CleanupReport | null;
      try {
        rep = await verifiedCleanup(this.runner, id, this.pollMs);
      } catch (e) {
        containerRemoved = volumeRemoved = false;
        problems.push((e as Error).message.slice(0, 120));
        continue;
      }
      if (!rep) continue;
      started++;
      containerRemoved &&= rep.containerRemoved;
      volumeRemoved &&= rep.volumeRemoved;
      if (rep.status !== "cleaned") problems.push(rep.detail ?? (rep.status === "pending" ? "still pending" : "not verified"));
    }
    if (!started && !problems.length) return { result: "cleaned", containerRemoved: true, volumeRemoved: true, detail: "No browser was started for this comparison" };
    if (!problems.length) {
      return { result: "cleaned", containerRemoved, volumeRemoved, detail: `${started === 1 ? "Browser container" : `All ${started} browser containers`} and storage removed and verified` };
    }
    return { result: "failed", containerRemoved, volumeRemoved, detail: `Browser cleanup not verified: ${problems.join("; ")}`.slice(0, 300) };
  }
}

/**
 * Per-run circuit breaker around the inference gateway. After one "unavailable" error,
 * every later chat/chatJSON call in the same run fails immediately with the same code,
 * so fallbacks (default plan, template explanation) kick in without waiting on retries.
 */
export function withBreaker(gw: InferenceGateway, health: { down: boolean }): InferenceGateway {
  return new Proxy(gw, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if ((prop !== "chat" && prop !== "chatJSON") || typeof v !== "function") return v;
      return async (...args: unknown[]) => {
        if (health.down) throw new InferenceError("inference_unavailable", "Skipped: the AI service was unavailable earlier in this run.");
        try {
          return await v.apply(target, args);
        } catch (e) {
          if (e instanceof InferenceError && e.code === "inference_unavailable") health.down = true;
          throw e;
        }
      };
    },
  });
}
