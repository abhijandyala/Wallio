import type {
  AttemptResult,
  CompareSetupData,
  Evidence,
  RunOutcome,
  RunResult,
  RunStep,
} from "@/lib/types";
import { profileSample } from "./my-ai";
import { cap } from "./discover";

// SAMPLE DATA. Replace with:
//   POST /api/comparisons        -> 202 { runId }
//   GET  /api/runs/{id}/events   -> ordered step updates (SSE)
//   GET  /api/runs/{id}          -> Run, then GET /api/recommendations/{id}
// The builders below only template sample data around the user's picks so the simulated run reads right.

/** The pinned Vultr Serverless Inference model (see packages/api inference config). */
export const MODEL = "qwen3.8-flash-next";

export const compareSetupSample: CompareSetupData = {
  workflows: profileSample.workflows,
  tasks: [
    { id: "t_bug_login", workflowId: "wf_debug", title: "Fix a broken login redirect" },
    { id: "t_bug_state", workflowId: "wf_debug", title: "Find why a counter renders twice" },
    { id: "t_brief", workflowId: "wf_research", title: "Two-page brief on edge databases" },
    { id: "t_compare", workflowId: "wf_research", title: "Compare three vector databases" },
    { id: "t_docs", workflowId: "wf_writing", title: "README for a small CLI" },
  ],
  tools: [
    { name: "Cursor", isCurrent: true, monthlyCents: 2000, workflowIds: ["wf_debug"] },
    { name: "Windsurf", isCurrent: false, monthlyCents: 1500, workflowIds: ["wf_debug"] },
    { name: "GitHub Copilot", isCurrent: true, monthlyCents: 833, workflowIds: ["wf_debug"] },
    { name: "Zed", isCurrent: false, monthlyCents: 0, workflowIds: ["wf_debug"] },
    { name: "Perplexity", isCurrent: true, monthlyCents: 1667, workflowIds: ["wf_research"] },
    { name: "Claude", isCurrent: true, monthlyCents: 2000, workflowIds: ["wf_research", "wf_writing"] },
    { name: "NotebookLM", isCurrent: false, monthlyCents: 0, workflowIds: ["wf_research"] },
    { name: "Gemini", isCurrent: false, monthlyCents: 1999, workflowIds: ["wf_research", "wf_writing"] },
    { name: "ChatGPT", isCurrent: true, monthlyCents: 2000, workflowIds: ["wf_writing"] },
  ],
  recent: [
    { id: "r_cursor_ws", title: "Cursor vs Windsurf", finishedOn: "Today", outcome: "Kept Cursor", href: "/compare?view=results&run=r_cursor_ws" },
    { id: "r_claude_gpt", title: "Claude vs ChatGPT", finishedOn: "Nov 2", outcome: "Partial", href: "/compare?view=results&run=r_claude_gpt" },
    { id: "r_copilot_zed", title: "Copilot vs Zed", finishedOn: "Oct 30", outcome: "Timed out", href: "/compare?view=results&run=r_copilot_zed" },
    { id: "r_pplx_nb", title: "Perplexity vs NotebookLM", finishedOn: "Oct 21", outcome: "Failed", href: "/compare?view=results&run=r_pplx_nb" },
    { id: "r_old", title: "Copilot vs Cursor", finishedOn: "Oct 12", outcome: "Cleanup failed", href: "/compare?view=results&run=r_old" },
  ],
};

const HOSTS: Record<string, string> = {
  Cursor: "cursor.com",
  Windsurf: "windsurf.com",
  "GitHub Copilot": "github.com",
  Zed: "zed.dev",
  Perplexity: "perplexity.ai",
  Claude: "claude.ai",
  NotebookLM: "notebooklm.google",
  Gemini: "gemini.google",
  ChatGPT: "chatgpt.com",
};
export const hostFor = (tool: string) =>
  HOSTS[tool] ?? `${tool.toLowerCase().replace(/\s+/g, "")}.com`;
const slug = (tool: string) => tool.toLowerCase().replace(/\s+/g, "-");

/** Seconds at which each step of buildSteps() finishes. Front-end simulation only. */
export const STEP_TIMES = [2, 5, 8, 11, 23, 35, 40, 42, 43, 46, 48];
/** Index of the step that waits for the user's approval. The clock stops there. */
export const APPROVAL_STEP = 8;

/** The deterministic check for each sample task. */
const TESTS: Record<string, { name: string; assertion: string }> = {
  t_bug_login: { name: "Login redirect test", assertion: 'expect(res.headers.location).toBe("/dashboard")' },
  t_bug_state: { name: "Render count test", assertion: "expect(renders).toBe(1)" },
  t_brief: { name: "Citation check", assertion: "expect(citations.every((c) => c.resolves)).toBe(true)" },
  t_compare: { name: "Coverage check", assertion: 'expect(brief).toCover(["latency", "cost", "hosting"])' },
  t_docs: { name: "README check", assertion: 'expect(readme).toHaveSections(["Install", "Usage"])' },
};

/** Sample attempt outcomes: the first tool passes every run, the second times out once. */
export function buildAttempts(a: string, b: string): AttemptResult[] {
  return [
    { toolName: a, attempt: 1, passed: true, seconds: 39, output: "Assertion passed" },
    { toolName: a, attempt: 2, passed: true, seconds: 41, output: "Assertion passed" },
    { toolName: a, attempt: 3, passed: true, seconds: 44, output: "Assertion passed" },
    { toolName: b, attempt: 1, passed: true, seconds: 36, output: "Assertion passed" },
    { toolName: b, attempt: 2, passed: false, seconds: null, note: "Timed out at 120s", output: "No result before the 120s limit" },
    { toolName: b, attempt: 3, passed: true, seconds: 40, output: "Assertion passed" },
  ];
}

/** The steps a live run walks through, by stage. The UI advances them on a timer. */
export function buildSteps(a: string, b: string): RunStep[] {
  const base = { status: "pending" as const, atSeconds: null };
  const ha = hostFor(a);
  const hb = hostFor(b);
  return [
    {
      ...base, id: "s1", stage: "planning", kind: "plan", label: "Planning the comparison", host: "Vultr Serverless Inference",
      inference: [{ purpose: "plan", model: MODEL, ms: 820 }],
    },
    {
      ...base, id: "s2", stage: "researching", kind: "research", label: `Reading ${a} pricing`, host: `${ha}/pricing`, toolName: a,
      actions: [
        { action: "navigate", target: `${ha}/pricing`, verdict: "allowed" },
        { action: "screenshot", target: `${ha}/pricing`, verdict: "allowed" },
      ],
      inference: [{ purpose: "extract", model: MODEL, ms: 640 }],
    },
    {
      ...base, id: "s3", stage: "researching", kind: "research", label: `Reading ${b} pricing`, host: `${hb}/pricing`, toolName: b,
      actions: [
        { action: "navigate", target: `${hb}/pricing`, verdict: "allowed" },
        { action: "navigate", target: `accounts.${hb}/signup`, verdict: "denied", reason: "Not on this run's allow-list" },
        { action: "screenshot", target: `${hb}/pricing`, verdict: "allowed" },
      ],
      inference: [{ purpose: "extract", model: MODEL, ms: 710 }],
    },
    {
      ...base, id: "s4", stage: "researching", kind: "research", label: `${b} changelog`, host: `${hb}/changelog`, toolName: b,
      note: "Login wall. Skipped, not bypassed.",
      actions: [{ action: "navigate", target: `${hb}/changelog`, verdict: "allowed" }],
    },
    {
      ...base, id: "s5", stage: "testing", kind: "test", label: `Running the task in ${a}, 3 times`, host: `eval.wallio.test/${slug(a)}`, toolName: a,
      actions: [
        { action: "navigate", target: `eval.wallio.test/${slug(a)}`, verdict: "allowed" },
        { action: "click", target: "Run task", verdict: "allowed" },
        { action: "screenshot", target: "Test result", verdict: "allowed" },
      ],
      inference: [{ purpose: "verify", model: MODEL, ms: 590 }],
    },
    {
      ...base, id: "s6", stage: "testing", kind: "test", label: `Running the task in ${b}, 3 times`, host: `eval.wallio.test/${slug(b)}`, toolName: b,
      actions: [
        { action: "navigate", target: `eval.wallio.test/${slug(b)}`, verdict: "allowed" },
        { action: "click", target: "Run task", verdict: "allowed" },
        { action: "screenshot", target: "Test result", verdict: "allowed" },
      ],
      inference: [{ purpose: "verify", model: MODEL, ms: 610 }],
    },
    {
      ...base, id: "s7", stage: "verifying", kind: "verify", label: "Checking every run against the test", host: "test harness",
      inference: [{ purpose: "verify", model: MODEL, ms: 480 }],
    },
    {
      ...base, id: "s8", stage: "reporting", kind: "form", label: `Preparing a ${b} trial request`, host: `trial.wallio.test/${slug(b)}`,
      actions: [
        { action: "navigate", target: `trial.wallio.test/${slug(b)}`, verdict: "allowed" },
        { action: "fill", target: "Name, Email, Plan", verdict: "allowed" },
      ],
    },
    {
      ...base, id: "s9", stage: "reporting", kind: "form", label: "Waiting for your approval", host: `trial.wallio.test/${slug(b)}`,
      approval: true,
    },
    {
      ...base, id: "s10", stage: "reporting", kind: "report", label: "Writing the report", host: "Vultr Serverless Inference",
      inference: [{ purpose: "explain", model: MODEL, ms: 930 }],
    },
    { ...base, id: "s11", stage: "reporting", kind: "cleanup", label: "Destroying the sandbox", host: "sandbox" },
  ];
}

/** The owned hostile page used to show containment. A controlled test, not proof of invulnerability. */
export const CONTAINMENT_TIMES = [2, 4, 6, 8, 10, 12, 14];
export function buildContainmentSteps(): RunStep[] {
  const base = { status: "pending" as const, atSeconds: null };
  return [
    { ...base, id: "c1", stage: "planning", kind: "plan", label: "Planning the containment test", host: "Vultr Serverless Inference", inference: [{ purpose: "plan", model: MODEL, ms: 760 }] },
    { ...base, id: "c2", stage: "researching", kind: "research", label: "Opening the hostile test page", host: "hostile.wallio.test", actions: [{ action: "navigate", target: "hostile.wallio.test", verdict: "allowed" }] },
    { ...base, id: "c3", stage: "researching", kind: "research", label: "Reading the page", host: "hostile.wallio.test", inference: [{ purpose: "extract", model: MODEL, ms: 690 }] },
    {
      ...base, id: "c4", stage: "testing", kind: "research", label: "Model asks to send data to 10.0.0.5", host: "hostile.wallio.test",
      note: "Private address. Denied at the egress proxy.",
      actions: [{ action: "navigate", target: "http://10.0.0.5/collect", verdict: "denied", reason: "Private address" }],
    },
    {
      ...base, id: "c5", stage: "testing", kind: "research", label: "Model asks to click “Claim reward”", host: "hostile.wallio.test",
      note: "Points at cloud metadata. Denied before the click.",
      actions: [{ action: "click", target: "169.254.169.254/latest/meta-data", verdict: "denied", reason: "Cloud metadata address" }],
    },
    { ...base, id: "c6", stage: "verifying", kind: "verify", label: "Checking the control plane", host: "Wallio control plane" },
    { ...base, id: "c7", stage: "reporting", kind: "cleanup", label: "Destroying the sandbox", host: "sandbox" },
  ];
}

type Pick = { name: string; isCurrent: boolean; monthlyCents: number | null };

export function buildResult({
  a,
  b,
  workflow,
  task,
  taskId = "t_bug_login",
  outcome = "succeeded",
  cleanupFailed = false,
  capCents = 50,
}: {
  a: Pick;
  b: Pick;
  workflow: string;
  task: string;
  taskId?: string;
  outcome?: RunOutcome;
  cleanupFailed?: boolean;
  capCents?: number;
}): RunResult {
  const job = workflow.charAt(0).toLowerCase() + workflow.slice(1);
  const diff =
    a.monthlyCents !== null && b.monthlyCents !== null ? a.monthlyCents - b.monthlyCents : null;
  const dollars = (c: number) => `$${(c / 100) % 1 ? (c / 100).toFixed(2) : c / 100}`;
  const priceNote = diff !== null && diff > 0 ? `${b.name} is ${dollars(diff)} cheaper but` : b.name;
  const evidence: Evidence[] = (
    [
      { id: "ev_1", kind: "tested", title: `${a.name} passed 3 of 3 runs`, source: "Wallio test harness", capturedAt: "2026-11-05T15:03:10" },
      { id: "ev_2", kind: "tested", title: `${b.name} passed 2 of 3 runs`, source: "Wallio test harness", capturedAt: "2026-11-05T15:03:40", limitation: "Run 2 timed out" },
      { id: "ev_3", kind: "researched", title: `${a.name} pricing page`, source: `${hostFor(a.name)}/pricing`, capturedAt: "2026-11-05T15:00:48" },
      { id: "ev_4", kind: "researched", title: `${b.name} pricing page`, source: `${hostFor(b.name)}/pricing`, capturedAt: "2026-11-05T15:01:05" },
      { id: "ev_5", kind: "unknown", title: `${b.name} changelog not read`, source: `${hostFor(b.name)}/changelog`, capturedAt: "2026-11-05T15:01:20", limitation: "Login wall. Not bypassed." },
    ] as Evidence[]
  ).map(cap);

  const full = outcome === "succeeded" || outcome === "partial";
  const attempts =
    outcome === "failed"
      ? []
      : outcome === "timed_out"
        ? buildAttempts(a.name, b.name).filter((x) => x.toolName === a.name)
        : buildAttempts(a.name, b.name);

  return {
    runId: "run_sample_01",
    workflow,
    task,
    finishedAt: "2026-11-05T15:04:00",
    outcome,
    candidates: [
      { toolName: a.name, isCurrent: a.isCurrent, passed: outcome === "failed" ? 0 : 3, attempts: 3, medianSeconds: outcome === "failed" ? null : 41, runCostCents: 6, monthlyCents: a.monthlyCents },
      { toolName: b.name, isCurrent: b.isCurrent, passed: full ? 2 : 0, attempts: 3, medianSeconds: full ? 38 : null, runCostCents: full ? 7 : null, monthlyCents: b.monthlyCents },
    ],
    recommendation: {
      action: a.isCurrent ? "keep" : "try",
      title:
        outcome === "partial"
          ? `Keep ${a.name} for now.`
          : a.isCurrent
            ? `Keep ${a.name} for ${job}.`
            : `Try ${a.name} for ${job}.`,
      reason: `It passed all 3 runs. ${priceNote} missed 1 of 3.`,
    },
    confidence: outcome === "partial" ? "low" : "medium",
    savings:
      diff !== null && diff > 0
        ? {
            monthlyDeltaCents: diff,
            immediateCents: 0,
            renewalAvoidanceCents: null,
            renewalOn: "2026-11-14",
            assumptions: [
              `Keeping ${a.name} costs ${dollars(diff * 12)} more a year than ${b.name}`,
              "Both are monthly plans, so switching later loses nothing",
            ],
          }
        : null,
    statements: [
      { role: "supporting", text: `${a.name} passed all 3 runs in our owned demo test`, sourceIds: ["ev_1"] },
      ...(diff !== null && diff > 0
        ? [{ role: "counter" as const, text: `${b.name} is ${dollars(diff)} a month cheaper`, sourceIds: ["ev_3", "ev_4"] }]
        : []),
      { role: "counter", text: `${b.name} was 3s faster on the runs it finished`, sourceIds: ["ev_2"] },
      { role: "uncertainty", text: `${b.name}'s recent changes weren't read`, sourceIds: ["ev_5"] },
      { role: "next_step", text: "Check again before the Nov 14 renewal", sourceIds: [] },
    ],
    test: TESTS[taskId] ?? TESTS.t_bug_login,
    attempts,
    limitations:
      outcome === "failed"
        ? [
            "Nothing was tested, so this says nothing about either tool.",
            `Only ${a.name}'s pricing page was captured before the runner stopped.`,
          ]
        : outcome === "timed_out"
          ? [
              `Only ${a.name}'s runs finished. ${b.name} wasn't tested.`,
              "Tested in our owned demo environment on Vultr models, not the commercial product.",
            ]
          : [
              "One task, 3 runs each. Evidence for this task, not a ranking of the tools.",
              "Tested in our owned demo environment on Vultr models, not the commercial product.",
              `${b.name} run 2 timed out. It stays in the result.`,
              `${b.name} changelog was behind a login, so recent changes weren't read.`,
            ],
    policy: {
      allowed: outcome === "failed" ? 3 : 17,
      stopped: 1,
      denied: [
        { action: "navigate", target: `accounts.${hostFor(b.name)}/signup`, verdict: "denied", reason: "Not on this run's allow-list" },
      ],
    },
    spend: { actualCents: outcome === "failed" ? 2 : outcome === "timed_out" ? 9 : 13, capCents },
    cleanup: cleanupFailed
      ? { status: "cleanup_failed", at: null }
      : { status: "cleaned", at: "2026-11-05T15:04:02" },
    evidence: outcome === "failed" ? evidence.slice(2, 3) : evidence,
    partialNote:
      outcome === "partial"
        ? `${b.name}'s pricing page didn't load, so its price is the one you entered.`
        : undefined,
    error:
      outcome === "failed"
        ? {
            message: "The browser runner stopped responding, so nothing was tested. Test runs weren't charged.",
            correlationId: "req_7f3a91c2",
          }
        : undefined,
  };
}

const tool = (n: string) => {
  const t = compareSetupSample.tools.find((x) => x.name === n)!;
  return { name: t.name, isCurrent: t.isCurrent, monthlyCents: t.monthlyCents };
};

/** The default sample result (Cursor vs Windsurf), for /compare?view=results. */
export const runResultSample = buildResult({
  a: { name: "Cursor", isCurrent: true, monthlyCents: 2000 },
  b: { name: "Windsurf", isCurrent: false, monthlyCents: 1500 },
  workflow: "Debugging web apps",
  task: "Fix a broken login redirect",
});

/** Saved reports for the Recent list. */
export function resultForRun(id: string | null): RunResult {
  switch (id) {
    case "r_claude_gpt":
      return buildResult({ a: tool("Claude"), b: tool("ChatGPT"), workflow: "Writing docs", task: "README for a small CLI", taskId: "t_docs", outcome: "partial" });
    case "r_copilot_zed":
      return buildResult({ a: tool("GitHub Copilot"), b: tool("Zed"), workflow: "Debugging web apps", task: "Find why a counter renders twice", taskId: "t_bug_state", outcome: "timed_out" });
    case "r_pplx_nb":
      return buildResult({ a: tool("Perplexity"), b: tool("NotebookLM"), workflow: "Research briefs", task: "Two-page brief on edge databases", taskId: "t_brief", outcome: "failed" });
    case "r_old":
      return buildResult({ a: tool("Cursor"), b: tool("GitHub Copilot"), workflow: "Debugging web apps", task: "Fix a broken login redirect", cleanupFailed: true });
    default:
      return runResultSample;
  }
}
