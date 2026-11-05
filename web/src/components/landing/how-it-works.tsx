"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "@phosphor-icons/react";
import { homeSample } from "@/mocks/home";
import { discoverSample } from "@/mocks/discover";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { PassBar } from "@/components/kit/charts";
import { Tag } from "@/components/kit/tag";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The four tabs in order. Pick one on the left; the right shows that screen on sample data. */
const STEPS = [
  { id: "my-ai", name: "My AI", href: "/my-ai", title: "Every AI tool you pay for, at its monthly cost" },
  { id: "discover", name: "Discover", href: "/discover", title: "Tools ranked against the work you do" },
  { id: "compare", name: "Compare", href: "/compare", title: "Two tools, your task, a pass or a fail" },
  { id: "decisions", name: "Decisions", href: "/decisions", title: "Nothing is sent until you approve it" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function HowItWorks() {
  const [pick, setPick] = useState<StepId>("my-ai");
  const step = STEPS.find((s) => s.id === pick)!;

  return (
    <div className="grid grid-cols-12 gap-gutter">
      <ol className="col-span-12 flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface-1 lg:col-span-4">
        {STEPS.map((s, i) => {
          const on = s.id === pick;
          return (
            <li key={s.id} className="flex border-t border-line first:border-t-0 lg:flex-1">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setPick(s.id)}
                className="group flex h-14 w-full items-center gap-4 px-6 text-left lg:h-auto lg:min-h-[72px]"
              >
                <span
                  className={cn(
                    "tnum w-6 shrink-0 text-[13px] transition-colors",
                    on ? "text-lavender" : "text-text-3",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[15px] transition-colors",
                    on ? "text-text-1" : "text-text-2 group-hover:text-text-1",
                  )}
                >
                  {s.name}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-[1px] transition-colors",
                    on ? "bg-lavender" : "bg-transparent",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>

      <section className="col-span-12 flex flex-col overflow-hidden lg:min-h-[392px] rounded-[20px] border border-line bg-surface-1 lg:col-span-8">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 px-6 py-3">
          <AnimatePresence initial={false} mode="wait">
            <motion.h3
              key={step.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="min-w-0 text-[15px] font-medium text-text-1 sm:truncate"
            >
              {step.title}
            </motion.h3>
          </AnimatePresence>
          <Link
            href={step.href}
            className="shrink-0 text-[13px] text-text-3 transition-colors hover:text-text-1"
          >
            Open {step.name}
          </Link>
        </header>
        <div className="relative flex-1 border-t border-line">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {pick === "my-ai" && <MyAiPreview />}
              {pick === "discover" && <DiscoverPreview />}
              {pick === "compare" && <ComparePreview />}
              {pick === "decisions" && <DecisionsPreview />}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

const row = "flex h-12 items-center gap-3 border-t border-line px-6 first:border-t-0";

function MyAiPreview() {
  const { subscriptions, totals } = homeSample;
  return (
    <ul>
      {subscriptions.map((s) => (
        <li key={s.id} className={row}>
          <ToolMark name={s.toolName} />
          <span className="min-w-0 flex-1 truncate text-text-1">
            {s.toolName} <span className="text-text-3">{s.plan}</span>
          </span>
          <span className="hidden w-24 shrink-0 text-[13px] text-text-3 sm:block">
            {s.renewsOn ? `Renews ${formatShortDate(s.renewsOn)}` : "No renewal"}
          </span>
          <Money cents={s.monthlyCents} className="w-20 shrink-0 text-right" />
        </li>
      ))}
      <li className={cn(row, "text-text-2")}>
        <span className="min-w-0 flex-1 truncate">
          A month
          {totals.unknownPriceCount > 0 && (
            <span className="text-text-3"> · {totals.unknownPriceCount} price unknown</span>
          )}
        </span>
        <Money cents={totals.monthlyCents} className="w-20 shrink-0 text-right text-text-1" />
      </li>
    </ul>
  );
}

function DiscoverPreview() {
  // Same order Discover uses: by the middle of each score range.
  const mid = (m: (typeof discoverSample.matches)[number]) => (m.score.low + m.score.high) / 2;
  const top = [...discoverSample.matches].sort((a, b) => mid(b) - mid(a)).slice(0, 5);
  return (
    <ul>
      {top.map((m, i) => (
        <li key={m.id} className={row}>
          <span className="tnum w-4 shrink-0 text-[13px] text-text-3">{i + 1}</span>
          <ToolMark name={m.toolName} />
          <span className="w-32 shrink-0 truncate text-text-1">{m.toolName}</span>
          <span className="hidden min-w-0 flex-1 truncate text-[13px] text-text-3 md:block">{m.fit}</span>
          <span className="flex-1 md:hidden" />
          <Tag kind={m.accessMode === "researched" ? "researched" : "tested"} className="hidden w-20 sm:inline-flex" />
          <span className="tnum w-14 shrink-0 text-right text-text-1">
            {m.score.low === m.score.high ? m.score.low : `${m.score.low}–${m.score.high}`}
          </span>
        </li>
      ))}
      <li className={cn(row, "text-[13px] text-text-3")}>
        A range means some parts of the fit are still unknown.
      </li>
    </ul>
  );
}

function ComparePreview() {
  return (
    <div className="flex flex-col">
      <div className={cn(row, "text-[13px] text-text-3")}>
        <span className="min-w-0 flex-1 truncate">
          Task · fix the login redirect bug
        </span>
        <Tag kind="tested">Tested in our demo app</Tag>
      </div>
      {[
        { name: "Cursor", passed: 3, secs: 40, cents: 9, best: true },
        { name: "Windsurf", passed: 2, secs: 47, cents: 10, best: false },
      ].map((t) => (
        <div key={t.name} className="flex h-16 items-center gap-3 border-t border-line px-6">
          <ToolMark name={t.name} />
          <span className="w-20 shrink-0 truncate text-text-1 sm:w-24">{t.name}</span>
          <span className="flex h-3.5 min-w-0 flex-1">
            <PassBar passed={t.passed} attempts={3} best={t.best} />
          </span>
          <span className="tnum w-14 shrink-0 text-right text-text-1">{t.passed} of 3</span>
          <span className="tnum hidden w-14 shrink-0 text-right text-text-3 sm:block">{t.secs}s</span>
          <Money cents={t.cents} className="hidden w-14 shrink-0 text-right text-text-3 sm:block" />
        </div>
      ))}
      <code className="block border-t border-line px-6 py-4 font-mono text-[12px] text-text-2">
        expect(res.headers.location).toBe(&quot;/dashboard&quot;)
      </code>
      <p className="border-t border-line px-6 py-4 text-[13px] text-text-3">
        Runs in a sealed browser on Vultr. It measures your task, not the whole product.
      </p>
    </div>
  );
}

function DecisionsPreview() {
  const rows: [string, React.ReactNode][] = [
    ["Action", "Ask Windsurf for a trial"],
    ["Sends to", <span key="h" className="font-mono text-[13px]">trial.wallio.test/windsurf</span>],
    ["Fields", "Name, work email"],
    ["Valid for", "30 min"],
  ];
  return (
    <div className="flex flex-col">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className={cn(row, "justify-between gap-6")}>
            <dt className="shrink-0 text-text-3">{k}</dt>
            <dd className="min-w-0 truncate text-right text-text-1">{v}</dd>
          </div>
        ))}
      </dl>
      <ul className="border-t border-line">
        {["Fields match what you saw", "Destination is on the allowlist", "Not expired, not used before"].map((c) => (
          <li key={c} className="flex h-10 items-center gap-3 px-6 text-[13px] text-text-2">
            <Check size={12} weight="bold" className="shrink-0 text-lime" />
            {c}
          </li>
        ))}
      </ul>
      <p className="flex h-12 items-center gap-3 border-t border-line px-6 text-text-1">
        <span className="size-1.5 shrink-0 rounded-[1px] bg-lavender" aria-hidden="true" />
        Waiting for you
      </p>
    </div>
  );
}
