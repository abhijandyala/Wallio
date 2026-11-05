import type { Profile } from "@/lib/types";

// SAMPLE DATA. Replace with GET /api/profile (latest confirmed version + pending inferences).

export const profileSample: Profile = {
  version: 3,
  updatedOn: "2026-11-03",
  workflows: [
    { id: "wf_debug", name: "Debugging web apps", priority: 1, tools: ["Cursor", "GitHub Copilot"] },
    { id: "wf_research", name: "Research briefs", priority: 2, tools: ["Perplexity", "Claude"] },
    { id: "wf_writing", name: "Writing docs", priority: 3, tools: ["Claude", "ChatGPT"] },
  ],
  fields: [
    {
      id: "pf_role",
      label: "Role",
      value: "Independent developer",
      source: "stated",
      status: "confirmed",
    },
    {
      id: "pf_budget",
      label: "Monthly budget",
      value: "$120",
      source: "stated",
      status: "confirmed",
    },
    {
      id: "pf_privacy",
      label: "Data sensitivity",
      value: "Private code never used for training",
      source: "stated",
      status: "confirmed",
    },
    {
      id: "pf_switch",
      label: "Open to switching",
      value: "Yes, if it saves time",
      source: "stated",
      status: "confirmed",
    },
    {
      id: "pf_stack",
      label: "Main stack",
      value: "TypeScript, Next.js",
      source: "inferred",
      inferredFrom: "GitHub: wallio-demo",
      confidence: "high",
      status: "pending",
    },
    {
      id: "pf_editor",
      label: "Editor",
      value: "VS Code family",
      source: "inferred",
      inferredFrom: "GitHub: .vscode folder",
      confidence: "medium",
      status: "pending",
    },
  ],
};
