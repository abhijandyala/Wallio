import { ArrowDown, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { homeSample } from "@/mocks/home";
import { Money } from "@/components/kit/money";
import { Tag } from "@/components/kit/tag";
import { SectionHead } from "./site-chrome";
import { cn } from "@/lib/utils";

/** Landing sections that are plain content: the problem, Vultr, what's real, privacy and questions. */

const panel = "flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface-1";
const panelTitle = "flex h-14 shrink-0 items-center justify-between gap-4 px-6 text-[15px] font-medium text-text-1";
const row = "flex min-h-12 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0";

/* ── The problem ──────────────────────────────────────────────────────── */

const PROBLEMS = [
  "Tools overlap, so you pay twice for the same job",
  "A new tool looks better, but nobody tested it on your work",
  "Plans renew whether you used them or not",
];

export function ProblemSection() {
  const { totals } = homeSample;
  const stats: [string, React.ReactNode][] = [
    ["A month", <Money key="m" cents={totals.monthlyCents} />],
    ["Tools", totals.activeTools],
    // "2 overlap in coding" → 2
    ["Overlap in coding", parseInt(totals.overlapNote ?? "0", 10)],
    ["Prices unknown", totals.unknownPriceCount],
  ];
  return (
    <section className="flex flex-col gap-section">
      <SectionHead
        id="problem"
        title="Most people pay for AI they never check"
        line="Wallio is for developers and heavy AI users with three or more subscriptions."
      />
      <div className="grid grid-cols-12 gap-gutter">
        <div className={cn(panel, "col-span-12 lg:col-span-5")}>
          <h3 className={panelTitle}>What goes wrong</h3>
          <ul className="flex flex-1 flex-col border-t border-line">
            {PROBLEMS.map((p) => (
              <li key={p} className={cn(row, "flex-1 text-text-1")}>
                <span className="size-1.5 shrink-0 rounded-[1px] bg-lavender" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(panel, "col-span-12 lg:col-span-7")}>
          <h3 className={panelTitle}>
            One sample stack
            <Tag kind="sample" />
          </h3>
          <dl className="grid flex-1 grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4 [&>div]:bg-surface-1">
            {stats.map(([label, value]) => (
              <div key={label} className="flex flex-col justify-between gap-3 px-6 py-5">
                <dt className="text-[13px] text-text-3">{label}</dt>
                <dd className="display text-[30px] leading-[32px] font-medium text-text-1">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ── Built on Vultr ───────────────────────────────────────────────────── */

type Node = { title: string; vultr?: string; lines: string[] };

const FLOW: Node[] = [
  { title: "Your browser", lines: ["A guest workspace per visitor", "No account, no passwords"] },
  { title: "Wallio web app", lines: ["Shows results", "Collects your choices"] },
  {
    title: "Wallio API",
    vultr: "Vultr Cloud Compute",
    lines: ["Los Angeles, VPC wallio-vpc", "Caddy and Postgres with row-level security", "Runs, spend caps, approvals"],
  },
];

const BRANCHES: Node[] = [
  {
    title: "Serverless Inference",
    vultr: "Vultr",
    lines: ["Pinned model qwen3.8-flash-next", "Every agent model call"],
  },
  {
    title: "Browser runner VM",
    vultr: "Vultr",
    lines: ["One isolated container per job", "Egress allowlist proxy", "Deleted and verified after each job"],
  },
];

function FlowNode({ node }: { node: Node }) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-line-strong bg-surface-2">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <span className="text-text-1">{node.title}</span>
        {node.vultr && (
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-lavender">
            <span className="size-1.5 rounded-[1px] bg-lavender" aria-hidden="true" />
            {node.vultr}
          </span>
        )}
      </div>
      <ul className="border-t border-line px-4 py-2">
        {node.lines.map((l) => (
          <li key={l} className="py-1 text-[13px] text-text-3">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Arrow() {
  return (
    <span className="grid shrink-0 place-items-center text-text-3" aria-hidden="true">
      <ArrowDown size={16} className="lg:hidden" />
      <ArrowRight size={16} className="hidden lg:block" />
    </span>
  );
}

export function VultrSection() {
  return (
    <section className="flex flex-col gap-section">
      <SectionHead
        id="vultr"
        title="Built on Vultr"
        line="Every model call and every browser session runs on Vultr. Nothing runs on your machine."
      />
      <div className={cn(panel, "p-4 sm:p-6")}>
        <figure
          aria-label="How a run flows: your browser, the web app, the Wallio API on Vultr, then Vultr Serverless Inference and the browser runner VM, with evidence going back to the API"
          className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1.25fr_auto_1.35fr] lg:items-center"
        >
          {FLOW.map((n) => (
            <div key={n.title} className="contents">
              <FlowNode node={n} />
              <Arrow />
            </div>
          ))}
          <div className="flex flex-col gap-3">
            {BRANCHES.map((n) => (
              <FlowNode key={n.title} node={n} />
            ))}
          </div>
        </figure>
        <p className="mt-4 border-t border-line pt-4 text-[13px] text-text-2">
          Evidence comes back to the API: screenshots, page hashes and test results, each linked to the claim it
          supports.
        </p>
      </div>
    </section>
  );
}

/* ── What's real today ────────────────────────────────────────────────── */

type StatusGroup = { label: string; mark: string; items: { text: string; meta?: string }[] };

const STATUS_LEFT: StatusGroup[] = [
  {
    label: "Live now",
    mark: "bg-lime",
    items: [
      { text: "Wallio API on Vultr, in demo playback mode", meta: "149-28-76-16.sslip.io" },
      { text: "A guest workspace for every visitor" },
      { text: "Approval gate that rejects a second approval" },
      { text: "Policy decisions on every browser action" },
      { text: "Compare runs against the API" },
    ],
  },
  {
    label: "In progress",
    mark: "bg-lavender",
    items: [{ text: "Live browser runner on Vultr" }, { text: "Live model calls inside runs" }],
  },
];

const STATUS_RIGHT: StatusGroup[] = [
  {
    label: "Sample data",
    mark: "border border-text-3 bg-transparent",
    items: [{ text: "Home, My AI, Discover and Decisions" }],
  },
  {
    label: "Not doing yet",
    mark: "bg-text-disabled",
    items: [
      { text: "Cancelling plans for you" },
      { text: "Buying anything" },
      { text: "Signing into your accounts" },
      { text: "GitHub import and email receipts" },
    ],
  },
];

function StatusPanel({ groups }: { groups: StatusGroup[] }) {
  return (
    <div className={cn(panel, "col-span-12 lg:col-span-6")}>
      {groups.map((g) => (
        <div key={g.label} className="border-t border-line first:border-t-0">
          <h3 className="flex h-12 items-center gap-2.5 px-6 text-[13px] text-text-3">
            <span className={cn("size-1.5 rounded-[1px]", g.mark)} aria-hidden="true" />
            {g.label}
          </h3>
          <ul className="border-t border-line">
            {g.items.map((i) => (
              <li key={i.text} className={cn(row, "justify-between gap-6")}>
                <span className="min-w-0 text-text-1">{i.text}</span>
                {i.meta && (
                  <span className="hidden shrink-0 font-mono text-[12px] text-text-3 sm:block">{i.meta}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function StatusSection() {
  return (
    <section className="flex flex-col gap-section">
      <SectionHead
        id="status"
        title="What's real today"
        line="A hackathon build, labelled honestly. Here is what runs for real, what is close, and what is still sample data."
      />
      <div className="grid grid-cols-12 gap-gutter">
        <StatusPanel groups={STATUS_LEFT} />
        <StatusPanel groups={STATUS_RIGHT} />
      </div>
    </section>
  );
}

/* ── Privacy and questions ────────────────────────────────────────────── */

const DATA = [
  "Stored: your tool list, profile, runs and evidence",
  "Kept in your own guest workspace, which expires",
  "Never used to train any model",
  "No passwords, cards or API keys, ever",
  "Tests use a sample task, never your code",
  "Reset demo in Settings clears it all",
];

const FAQ: [string, string][] = [
  ["Does it cancel things for me?", "No. It says what to keep or drop, and you cancel on the vendor's site."],
  ["Does it see my code?", "No. Tests run a sample task on a test page we own."],
  ["Is the test a benchmark of the whole product?", "No. It measures one task in our demo environment, and says so."],
  ["What if it's wrong?", "Every line links to its source and unknowns say Unknown, so you can check."],
  ["What does it cost?", "Free during the hackathon. Each run stops at a $0.50 spend cap."],
];

export function QuestionsSection() {
  return (
    <section className="flex flex-col gap-section">
      <SectionHead
        id="questions"
        title="Your data, and the usual questions"
        line="What Wallio keeps, what it never touches, and short answers to what people ask first."
      />
      <div className="grid grid-cols-12 gap-gutter">
        <div className={cn(panel, "col-span-12 lg:col-span-5")}>
          <h3 className={panelTitle}>Your data</h3>
          <ul className="flex flex-1 flex-col border-t border-line">
            {DATA.map((d) => (
              <li key={d} className={cn(row, "flex-1 text-text-1")}>
                <span className="size-1.5 shrink-0 rounded-[1px] bg-lime" aria-hidden="true" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(panel, "col-span-12 lg:col-span-7")}>
          <h3 className={panelTitle}>Questions</h3>
          <dl className="flex flex-1 flex-col border-t border-line">
            {FAQ.map(([q, a]) => (
              <div
                key={q}
                className="flex flex-1 flex-col gap-1 border-t border-line px-6 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-6"
              >
                <dt className="shrink-0 text-text-1 sm:w-64">{q}</dt>
                <dd className="min-w-0 text-text-2">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ── For judges: the hackathon entry in one place ─────────────────────── */

const ENTRY: [string, string][] = [
  ["Event", "Vultr Agent Rush"],
  ["Track", "Blast Radius Zero"],
  ["The question", "Keep GitHub Copilot for debugging, or try Zed?"],
  ["Task", "Fix an off-by-one bug, on a test page we own"],
  ["Proof", "7 success checks, shown beside every run"],
];

const BRANCH = "https://github.com/abhijandyala/Wallio/blob/abhijandyala";

/** null href = not ready yet. Shown so the list is complete, not hidden until it exists. */
const SUBMISSION: { label: string; href: string | null; meta: string }[] = [
  { label: "Run it live", href: "/compare?live=1", meta: "Compare, live" },
  { label: "Live API on Vultr", href: "https://149-28-76-16.sslip.io/api/health", meta: "/api/health" },
  { label: "Code", href: "https://github.com/abhijandyala/Wallio", meta: "GitHub" },
  { label: "Architecture", href: `${BRANCH}/docs/ARCHITECTURE.md`, meta: "docs/ARCHITECTURE.md" },
  { label: "Golden path and success rubric", href: "https://github.com/abhijandyala/Wallio/blob/anishalleti/docs/GOLDEN_PATH.md", meta: "docs/GOLDEN_PATH.md" },
  { label: "Demo video", href: null, meta: "Coming soon" },
  { label: "Slide deck", href: null, meta: "Coming soon" },
];

export function JudgesSection() {
  return (
    <section className="flex flex-col gap-section">
      <SectionHead
        id="judges"
        title="For judges"
        line="The entry, the one journey it must complete, and every piece of the submission."
      />
      <div className="grid grid-cols-12 gap-gutter">
        <div className={cn(panel, "col-span-12 lg:col-span-5")}>
          <h3 className={panelTitle}>The entry</h3>
          <dl className="border-t border-line">
            {ENTRY.map(([k, v]) => (
              <div key={k} className={cn(row, "flex-wrap justify-between gap-x-6 gap-y-1")}>
                <dt className="shrink-0 text-text-3">{k}</dt>
                <dd className="min-w-0 text-right text-text-1">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={cn(panel, "col-span-12 lg:col-span-7")}>
          <h3 className={panelTitle}>Submission</h3>
          <ul className="border-t border-line">
            {SUBMISSION.map((s) => (
              <li key={s.label} className="border-t border-line first:border-t-0">
                {s.href ? (
                  <a
                    href={s.href}
                    {...(s.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="group flex min-h-12 items-center gap-3 px-6 py-3"
                  >
                    <span className="size-1.5 shrink-0 rounded-[1px] bg-lime" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-text-1">{s.label}</span>
                    <span className="hidden shrink-0 font-mono text-[12px] text-text-3 sm:block">{s.meta}</span>
                    <ArrowRight size={13} className="shrink-0 text-text-3 transition-colors group-hover:text-text-1" />
                  </a>
                ) : (
                  <span className="flex min-h-12 items-center gap-3 px-6 py-3">
                    <span className="size-1.5 shrink-0 rounded-[1px] bg-text-disabled" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-text-3">{s.label}</span>
                    <span className="shrink-0 text-[13px] text-text-3">{s.meta}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
