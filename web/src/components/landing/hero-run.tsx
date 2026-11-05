"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotionConfig,
} from "motion/react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { StepList } from "@/components/kit/step-list";
import { ToolMark } from "@/components/kit/tool-mark";
import { PassBar } from "@/components/kit/charts";
import { Meter } from "@/components/kit/meter";
import { Tag } from "@/components/kit/tag";
import { cn } from "@/lib/utils";

/**
 * The hero: one comparison playing through, start to verdict. Same story as the sample data
 * (Cursor renews soon, Windsurf might be cheaper). Plays once when it scrolls into view; Replay
 * runs it again. Reduced motion shows the finished run.
 */

const STAGES = ["Plan", "Research", "Test", "Verify", "Report"];

const STEPS: {
  id: string;
  label: string;
  at: number;
  stage: number;
  actions: number;
  spendCents: number;
  blocked?: string;
}[] = [
  { id: "plan", label: "Plan a test from your debugging work", at: 2, stage: 0, actions: 0, spendCents: 1 },
  { id: "r1", label: "Read Cursor's pricing and docs", at: 6, stage: 1, actions: 4, spendCents: 3 },
  { id: "r2", label: "Read Windsurf's pricing and docs", at: 9, stage: 1, actions: 8, spendCents: 5 },
  { id: "deny", label: "Open Windsurf's sign-up page", at: 11, stage: 1, actions: 9, spendCents: 5, blocked: "Not allowed" },
  { id: "test", label: "Fix the login bug with both tools", at: 31, stage: 2, actions: 17, spendCents: 14 },
  { id: "verify", label: "Check each fix against the test", at: 38, stage: 3, actions: 20, spendCents: 17 },
  { id: "report", label: "Write the answer with its sources", at: 43, stage: 4, actions: 21, spendCents: 19 },
];

const TICK = 700; // ms per step on screen
const CAP = { seconds: 180, actions: 40, cents: 50 };

export function HeroRun() {
  const reduce = useReducedMotionConfig();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [done, setDone] = useState(0);
  const [round, setRound] = useState(0);

  const shown = reduce ? STEPS.length : done;
  const running = inView && shown < STEPS.length;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setDone((d) => d + 1), shown === 0 ? 500 : TICK);
    return () => clearTimeout(t);
  }, [running, shown, round]);

  const finished = shown === STEPS.length;
  const last = shown > 0 ? STEPS[shown - 1] : null;
  const stage = finished ? STAGES.length : STEPS[shown].stage;

  const steps = STEPS.map((s, i) => ({
    id: s.id,
    label: s.label,
    note: s.blocked,
    atSeconds: i < shown ? s.at : null,
    status:
      i < shown
        ? s.blocked
          ? ("blocked" as const)
          : ("done" as const)
        : i === shown && inView
          ? ("active" as const)
          : ("pending" as const),
  }));

  const replay = () => {
    setDone(0);
    setRound((r) => r + 1);
  };

  return (
    <div
      ref={ref}
      className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface-1"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-6">
        <span className="flex min-w-0 items-center gap-2.5 text-[15px] font-medium text-text-1">
          <span className="hidden sm:contents"><ToolMark name="Cursor" /></span>
          <span className="truncate">Cursor</span>
          <span className="text-text-3">vs</span>
          <span className="hidden sm:contents"><ToolMark name="Windsurf" /></span>
          <span className="truncate">Windsurf</span>
        </span>
        <Tag kind="sample">Sample run</Tag>
      </header>

      {/* Where the run is: five stages, lime when finished, lavender while working. */}
      <div className="grid grid-cols-5 gap-1.5 px-6 pb-4" aria-hidden="true">
        {STAGES.map((name, i) => (
          <div key={name} className="flex min-w-0 flex-col gap-2">
            <span
              className={cn(
                "h-1 rounded-[1px] transition-colors duration-300",
                i < stage ? "bg-lime" : i === stage && inView ? "bg-lavender" : "bg-surface-3",
              )}
            />
            <span
              className={cn(
                "truncate text-[12px] transition-colors duration-300",
                i === stage && inView ? "text-text-1" : "text-text-3",
              )}
            >
              {name}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <StepList steps={steps} />
      </div>

      <div className="relative h-[124px] border-t border-line sm:h-[104px]">
        <AnimatePresence initial={false} mode="wait">
          {finished ? (
            <motion.div
              key="verdict"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 grid grid-cols-1 content-center gap-3 px-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8"
            >
              <div className="flex min-w-0 items-center justify-between gap-4 sm:block">
                <p className="display text-[22px] leading-7 font-medium text-text-1">
                  Keep Cursor
                </p>
                <button
                  type="button"
                  onClick={replay}
                  className="flex h-8 items-center gap-1.5 rounded-md text-[13px] text-text-3 transition-colors hover:text-text-1 sm:mt-1"
                >
                  <ArrowCounterClockwise size={13} /> Replay
                </button>
              </div>
              <dl className="grid grid-cols-[auto_8rem_auto] items-center gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-text-2">Cursor</dt>
                <dd className="flex h-3.5">
                  <PassBar passed={3} attempts={3} best />
                </dd>
                <dd className="tnum text-right text-text-1">3 of 3</dd>
                <dt className="text-text-2">Windsurf</dt>
                <dd className="flex h-3.5">
                  <PassBar passed={2} attempts={3} best={false} />
                </dd>
                <dd className="tnum text-right text-text-1">2 of 3</dd>
              </dl>
            </motion.div>
          ) : (
            <motion.dl
              key="limits"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 grid grid-cols-3 content-center gap-4 px-6 sm:gap-6"
            >
              <Limit label="Time" value={`${last?.at ?? 0}s`} of={`${CAP.seconds}s`} pct={((last?.at ?? 0) / CAP.seconds) * 100} />
              <Limit label="Actions" value={`${last?.actions ?? 0}`} of={`${CAP.actions}`} pct={((last?.actions ?? 0) / CAP.actions) * 100} />
              <Limit
                label="Spend"
                value={`$${((last?.spendCents ?? 0) / 100).toFixed(2)}`}
                of={`$${(CAP.cents / 100).toFixed(2)}`}
                pct={((last?.spendCents ?? 0) / CAP.cents) * 100}
              />
            </motion.dl>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Limit({ label, value, of, pct }: { label: string; value: string; of: string; pct: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <dt className="flex items-baseline justify-between gap-2 text-[13px] text-text-3">
        <span className="truncate">{label}</span>
        <span className="tnum truncate">
          <span className="text-text-1">{value}</span>
          <span className="hidden sm:inline"> of {of}</span>
        </span>
      </dt>
      <dd>
        <Meter value={pct} label={`${label} used`} />
      </dd>
    </div>
  );
}
