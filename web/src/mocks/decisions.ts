import type { DecisionsData } from "@/lib/types";

// SAMPLE DATA. Replace with GET /api/decisions and POST /api/approvals/{id}/decision.
// The trial form is an owned synthetic demo form, per the PRD MVP scope.

export const decisionsSample: DecisionsData = {
  approvals: [
    {
      id: "apr_1",
      title: "Request a Windsurf trial",
      destination: "trial.wallio.test/windsurf",
      fields: [
        { label: "Name", value: "Sample User" },
        { label: "Email", value: "sample@wallio.test" },
        { label: "Plan", value: "Pro trial, 14 days" },
      ],
      consequence: "Submits one form. No payment, no account.",
      expiresAt: "2026-11-05T16:00:00",
      screenshotLabel: "Filled form, ready to submit",
    },
  ],
  recommendations: [
    {
      id: "rec_1",
      title: "Compare Cursor before it renews",
      action: "compare",
      evidence: "researched",
      href: "/compare?workflow=wf_debug&tools=Cursor,Windsurf",
      cta: "Compare",
      dueOn: "2026-11-14",
    },
    {
      id: "rec_2",
      title: "Copilot overlaps with Cursor",
      action: "review_renewal",
      evidence: "researched",
      href: "/my-ai",
      cta: "Review",
      dueOn: "2026-06-11",
    },
    {
      id: "rec_3",
      title: "Keep Claude for research briefs",
      action: "keep",
      evidence: "tested",
      href: "/compare?view=results",
      cta: "See why",
      dueOn: null,
    },
  ],
  history: [
    {
      id: "h0",
      summary: "Kept Cursor over Windsurf",
      decidedOn: "2026-11-05",
      result: "pending",
      toolName: "Cursor",
      checkInOn: "2026-11-05",
    },
    {
      id: "h1",
      summary: "Kept Claude Pro",
      decidedOn: "2026-10-21",
      result: "helped",
      toolName: "Claude",
    },
    {
      id: "h2",
      summary: "Kept Cursor over Copilot",
      decidedOn: "2026-10-12",
      result: "no_change",
      toolName: "Cursor",
    },
    {
      id: "h3",
      summary: "Dropped Gemini Advanced",
      decidedOn: "2026-09-30",
      result: "helped",
      toolName: "Gemini",
      savedAnnualCents: 23988,
    },
  ],
};
