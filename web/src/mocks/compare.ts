import type {
  AttemptResult,
  CompareSetupData,
  RunResult,
  RunStep,
} from "@/lib/types";
import { profileSample } from "./my-ai";

// SAMPLE DATA. Replace with:
//   POST /api/comparisons        -> 202 { runId }
//   GET  /api/runs/{id}/events   -> ordered step updates (SSE)
//   GET  /api/runs/{id}          -> final RunResult
// The builders below only template sample data around the user's picks so the simulated run reads right.

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
    { id: "r_cursor_ws", title: "Cursor vs Windsurf", finishedOn: "Today", outcome: "Kept Cursor" },
    { id: "r_claude_gpt", title: "Claude vs ChatGPT", finishedOn: "Nov 2", outcome: "Kept Claude" },
    { id: "r_old", title: "Copilot vs Cursor", finishedOn: "Oct 12", outcome: "Kept Cursor" },
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

/** Seconds at which each step of buildSteps() finishes. Front-end simulation only. */
export const STEP_TIMES = [2, 5, 8, 11, 23, 35, 40, 43, 45];

/** Sample attempt outcomes: the first tool passes every run, the second times out once. */
export function buildAttempts(a: string, b: string): AttemptResult[] {
  return [
    { toolName: a, attempt: 1, passed: true, seconds: 39 },
    { toolName: a, attempt: 2, passed: true, seconds: 41 },
    { toolName: a, attempt: 3, passed: true, seconds: 44 },
    { toolName: b, attempt: 1, passed: true, seconds: 36 },
    { toolName: b, attempt: 2, passed: false, seconds: null, note: "Timed out at 120s" },
    { toolName: b, attempt: 3, passed: true, seconds: 40 },
  ];
}

/** The steps a live run walks through. The UI advances them on a timer. */
export function buildSteps(a: string, b: string): RunStep[] {
  const base = { status: "pending" as const, atSeconds: null };
  return [
    { ...base, id: "s1", kind: "plan", label: "Planning the comparison", host: "Vultr Serverless Inference" },
    { ...base, id: "s2", kind: "research", label: `Reading ${a} pricing`, host: `${hostFor(a)}/pricing`, toolName: a },
    { ...base, id: "s3", kind: "research", label: `Reading ${b} pricing`, host: `${hostFor(b)}/pricing`, toolName: b },
    {
      ...base,
      id: "s4",
      kind: "research",
      label: `${b} changelog`,
      host: `${hostFor(b)}/changelog`,
      toolName: b,
      note: "Login wall. Skipped, not bypassed.",
    },
    { ...base, id: "s5", kind: "test", label: `Running the task in ${a}, 3 times`, host: "sample task", toolName: a },
    { ...base, id: "s6", kind: "test", label: `Running the task in ${b}, 3 times`, host: "sample task", toolName: b },
    { ...base, id: "s7", kind: "verify", label: "Checking results against the test", host: "test harness" },
    { ...base, id: "s8", kind: "report", label: "Writing the report", host: "Vultr Serverless Inference" },
    { ...base, id: "s9", kind: "cleanup", label: "Destroying the sandbox", host: "sandbox" },
  ];
}

export function buildResult({
  a,
  b,
  workflow,
  task,
}: {
  a: { name: string; isCurrent: boolean; monthlyCents: number | null };
  b: { name: string; isCurrent: boolean; monthlyCents: number | null };
  workflow: string;
  task: string;
}): RunResult {
  const job = workflow.charAt(0).toLowerCase() + workflow.slice(1);
  const diff =
    a.monthlyCents !== null && b.monthlyCents !== null
      ? (a.monthlyCents - b.monthlyCents) / 100
      : null;
  const priceNote =
    diff !== null && diff > 0
      ? `${b.name} is $${diff % 1 ? diff.toFixed(2) : diff} cheaper but`
      : `${b.name}`;
  return {
    runId: "run_sample_01",
    workflow,
    task,
    finishedAt: "2026-11-05T15:04:00",
    candidates: [
      { toolName: a.name, isCurrent: a.isCurrent, passed: 3, attempts: 3, medianSeconds: 41, runCostCents: 6, monthlyCents: a.monthlyCents },
      { toolName: b.name, isCurrent: b.isCurrent, passed: 2, attempts: 3, medianSeconds: 38, runCostCents: 7, monthlyCents: b.monthlyCents },
    ],
    recommendation: {
      action: a.isCurrent ? "keep" : "try",
      title: a.isCurrent ? `Keep ${a.name} for ${job}.` : `Try ${a.name} for ${job}.`,
      reason: `It passed all 3 runs. ${priceNote} missed 1 of 3.`,
    },
    attempts: buildAttempts(a.name, b.name),
    limitations: [
      "One task, 3 runs each. Evidence for this task, not a ranking of the tools.",
      `${b.name} run 2 timed out. It stays in the result.`,
      `${b.name} changelog was behind a login, so recent changes weren't read.`,
    ],
    policy: { allowed: 17, stopped: 1 },
    cleanup: { status: "cleaned", at: "2026-11-05T15:04:02" },
    evidence: [
      { id: "ev_1", kind: "tested", title: `${a.name} passed 3 of 3 runs`, source: "Wallio test harness", capturedAt: "2026-11-05T15:03:10" },
      { id: "ev_2", kind: "tested", title: `${b.name} passed 2 of 3 runs`, source: "Wallio test harness", capturedAt: "2026-11-05T15:03:40", limitation: "Run 2 timed out" },
      { id: "ev_3", kind: "researched", title: `${a.name} pricing page`, source: `${hostFor(a.name)}/pricing`, capturedAt: "2026-11-05T15:00:48" },
      { id: "ev_4", kind: "researched", title: `${b.name} pricing page`, source: `${hostFor(b.name)}/pricing`, capturedAt: "2026-11-05T15:01:05" },
      { id: "ev_5", kind: "unknown", title: `${b.name} changelog not read`, source: `${hostFor(b.name)}/changelog`, capturedAt: "2026-11-05T15:01:20", limitation: "Login wall" },
    ],
  };
}

/** The default sample result (Cursor vs Windsurf), for /compare?view=results. */
export const runResultSample = buildResult({
  a: { name: "Cursor", isCurrent: true, monthlyCents: 2000 },
  b: { name: "Windsurf", isCurrent: false, monthlyCents: 1500 },
  workflow: "Debugging web apps",
  task: "Fix a broken login redirect",
});
