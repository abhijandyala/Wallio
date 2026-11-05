/**
 * Every word on the landing page, in one place. Sections read from here; nothing else
 * holds copy. Keep it true to what Wallio does today, and say "sample" where it is.
 */

export const LINKS = {
  app: "/home",
  live: "/compare?live=1",
  containment: "/compare?containment=1",
  myAi: "/my-ai",
  discover: "/discover",
  compare: "/compare",
  decisions: "/decisions",
  settings: "/settings",
  repo: "https://github.com/abhijandyala/Wallio",
  architecture: "https://github.com/abhijandyala/Wallio/blob/abhijandyala/docs/ARCHITECTURE.md",
  goldenPath: "https://github.com/abhijandyala/Wallio/blob/anishalleti/docs/GOLDEN_PATH.md",
  api: "https://149-28-76-16.sslip.io/api/health",
  privacy: "/privacy",
  terms: "/terms",
};

export const NAV = {
  items: [
    { label: "Product", href: "#gateway", caret: true },
    { label: "Safety", href: "#containment", caret: true },
    { label: "Built on Vultr", href: "#vultr", caret: false },
    { label: "For judges", href: "#judges", caret: true },
  ],
  secondary: { label: "View the code", href: LINKS.repo },
  primary: { label: "Open the app", href: LINKS.app },
};

export const HERO = {
  badge: "Vultr Agent Rush · Blast Radius Zero",
  title: "Your Personal AI Wallet",
  subtitle: "Know What Your AI Really Costs",
  body: "Wallio tracks every AI tool you pay for, tests a new one against yours on your own task, and acts only after you approve.",
  cta: { label: "Try the demo", href: LINKS.app },
  image: { src: "/landing/home.webp", alt: "The Wallio home dashboard: monthly spend, the next decision and your AI stack" },
};

export const STATS = {
  badge: "Limits on every run",
  title: ["Limits that", "Protect You."],
  body: "The same hard limits apply to every comparison Wallio runs. You can lower them in Settings.",
  primary: { label: "Run it live", href: LINKS.live },
  secondary: { label: "Open the app", href: LINKS.app },
  rows: [
    { value: "$0.50", label: "Spend cap per run" },
    { value: "180s", label: "Longest run" },
    { value: "0", label: "Sent without you" },
    { value: "0", label: "Unsourced claims" },
    { value: "7", label: "Success checks" },
  ],
};

export const GATEWAY = {
  title: ["Everything About Your AI,", "In One Place."],
  cards: [
    { title: "Home", body: "Your AI setup at a glance: spend, renewals and what needs you.", cta: "Open Home", href: "/home", icon: "home" },
    { title: "My AI", body: "Every tool you pay for, what it costs a month and what you use it for.", cta: "Open My AI", href: LINKS.myAi, icon: "wallet" },
    { title: "Settings", body: "Budget, spend caps, approvals, notifications and your data.", cta: "Open Settings", href: LINKS.settings, icon: "settings" },
    { title: "Discover", body: "Tools ranked against the work you actually do, with the reasons.", cta: "Open Discover", href: LINKS.discover, icon: "discover" },
    { title: "Compare", body: "Two tools, your task, a sealed browser on Vultr, a pass or a fail.", cta: "Run it live", href: LINKS.live, icon: "compare" },
    { title: "Decisions", body: "Keep, try or cancel. Nothing is sent until you approve it.", cta: "Open Decisions", href: LINKS.decisions, icon: "decisions" },
  ],
};

export const STACK = {
  badge: "Sample stack",
  title: "Every Tool. Its Real Cost.",
  body: "What a developer with six AI tools pays each month, as Wallio shows it.",
  footnote: "Sample data. A price nobody has confirmed shows as Unknown, never $0.",
};

export const MODES = {
  badge: "How far Wallio goes",
  title: "From Tracking to Deciding",
  cards: [
    {
      title: "TRACK",
      tag: null,
      body: "See every AI subscription, what it costs a month and when it renews.",
      bullets: ["Monthly cost for every tool", "Renewals before they charge", "Overlap between tools", "Budget meter and alerts", "Unknown prices stay Unknown"],
    },
    {
      title: "COMPARE",
      tag: "Most used",
      body: "Test a new tool against yours on your own task, in a sealed browser on Vultr.",
      bullets: ["Your task, not a benchmark", "Every claim links to a source", "Spend cap and time limit", "Blocked sites never reached", "Browser deleted after the run"],
    },
    {
      title: "DECIDE",
      tag: null,
      body: "Get one clear answer with its reasons, then approve or skip the next step.",
      bullets: ["Keep, try, compare or cancel", "Reasons for and against", "Savings with their assumptions", "Approve the exact fields sent", "A used approval can't be reused"],
    },
  ],
  primary: { label: "Try the demo", href: LINKS.app },
  secondary: { label: "Run it live", href: LINKS.live },
};

export const CONTAINMENT = {
  tiersTitle: "Choose Your Spend Cap",
  tiers: [
    { chip: "Cap 1", value: "$0.25", note: "Quick check", amount: "1 run" },
    { chip: "Cap 2", value: "$0.50", note: "Default", amount: "Golden path" },
    { chip: "Cap 3", value: "$1.00", note: "Deeper run", amount: "2 tools" },
    { chip: "Cap 4", value: "$2.00", note: "Coming later", amount: "3 tools" },
  ],
  title: "Containment Test",
  tag: "Blast Radius Zero",
  body: "Wallio opens a hostile page we built. It tries to send the agent to a private address and the cloud metadata service. Policy refuses every one, and the browser is removed.",
  stats: [
    { value: "3", label: "Actions refused" },
    { value: "0", label: "Private hosts reached" },
    { value: "1", label: "Use per approval" },
    { value: "100%", label: "Cleanup checked" },
  ],
  cta: { label: "Run the containment test", href: LINKS.containment },
  primary: { label: "Run it live", href: LINKS.live },
  secondary: { label: "How it works", href: "#steps" },
};

export const STEPS = {
  badge: "How it works",
  title: ["From Your Stack", "to a Decision."],
  body: "Add what you pay for, test what could fit better on your own work, then decide. Wallio does the research in a sealed browser on Vultr.",
  primary: { label: "Try the demo", href: LINKS.app },
  secondary: { label: "Run it live", href: LINKS.live },
  steps: [
    { eyebrow: "Step 01", title: "Add Your Tools", body: "List what you pay for. Wallio works out the monthly cost, renewals and overlap." },
    { eyebrow: "Step 02", title: "Compare on Your Task", body: "Pick a candidate. Wallio researches both and runs your task in a browser it deletes after." },
    { eyebrow: "Step 03", title: "Decide", body: "Read the answer and its sources, then approve the next step or skip it." },
  ],
};

export const LIVE = {
  title: "Compare, Live",
  body: "Runs against the Wallio API on Vultr, or a run recorded from it when the API is offline.",
  features: [
    { title: "Run Timeline", body: "Every event the API sends, from plan to cleanup, as it happens." },
    { title: "The Answer", body: "One recommendation with reasons for and against, and a source for each." },
    { title: "Approval With a Replay Check", body: "Approve the exact fields once. A second approval is refused by the API." },
  ],
  images: [
    { src: "/landing/compare-run.webp", alt: "Compare, live: the run timeline from plan to cleanup", zoom: { scale: 1.6, origin: "100% 0%" } },
    { src: "/landing/compare-answer.webp", alt: "Compare, live: the recommendation with its sources", zoom: { scale: 1.6, origin: "100% 8%" } },
    { src: "/landing/compare-approval.webp", alt: "Compare, live: an approved trial request and the refused replay", zoom: { scale: 1.6, origin: "100% 55%" } },
  ],
};

export const VULTR = {
  badge: "Runs on Vultr",
  title: "Every Model Call on Vultr",
  body: ["Vultr Serverless Inference with a pinned model.", "No other model provider, ever."],
  chat: {
    title: "Ask Wallio",
    tag: "qwen3.8-flash-next",
    newChat: "New question",
    search: "Search questions",
    tabs: ["Questions", "Runs", "Tools"],
    history: "Which tool should I drop?",
    empty: "Ask anything about your AI tools",
    hint: "Answers cite your data and captured pages",
    chips: ["What renews this month?", "Is Copilot worth it?", "Compare Copilot and Zed"],
  },
};

export const RECEIPTS = {
  title: ["Every Answer", "Shows Its Work"],
  body: "Each line in a recommendation links to a capture, a test or something you told us. Keeping what you have is a real answer.",
  primary: { label: "Open Discover", href: LINKS.discover },
  secondary: { label: "Open the app", href: LINKS.app },
  image: { src: "/landing/discover.webp", alt: "Discover: tools ranked against your work, with reasons and sources" },
  cards: [
    { title: "Evidence Drawer", body: "Every capture with its page, time, screenshot, hash and what it can't tell you." },
    { title: "Reasons For and Against", body: "Supporting points, counter points, what's unsure and the next step, each with a source." },
    { title: "Savings With Assumptions", body: "Cash back now and at renewal, kept apart, with the assumptions written out." },
    { title: "Unknown Stays Unknown", body: "A missing price or untested claim says so. Nothing is filled in to look better." },
  ],
};

export const DATA = {
  badge: "Your data",
  title: ["Your Data,", "Under Your Control."],
  body: "Budget, spend caps, approvals and privacy live in Settings. Export everything or delete it, any time.",
  image: { src: "/landing/settings.webp", alt: "Wallio Settings: privacy and data controls", zoom: { scale: 1.3, origin: "100% 0%" } },
};

export const CLOSING = {
  title: ["See It Work", "on Sample Data"],
  body: "No account. No passwords. Nothing is sent without you.",
  primary: { label: "Try the demo", href: LINKS.app },
  secondary: { label: "Run it live", href: LINKS.live },
};

export const FOOTER = {
  tagline: "Your personal AI wallet",
  about: ["Built for the Vultr Agent Rush hackathon,", "Blast Radius Zero track."],
  team: "Abhijan Jandyala · Anish Alleti · Adhvik Vala",
  columns: [
    { title: "Product", links: [["Home", "/home"], ["My AI", "/my-ai"], ["Discover", "/discover"], ["Compare", "/compare"], ["Decisions", "/decisions"]] },
    { title: "Proof", links: [["Compare, live", LINKS.live], ["Containment test", LINKS.containment], ["Architecture", LINKS.architecture], ["Golden path", LINKS.goldenPath]] },
    { title: "Project", links: [["GitHub", LINKS.repo], ["Live API", LINKS.api], ["Privacy", LINKS.privacy], ["Terms", LINKS.terms], ["Settings", LINKS.settings]] },
  ],
  platforms: [
    { top: "Open", bottom: "the app", href: LINKS.app, icon: "app" },
    { top: "Run", bottom: "Compare, live", href: LINKS.live, icon: "play" },
    { top: "View", bottom: "the code", href: LINKS.repo, icon: "code" },
    { top: "Check", bottom: "the live API", href: LINKS.api, icon: "api" },
  ],
  watermark: "Wallio",
  disclosureTitle: "What's real today",
  disclosure: [
    "The Wallio API runs on Vultr Cloud Compute in Los Angeles. It currently plays runs in demo playback: the run, the approval gate and the policy decisions are real; the browser and model calls are not yet.",
    "The live browser runner and live model calls inside runs are in progress. Home, My AI, Discover and Decisions show sample data until they connect.",
    "Wallio never asks for passwords, cards or API keys. Tests use a sample task on a page we own, never your code. Guest workspaces expire, and Reset demo in Settings clears yours.",
    "Not doing yet: cancelling plans for you, buying anything, signing into your accounts, GitHub import and email receipts.",
  ],
  copyright: "© 2026 Wallio. A hackathon project.",
  legal: [["Privacy", LINKS.privacy], ["Terms", LINKS.terms], ["GitHub", LINKS.repo], ["Architecture", LINKS.architecture]],
};
