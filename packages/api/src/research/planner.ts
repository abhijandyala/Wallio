/**
 * Research planner. The model proposes which allowed pages to read and which
 * questions to answer; code decides what is actually allowed.
 *
 * The planner runs BEFORE any browsing and never sees page content, so a prompt
 * injection on a vendor page cannot change which actions are taken.
 */
import { z } from "zod";
import type { InferenceGateway } from "../inference/index.ts";
import { hostAllowed, type PolicySpec } from "../runner/policy.ts";

export interface ToolForPlan {
  id: string;
  name: string;
  role: "incumbent" | "candidate";
  homepageUrl: string;
  pricingUrl: string | null;
}

export interface ProfileForPlan {
  primaryRole: string;
  topWorkflow: string;
  budgetMonthlyMinor: number;
  currency: string;
  dataSensitivity: "low" | "medium" | "high";
  requiredIntegrations: string[];
}

export const Topic = z.enum(["price", "plan_limits", "features", "integrations", "privacy", "other"]);

export const ResearchPlan = z.object({
  pages: z.array(z.object({ toolId: z.string(), url: z.string(), reason: z.string().min(3).max(200) })).min(1).max(6),
  questions: z.array(z.object({ toolId: z.string(), topic: Topic, question: z.string().min(5).max(200) })).min(1).max(12),
});
export type ResearchPlan = z.infer<typeof ResearchPlan>;

export interface PlannedPage { toolId: string; url: string; reason: string }
export interface PlanOutcome {
  pages: PlannedPage[];
  questions: ResearchPlan["questions"];
  plannedBy: "model" | "default";
  /** Model-proposed pages that policy refused, for the event log. */
  refused: Array<{ url: string; reason: string }>;
}

const MAX_PAGES_PER_TOOL = 2;

/** Questions every comparison answers, from the profile. The model may add more. */
export function baselineQuestions(tools: ToolForPlan[], p: ProfileForPlan): ResearchPlan["questions"] {
  const qs: ResearchPlan["questions"] = [];
  for (const t of tools) {
    qs.push({ toolId: t.id, topic: "price", question: `What does the individual paid plan of ${t.name} cost per month?` });
    qs.push({ toolId: t.id, topic: "plan_limits", question: `What usage limits or included credits does that plan state?` });
    if (p.dataSensitivity !== "low") qs.push({ toolId: t.id, topic: "privacy", question: `Does ${t.name} state whether user code or prompts are used for training or retained?` });
    for (const i of p.requiredIntegrations) qs.push({ toolId: t.id, topic: "integrations", question: `Does ${t.name} state support for ${i}?` });
  }
  return qs;
}

export function defaultPages(tools: ToolForPlan[]): PlannedPage[] {
  return tools.map((t) => ({ toolId: t.id, url: t.pricingUrl ?? t.homepageUrl, reason: "Official pricing page" }));
}

/** Policy for a run: each tool's official hosts, limited to the paths of its catalog URLs. */
export function policyFor(tools: ToolForPlan[], extraHosts: Record<string, string[]>, limits: { maxActions: number; maxScreenshots: number; deadlineAt: Date }): PolicySpec {
  const allowed: Record<string, string[]> = { ...extraHosts };
  for (const t of tools) {
    for (const raw of [t.pricingUrl, t.homepageUrl]) {
      if (!raw) continue;
      const u = new URL(raw);
      const prefix = u.pathname === "" ? "/" : u.pathname.replace(/\/$/, "") || "/";
      (allowed[u.hostname.toLowerCase()] ??= []).push(prefix);
    }
  }
  return { allowed, ...limits };
}

function toolOwnsHost(t: ToolForPlan, url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return [t.pricingUrl, t.homepageUrl].some((u) => u && new URL(u).hostname.toLowerCase() === host);
}

/** Keeps only pages that belong to a run tool and pass policy; guarantees each tool's pricing page. */
export function boundPlan(raw: ResearchPlan, tools: ToolForPlan[], policy: PolicySpec): Omit<PlanOutcome, "plannedBy"> {
  const refused: PlanOutcome["refused"] = [];
  const pages: PlannedPage[] = [];
  const seen = new Set<string>();
  for (const pg of raw.pages) {
    const tool = tools.find((t) => t.id === pg.toolId);
    if (!tool) { refused.push({ url: pg.url, reason: "not one of the tools being compared" }); continue; }
    const d = hostAllowed(policy, pg.url);
    if (!d.ok) { refused.push({ url: pg.url, reason: d.reason }); continue; }
    if (!toolOwnsHost(tool, pg.url)) { refused.push({ url: pg.url, reason: `not an official ${tool.name} page` }); continue; }
    if (pages.filter((p) => p.toolId === tool.id).length >= MAX_PAGES_PER_TOOL || seen.has(pg.url)) continue;
    seen.add(pg.url);
    pages.push({ toolId: tool.id, url: pg.url, reason: pg.reason });
  }
  for (const d of defaultPages(tools)) {
    if (!pages.some((p) => p.toolId === d.toolId)) pages.unshift(d);
  }
  const questions = raw.questions.filter((q) => tools.some((t) => t.id === q.toolId));
  return { pages, questions, refused };
}

export async function planResearch(
  gw: InferenceGateway,
  input: { correlationId: string; goal: string; tools: ToolForPlan[]; profile: ProfileForPlan; policy: PolicySpec },
): Promise<PlanOutcome> {
  const baseline = baselineQuestions(input.tools, input.profile);
  const allowedUrls = input.tools.flatMap((t) => [t.pricingUrl, t.homepageUrl].filter(Boolean).map((u) => `${t.id}: ${u}`));
  const out = await gw.chatJSON({
    purpose: "plan",
    correlationId: input.correlationId,
    schema: ResearchPlan,
    messages: [
      {
        role: "system",
        content:
          "You plan bounded research comparing AI coding tools using only their official web pages. " +
          "Reply with ONLY a JSON object: {\"pages\": [{\"toolId\", \"url\", \"reason\"}], \"questions\": [{\"toolId\", \"topic\", \"question\"}]}. " +
          'topic is one of "price", "plan_limits", "features", "integrations", "privacy", "other". ' +
          "Use only URLs from the allowed list or deeper pages under the same path. At most 2 pages per tool. " +
          "Questions must be answerable from the vendor's own pages; never ask about benchmark quality.",
      },
      {
        role: "user",
        content: JSON.stringify({
          goal: input.goal,
          user: { role: input.profile.primaryRole, workflow: input.profile.topWorkflow, dataSensitivity: input.profile.dataSensitivity, requiredIntegrations: input.profile.requiredIntegrations },
          tools: input.tools.map((t) => ({ toolId: t.id, name: t.name, role: t.role })),
          allowedUrls,
          questionsAlreadyPlanned: baseline.map((q) => q.question),
        }),
      },
    ],
  });
  const bounded = boundPlan(out.data, input.tools, input.policy);
  const questions = [...baseline];
  for (const q of bounded.questions) if (questions.length < 16 && !questions.some((b) => b.toolId === q.toolId && b.question === q.question)) questions.push(q);
  return { pages: bounded.pages, questions, refused: bounded.refused, plannedBy: "model" };
}
