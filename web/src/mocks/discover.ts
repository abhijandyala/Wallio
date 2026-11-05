import type { DiscoverData, Evidence, FitComponent } from "@/lib/types";
import { profileSample } from "./my-ai";

// SAMPLE DATA. Replace with GET /api/matches. Ranking and scores come from the backend.

/** Shorthand for the five fit components, in PRD weight order. */
const parts = (
  workflow: number | null,
  features: number | null,
  cost: number | null,
  privacy: number | null,
  switching: number | null,
): FitComponent[] => [
  { key: "workflow", weight: 40, score: workflow },
  { key: "features", weight: 20, score: features },
  { key: "cost", weight: 15, score: cost },
  { key: "privacy", weight: 15, score: privacy },
  { key: "switching", weight: 10, score: switching },
];

/** Adds the capture details the evidence drawer shows. Sample hashes, deterministic per id. */
export const cap = (e: Evidence): Evidence => {
  let h = 0x811c9dc5;
  for (const c of e.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const hex = (h.toString(16) + (h * 7).toString(16)).padEnd(12, "0").slice(0, 12);
  return {
    ...e,
    hash: `sha256:${hex.slice(0, 4)}…${hex.slice(-4)}`,
    method: e.kind === "tested" ? "Test harness result and log" : "Screenshot and text excerpt",
  };
};

export const discoverSample: DiscoverData = {
  workflows: profileSample.workflows,
  matches: [
    {
      id: "m_windsurf",
      workflowId: "wf_debug",
      toolName: "Windsurf",
      fit: "Agent mode reads the whole repo before it edits",
      risk: "Credit limits on the $15 plan",
      monthlyCents: 1500,
      evidence: "researched",
      comparesTo: "Cursor",
      accessMode: "researched",
      statements: [
        { role: "supporting", text: "Agent mode reads the whole repo before it edits", sourceIds: ["e_ws2"] },
        { role: "supporting", text: "$5 a month less than Cursor", sourceIds: ["e_ws1"], userInputs: ["Your tools"] },
        { role: "counter", text: "Credit limits on the $15 plan", sourceIds: ["e_ws1"] },
        { role: "uncertainty", text: "Training policy isn't on its public pages", sourceIds: ["e_ws3"] },
        { role: "next_step", text: "Run your debugging task on it and on Cursor", sourceIds: [] },
      ],
      needsTesting: ["Fixes a multi-file bug as well as Cursor", "Stays inside the credit limit for your usage"],
      savings: {
        monthlyDeltaCents: -500,
        immediateCents: 0,
        renewalAvoidanceCents: 6000,
        renewalOn: "2026-11-14",
        assumptions: [
          "You cancel Cursor at its Nov 14 renewal",
          "Windsurf Pro stays at $15 a month",
          "Both are monthly plans, so nothing is refunded now",
        ],
      },
      score: { low: 74, high: 89 },
      components: parts(88, 90, 80, null, 90),
      requirements: [
        { label: "Under $120 a month", status: "met", detail: "$15 a month" },
        { label: "Works like VS Code", status: "met", detail: "Built on VS Code" },
        { label: "TypeScript and Next.js", status: "met", detail: "Supported" },
        { label: "Code never used for training", status: "unknown", detail: "Not on public pages" },
      ],
      verified: "Read from 3 public pages. Not tested yet.",
      sources: ([
        { id: "e_ws1", kind: "researched", title: "Pricing and plan limits", source: "windsurf.com", capturedAt: "2026-11-04T10:12:00Z" },
        { id: "e_ws2", kind: "researched", title: "Agent mode docs", source: "docs.windsurf.com", capturedAt: "2026-11-04T10:14:00Z" },
        { id: "e_ws3", kind: "researched", title: "Security page", source: "windsurf.com", capturedAt: "2026-11-04T10:15:00Z", limitation: "No training policy found" },
      ] as Evidence[]).map(cap),
    },
    {
      id: "m_copilot",
      workflowId: "wf_debug",
      toolName: "GitHub Copilot",
      fit: "You already pay for it, so using it more costs nothing",
      risk: "Weaker on fixes that span many files",
      monthlyCents: 833,
      evidence: "tested",
      comparesTo: "Cursor",
      accessMode: "tested_owned_demo",
      statements: [
        { role: "supporting", text: "You already pay for it", sourceIds: [], userInputs: ["Your tools"] },
        { role: "supporting", text: "Passed 2 of 3 runs in our owned demo test", sourceIds: ["e_cp1"] },
        { role: "counter", text: "Weaker on fixes that span many files", sourceIds: ["e_cp1"] },
        { role: "next_step", text: "Read the comparison report", sourceIds: [] },
      ],
      needsTesting: ["How it does on your own repo, not the sample"],
      savings: {
        monthlyDeltaCents: -2000,
        immediateCents: 0,
        renewalAvoidanceCents: 24000,
        renewalOn: "2026-11-14",
        assumptions: [
          "You cancel Cursor at its Nov 14 renewal",
          "Copilot stays on your current plan",
          "Nothing is refunded now",
        ],
      },
      score: { low: 76, high: 76 },
      components: parts(55, 80, 100, 85, 100),
      requirements: [
        { label: "Under $120 a month", status: "met", detail: "Already paid" },
        { label: "Works like VS Code", status: "met", detail: "VS Code extension" },
        { label: "TypeScript and Next.js", status: "met", detail: "Supported" },
        { label: "Code never used for training", status: "met", detail: "Off on your plan" },
      ],
      verified: "Tested against Cursor on Nov 1. Passed 2 of 3 runs.",
      sources: ([
        { id: "e_cp1", kind: "tested", title: "Comparison run against Cursor", source: "Wallio sandbox", capturedAt: "2026-11-01T16:40:00Z" },
        { id: "e_cp2", kind: "researched", title: "Plan and data settings", source: "github.com", capturedAt: "2026-11-04T10:20:00Z" },
      ] as Evidence[]).map(cap),
    },
    {
      id: "m_zed",
      workflowId: "wf_debug",
      toolName: "Zed",
      fit: "Fast, and the free tier covers light use",
      risk: "Your VS Code extensions don't carry over",
      monthlyCents: 0,
      evidence: "researched",
      comparesTo: "Cursor",
      accessMode: "researched",
      statements: [
        { role: "supporting", text: "The free tier covers light use", sourceIds: ["e_zd1"] },
        { role: "supporting", text: "AI features are opt-in", sourceIds: ["e_zd2"] },
        { role: "counter", text: "Your VS Code extensions don't carry over", sourceIds: ["e_zd2"] },
        { role: "uncertainty", text: "Free limits may not last a month of daily debugging", sourceIds: ["e_zd1"] },
        { role: "next_step", text: "Run your debugging task on it and on Cursor", sourceIds: [] },
      ],
      needsTesting: ["Agent quality on multi-file fixes", "Whether the free tier lasts your month"],
      savings: {
        monthlyDeltaCents: -2000,
        immediateCents: 0,
        renewalAvoidanceCents: 24000,
        renewalOn: "2026-11-14",
        assumptions: ["You cancel Cursor at its Nov 14 renewal", "You stay inside Zed's free tier"],
      },
      score: { low: 73, high: 73 },
      components: parts(65, 65, 100, 90, 50),
      requirements: [
        { label: "Under $120 a month", status: "met", detail: "Free" },
        { label: "Works like VS Code", status: "missing", detail: "Its own editor" },
        { label: "TypeScript and Next.js", status: "met", detail: "Supported" },
        { label: "Code never used for training", status: "met", detail: "Opt-in only" },
      ],
      verified: "Read from 2 public pages. Not tested yet.",
      sources: ([
        { id: "e_zd1", kind: "researched", title: "Pricing", source: "zed.dev", capturedAt: "2026-11-04T10:31:00Z" },
        { id: "e_zd2", kind: "researched", title: "AI and privacy docs", source: "zed.dev", capturedAt: "2026-11-04T10:33:00Z" },
      ] as Evidence[]).map(cap),
    },
    {
      id: "m_notebooklm",
      workflowId: "wf_research",
      toolName: "NotebookLM",
      fit: "Cites the exact passage behind every answer",
      risk: "Only reads sources you add to it",
      monthlyCents: 0,
      evidence: "researched",
      comparesTo: "Perplexity",
      accessMode: "researched",
      statements: [
        { role: "supporting", text: "Cites the exact passage behind every answer", sourceIds: ["e_nb1"] },
        { role: "counter", text: "Only reads sources you add, not the open web", sourceIds: ["e_nb2"] },
        { role: "uncertainty", text: "Data and training policy isn't on its public pages", sourceIds: ["e_nb2"] },
        { role: "next_step", text: "Write one brief with it and with Perplexity", sourceIds: [] },
      ],
      needsTesting: ["Brief quality with the sources you add", "Time to a finished brief"],
      savings: {
        monthlyDeltaCents: -1667,
        immediateCents: 0,
        renewalAvoidanceCents: 20000,
        renewalOn: "2027-03-02",
        assumptions: [
          "Perplexity is prepaid yearly, so nothing is refunded now",
          "You skip its Mar 2 renewal",
          "NotebookLM stays free",
        ],
      },
      score: { low: 69, high: 84 },
      components: parts(80, 70, 100, null, 80),
      requirements: [
        { label: "Under $120 a month", status: "met", detail: "Free" },
        { label: "Cites its sources", status: "met", detail: "Every answer" },
        { label: "Searches the open web", status: "missing", detail: "Your sources only" },
        { label: "Data never used for training", status: "unknown", detail: "Not on public pages" },
      ],
      verified: "Read from 2 public pages. Not tested yet.",
      sources: ([
        { id: "e_nb1", kind: "researched", title: "Product overview", source: "notebooklm.google", capturedAt: "2026-11-03T14:02:00Z" },
        { id: "e_nb2", kind: "researched", title: "Help center: sources", source: "support.google.com", capturedAt: "2026-11-03T14:05:00Z" },
      ] as Evidence[]).map(cap),
    },
    {
      id: "m_gemini",
      workflowId: "wf_research",
      toolName: "Gemini",
      fit: "Deep Research drafts a long brief from many sites",
      risk: "Overlaps with Claude, which you already pay for",
      monthlyCents: 1999,
      evidence: "researched",
      comparesTo: "Perplexity",
      accessMode: "researched",
      statements: [
        { role: "supporting", text: "Deep Research drafts long briefs from many sites", sourceIds: ["e_gm2"] },
        { role: "counter", text: "Overlaps with Claude, which you already pay for", sourceIds: [], userInputs: ["Your tools"] },
        { role: "counter", text: "$3.32 a month more than Perplexity", sourceIds: ["e_gm1"] },
        { role: "next_step", text: "Write one brief with it and with Perplexity", sourceIds: [] },
      ],
      needsTesting: ["Brief accuracy against its own cited sources"],
      savings: {
        monthlyDeltaCents: 332,
        immediateCents: 0,
        renewalAvoidanceCents: null,
        renewalOn: "2027-03-02",
        assumptions: ["Compared with Perplexity's yearly plan, per month", "Gemini stays at $19.99 a month"],
      },
      score: { low: 74, high: 74 },
      components: parts(78, 75, 60, 70, 85),
      requirements: [
        { label: "Under $120 a month", status: "met", detail: "$19.99 a month" },
        { label: "Cites its sources", status: "met", detail: "Linked list" },
        { label: "Searches the open web", status: "met", detail: "Yes" },
        { label: "Data never used for training", status: "met", detail: "Setting available" },
      ],
      verified: "Read from 3 public pages. Not tested yet.",
      sources: ([
        { id: "e_gm1", kind: "researched", title: "Plans", source: "gemini.google", capturedAt: "2026-11-03T14:11:00Z" },
        { id: "e_gm2", kind: "researched", title: "Deep Research overview", source: "gemini.google", capturedAt: "2026-11-03T14:12:00Z" },
        { id: "e_gm3", kind: "researched", title: "Privacy hub", source: "support.google.com", capturedAt: "2026-11-03T14:14:00Z" },
      ] as Evidence[]).map(cap),
    },
  ],
  excluded: [
    { id: "x_devin", workflowId: "wf_debug", toolName: "Devin", reason: "Over your $120 budget" },
    { id: "x_replit", workflowId: "wf_debug", toolName: "Replit Agent", reason: "Code has to live in its workspace" },
    { id: "x_elicit", workflowId: "wf_research", toolName: "Elicit", reason: "Papers only, not the web" },
    { id: "x_jasper", workflowId: "wf_writing", toolName: "Jasper", reason: "Over your $120 budget" },
  ],
  noBetterMatch: [
    {
      workflowId: "wf_writing",
      currentTool: "Claude",
      currentScore: 88,
      closest: [
        { toolName: "Gemini", score: 79, reason: "Lower on long documents" },
        { toolName: "ChatGPT", score: 77, reason: "Already yours, less consistent tone" },
        { toolName: "Notion AI", score: 71, reason: "Works only inside Notion" },
      ],
    },
  ],
  others: [
    { workflowId: "wf_debug", toolName: "Tabnine", score: { low: 60, high: 68 }, reason: "Lower on workflow quality" },
    { workflowId: "wf_debug", toolName: "Amazon Q", score: { low: 58, high: 58 }, reason: "Built around AWS projects" },
    { workflowId: "wf_debug", toolName: "Aider", score: { low: 55, high: 70 }, reason: "Needs your own API key" },
    { workflowId: "wf_research", toolName: "You.com", score: { low: 63, high: 63 }, reason: "Fewer citations per answer" },
    { workflowId: "wf_research", toolName: "Consensus", score: { low: 61, high: 61 }, reason: "Papers more than the web" },
    { workflowId: "wf_research", toolName: "Phind", score: { low: 57, high: 57 }, reason: "Aimed at code questions" },
    { workflowId: "wf_writing", toolName: "Grammarly", score: { low: 56, high: 56 }, reason: "Edits more than it drafts" },
  ],
  profileVersion: 3,
  research: [
    { workflowId: "wf_debug", checked: 8, pagesRead: 14, researchedOn: "2026-11-04" },
    { workflowId: "wf_research", checked: 6, pagesRead: 9, researchedOn: "2026-11-03" },
    { workflowId: "wf_writing", checked: 6, pagesRead: 10, researchedOn: "2026-11-02" },
  ],
};
