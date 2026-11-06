/**
 * Every word on the landing page. Sections read from here; nothing else holds copy.
 * Keep it true to what Wallio does today, and say "sample" where it is.
 */

export const LINKS = {
  app: "/home",
  myAi: "/my-ai",
  discover: "/discover",
  compare: "/compare",
  live: "/compare?live=1",
  containment: "/compare?containment=1",
  decisions: "/decisions",
  settings: "/settings",
  repo: "https://github.com/abhijandyala/Wallio",
  api: "https://149-28-76-16.sslip.io/api/health",
  privacy: "/privacy",
  terms: "/terms",
};

export const NAV = {
  items: [
    { label: "Product", href: "#explore" },
    { label: "Safety", href: "#limits" },
    { label: "Built on Vultr", href: "#vultr" },
    { label: "How it works", href: "#steps" },
    { label: "Proof", href: "#proof" },
  ],
  cta: { label: "Open the app", href: LINKS.app },
};

export const HERO = {
  eyebrow: "Wallio",
  title: ["Your Personal", "AI Wallet"],
  body: "Know what your AI really costs, and what could fit you better.",
  cta: { label: "Try the demo", href: LINKS.app },
};

/** The two giant lines that slide past each other. */
export const SCROLL_TEXT = ["Know Your", "AI Costs"];

/** The big statements between sections, one entry per line. */
export const STATEMENTS = {
  intro: ["Wallio is a personal wallet", "for the AI tools you pay for."],
  receipts: ["Every answer shows its work,", "with a source for each line."],
  approval: ["Nothing is sent", "until you approve it."],
  keep: ["Keeping what you have", "is a real answer."],
};

export const EXPLORE = {
  eyebrow: "Explore",
  title: "Explore Wallio",
  cta: { label: "Open the app", href: LINKS.app },
  items: [
    {
      title: "Track",
      body: "See every AI tool you pay for, what it costs a month and when it renews. A price nobody has confirmed stays Unknown, never $0.",
      href: LINKS.myAi,
    },
    {
      title: "Compare",
      body: "Test a new tool against yours on your own task, in a sealed browser on Vultr, with a spend cap and a time limit on every run.",
      href: LINKS.live,
    },
    {
      title: "Decide",
      body: "Get one clear answer with its reasons and sources. Approve the exact fields sent, or skip it. Nothing is sent without you.",
      href: LINKS.decisions,
    },
  ],
};

export const LIMITS = {
  eyebrow: "Limits",
  title: "Hard limits on every run",
  body: "Every comparison runs inside the same limits. The API and the browser runner enforce them, not just this page. You can lower them in Settings.",
  // Every number here is a real limit from packages/contracts and the live run screen.
  cards: [
    {
      label: ["Spend cap", "per run"],
      value: "$0.50",
      by: "Enforced by the API",
      body: "Each comparison gets a hard budget for model calls and the browser. The run stops before it goes over, and the spend is shown on the result.",
    },
    {
      label: ["Longest", "run"],
      value: "180s",
      by: "Enforced by the runner",
      body: "The browser gets 3 minutes and 20 actions, can only reach each tool's official sites, and is destroyed when the run ends.",
    },
    {
      label: ["Sent", "without you"],
      value: "0",
      by: "Enforced by the API",
      body: "Forms are filled, never submitted, until you approve the exact fields. An approval works once; a replay is refused.",
    },
    {
      label: ["Success", "checks"],
      value: "7",
      by: "Shown on every run",
      body: "Inference, evidence, traceability, honesty, approval, containment and timing, each passed or explained.",
    },
  ],
};

export const VULTR = {
  eyebrow: "Infrastructure",
  title: "Built on Vultr",
  body: "The Wallio API runs on Vultr Cloud Compute in Los Angeles. Model calls go to Vultr Serverless Inference, and nowhere else.",
  cta: { label: "Check the live API", href: LINKS.api },
  pin: "API · Los Angeles",
};

export const STEPS = {
  eyebrow: "How it works",
  title: "From your stack to a decision",
  steps: [
    {
      body: "List what you pay for. Wallio works out the monthly cost, the renewals and where your tools overlap.",
      label: ["Step 01", "Add your tools"],
      icon: "wallet",
    },
    {
      body: "Pick a candidate. Wallio researches both and runs your task in a browser on Vultr that it deletes afterwards.",
      label: ["Step 02", "Compare on your task"],
      icon: "compare",
    },
    {
      body: "Read the answer and its sources, then approve the next step or skip it. Keeping what you have counts.",
      label: ["Step 03", "Decide"],
      icon: "decide",
    },
  ],
  marqueeLabel: "Tools in the sample stack",
  tools: ["Cursor", "GitHub Copilot", "Claude", "ChatGPT", "Perplexity", "Zed", "Windsurf", "Gemini", "Midjourney", "Tabnine", "Replit Agent"],
};

export const PROOF = {
  eyebrow: "Proof",
  title: "See it work",
  body: "Two things you can open right now, against the Wallio API on Vultr.",
  cta: { label: "View the code", href: LINKS.repo },
  items: [
    {
      title: "Compare, Live: From Plan to Cleanup",
      body: "Every event the API sends, from the plan to the cleanup, as it happens. When the API is offline it plays a run recorded from it.",
      meta: "Run timeline",
      image: { src: "/landing/compare-run.webp", alt: "Compare, live: the run timeline from plan to cleanup" },
      href: LINKS.live,
    },
    {
      title: "Approve Once. A Replay Is Refused.",
      body: "You approve the exact fields sent, once. A second approval of the same request is refused by the API, and the browser is removed after the run.",
      meta: "Blast Radius Zero",
      image: { src: "/landing/compare-approval.webp", alt: "An approved trial request and the refused replay" },
      href: LINKS.containment,
    },
  ],
};

export const FOOTER = {
  title: ["Your personal", "AI wallet"],
  cta: { lead: "See it on sample data", label: "Try the demo", href: LINKS.app },
  links: [
    [
      ["Home", "/home"],
      ["My AI", LINKS.myAi],
      ["Discover", LINKS.discover],
      ["Compare", LINKS.compare],
      ["Decisions", LINKS.decisions],
    ],
    [
      ["Privacy", LINKS.privacy],
      ["Terms", LINKS.terms],
      ["Live API", LINKS.api],
    ],
  ],
  repo: LINKS.repo,
  note: "What's real today: the Wallio API runs on Vultr and plays runs in demo playback. The run, the approval gate and the policy decisions are real; live browser and model calls inside runs are in progress. Home, My AI, Discover and Decisions show sample data. Wallio never asks for passwords, cards or API keys.",
  left: "Built for the Vultr Agent Rush",
  right: "© 2026 Wallio",
};
