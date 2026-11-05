"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LockSimple, Prohibit, X } from "@phosphor-icons/react";
import type { AttemptResult, RunStep } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { StepList } from "@/components/kit/step-list";
import { ToolMark } from "@/components/kit/tool-mark";
import { Meter } from "@/components/kit/meter";
import { PassBar, hatch } from "@/components/kit/charts";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const MAX_ACTIONS = 20;
const MAX_SECONDS = 180;
// Browser actions each step takes, all checked by policy. Front-end simulation only.
const ACTIONS: Record<string, number> = { s1: 1, s2: 3, s3: 3, s4: 1, s5: 4, s6: 4, s7: 1 };

type AttemptState = AttemptResult & { state: "waiting" | "running" | "done" };

/** Which attempts are waiting, running or done at this second of the simulated run. */
export function attemptStates(
  attempts: AttemptResult[],
  steps: RunStep[],
  times: number[],
  elapsed: number,
): AttemptState[] {
  return attempts.map((a) => {
    const i = steps.findIndex((s) => s.kind === "test" && s.toolName === a.toolName);
    const start = i > 0 ? times[i - 1] : 0;
    const each = (times[i] - start) / 3;
    const from = start + each * (a.attempt - 1);
    const to = from + each;
    const state = elapsed >= to ? "done" : elapsed >= from ? "running" : "waiting";
    return { ...a, state };
  });
}

/** The live run: steps on the left, the sandbox on the right, the race and limits under it. */
export function RunLive({
  steps,
  attempts,
  tools,
  elapsed,
  stopped,
}: {
  steps: RunStep[];
  attempts: AttemptState[];
  tools: [string, string];
  elapsed: number;
  stopped: boolean;
}) {
  const active =
    steps.find((s) => s.status === "active") ??
    [...steps].reverse().find((s) => s.status !== "pending");
  const finished = steps.filter((s) => s.status === "done" || s.status === "blocked");
  const stoppedActions = finished.filter((s) => s.status === "blocked").length;
  const allowed =
    finished
      .filter((s) => s.status === "done")
      .reduce((n, s) => n + (ACTIONS[s.id] ?? 0), 0) +
    (active?.status === "active" && ACTIONS[active.id] ? 1 : 0);

  return (
    <div className="grid grid-cols-12 gap-gutter xl:grid-rows-[auto_1fr]">
      {/* The sandbox first in the DOM: on phones it is the thing to watch. */}
      <div className="col-span-12 xl:col-span-8 xl:col-start-5 xl:row-start-1">
        <Sandbox step={active} attempts={attempts} tools={tools} stopped={stopped} />
      </div>

      <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:self-start">
        <Panel
          title="Steps"
          titleAddon={
            <span className="tnum text-[13px] font-normal text-text-3">{elapsed}s</span>
          }
          flush
        >
          <div className="border-t border-line">
            <StepList steps={steps} />
          </div>
        </Panel>
      </div>

      <div className="col-span-12 grid grid-cols-1 gap-gutter md:grid-cols-2 xl:col-span-8 xl:col-start-5 xl:row-start-2 xl:self-start">
        <Panel title="Test runs" flush>
          <ul className="border-t border-line">
            {tools.map((t) => {
              const mine = attempts.filter((a) => a.toolName === t);
              const passed = mine.filter((a) => a.state === "done" && a.passed).length;
              const done = mine.filter((a) => a.state === "done").length;
              return (
                <li
                  key={t}
                  className="flex h-16 items-center gap-3 border-t border-line px-6 first:border-t-0"
                >
                  <ToolMark name={t} />
                  <span className="w-24 shrink-0 truncate text-text-1">{t}</span>
                  <PassBar passed={passed} attempts={3} best={false} />
                  <span className="tnum w-14 shrink-0 text-right text-[13px] text-text-3">
                    {done === 0 ? "—" : `${passed} of ${done}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Limits" flush>
          <div className="flex flex-col gap-4 border-t border-line px-6 py-5">
            <LimitRow
              label="Actions"
              value={`${allowed + stoppedActions} of ${MAX_ACTIONS}`}
              pct={((allowed + stoppedActions) / MAX_ACTIONS) * 100}
            />
            <LimitRow
              label="Time"
              value={`${elapsed}s of ${MAX_SECONDS}s`}
              pct={(elapsed / MAX_SECONDS) * 100}
            />
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-3">Policy checks</span>
              <span className="tnum text-text-1">
                {allowed} allowed
                <span className="text-text-3"> · </span>
                <span className={stoppedActions ? "text-lavender" : "text-text-3"}>
                  {stoppedActions} stopped
                </span>
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LimitRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-text-3">{label}</span>
        <span className="tnum text-text-1">{value}</span>
      </div>
      <Meter value={pct} label={label} />
    </div>
  );
}

/* ── The sandbox viewport ─────────────────────────────────────────────── */

function Sandbox({
  step,
  attempts,
  tools,
  stopped,
}: {
  step: RunStep | undefined;
  attempts: AttemptState[];
  tools: [string, string];
  stopped: boolean;
}) {
  const reduce = useReducedMotion();
  const kind = stopped ? "stopped" : (step?.kind ?? "plan");
  const blocked = step?.status === "blocked" || (step?.note && step.status === "active");
  const cleaned = kind === "cleanup" && step?.status === "done";
  const live = !stopped && !cleaned;
  // One key per scene, so the viewport fades between scenes, not between ticks.
  const scene =
    kind === "research" ? `research-${step?.id}` : kind === "verify" || kind === "report" ? "test" : kind;

  return (
    <section className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 items-center gap-3 px-6">
        <h2 className="text-[15px] font-medium text-text-1">Sandbox</h2>
        <span className="flex items-center gap-2 text-[13px] text-text-3">
          <span
            className={cn(
              "size-1.5 rounded-[1px]",
              live ? "animate-pulse bg-lavender" : "bg-text-disabled",
            )}
          />
          {stopped ? "Stopped" : cleaned ? "Destroyed" : "Live"}
        </span>
      </header>

      <div className="mx-4 mb-4 overflow-hidden rounded-[12px] border border-line bg-bg">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3">
          <LockSimple size={12} className="shrink-0 text-text-3" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-2">
            {stopped || cleaned ? "closed" : (step?.host ?? "starting")}
          </span>
          <span className="hidden shrink-0 text-[12px] text-text-3 sm:inline">
            No keys · allow-listed sites
          </span>
        </div>

        <div className="relative min-h-[280px] sm:aspect-[16/9] sm:min-h-[240px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={scene}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
              className="absolute inset-0"
            >
              {kind === "plan" && <PlanScene />}
              {kind === "research" && <PageScene blocked={!!blocked} />}
              {(kind === "test" || kind === "verify" || kind === "report") && (
                <TestScene attempts={attempts} tools={tools} />
              )}
              {kind === "cleanup" && (
                <EndScene title="Sandbox destroyed" line="Nothing is left running." />
              )}
              {kind === "stopped" && (
                <EndScene
                  title="Stopped by you"
                  line="The browser closed and the sandbox was destroyed."
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* What the agent is doing right now, pinned to the viewport. */}
          {step && !stopped && (
            <span className="absolute bottom-3 left-3 hidden max-w-[calc(100%-1.5rem)] truncate sm:block rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-text-2">
              {step.label}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function PlanScene() {
  const lines = [
    "Read both tools' pricing pages",
    "Run the task 3 times in each",
    "Check every run against the test",
    "Write the report",
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-8 sm:px-12">
      <p className="text-[13px] text-text-3">Plan from Vultr Serverless Inference</p>
      <ol className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <motion.li
            key={l}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.25 }}
            className="flex items-center gap-3 text-[15px] text-text-1"
          >
            <span className="tnum grid size-6 place-items-center rounded-[6px] bg-surface-3 text-[12px] text-text-2">
              {i + 1}
            </span>
            {l}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** A wireframe of the page being read. The real runner sends a screenshot here. */
function PageScene({ blocked }: { blocked: boolean }) {
  return (
    <div className="relative h-full p-6 sm:p-8">
      <div className={cn("flex h-full flex-col gap-4 transition-opacity", blocked && "opacity-25")}>
        <div className="flex items-center justify-between">
          <span className="h-3 w-20 rounded-[3px] bg-white/10" />
          <span className="flex gap-2">
            <span className="h-3 w-10 rounded-[3px] bg-white/[0.06]" />
            <span className="h-3 w-10 rounded-[3px] bg-white/[0.06]" />
            <span className="h-3 w-14 rounded-[3px] bg-white/10" />
          </span>
        </div>
        <span className="mt-2 h-5 w-2/5 rounded-[4px] bg-white/10" />
        <span className="h-3 w-1/3 rounded-[3px] bg-white/[0.06]" />
        <div className="mt-2 grid flex-1 grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-2 rounded-[8px] border p-3",
                i === 1 ? "border-lavender/40" : "border-line",
              )}
            >
              <span className="h-2.5 w-1/2 rounded-[3px] bg-white/10" />
              <span className="h-4 w-2/3 rounded-[3px] bg-white/10" />
              <span
                className="mt-1 flex-1 rounded-[4px]"
                style={{ backgroundImage: hatch("rgba(255,255,255,0.05)", 6) }}
              />
            </div>
          ))}
        </div>
      </div>
      {blocked && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="flex items-center gap-3 rounded-[12px] border border-line-strong bg-surface-3 px-5 py-3 text-[14px] text-text-1">
            <Prohibit size={16} className="text-lavender" />
            Login wall. Skipped, not bypassed.
          </span>
        </div>
      )}
    </div>
  );
}

function TestScene({
  attempts,
  tools,
}: {
  attempts: AttemptState[];
  tools: [string, string];
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-5 px-5 sm:px-10">
      {tools.map((t) => (
        <div key={t} className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-[13px] text-text-2">
            <ToolMark name={t} />
            {t}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {attempts
              .filter((a) => a.toolName === t)
              .map((a) => (
                <AttemptTile key={a.attempt} a={a} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttemptTile({ a }: { a: AttemptState }) {
  const failed = a.state === "done" && !a.passed;
  const passed = a.state === "done" && a.passed;
  return (
    <div
      className={cn(
        "flex h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-[10px] border px-3 transition-colors duration-300 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4",
        a.state === "running" && "border-lavender/60",
        passed && "border-lime/30 bg-lime-tint",
        failed && "border-line-strong bg-surface-2",
        a.state === "waiting" && "border-line",
      )}
    >
      <span className="text-[12px] text-text-3 sm:text-[13px]">Run {a.attempt}</span>
      <span
        className={cn(
          "tnum flex items-center gap-1.5 text-[12px] sm:text-[13px]",
          passed ? "text-lime" : failed ? "text-text-2" : "text-text-3",
        )}
      >
        {a.state === "waiting" && "Waiting"}
        {a.state === "running" && (
          <>
            <span className="size-1.5 animate-pulse rounded-[1px] bg-lavender" />
            <span className="hidden sm:inline">Running</span>
          </>
        )}
        {passed && (
          <>
            <Check size={12} weight="bold" />
            {a.seconds}s
          </>
        )}
        {failed && (
          <>
            <X size={12} weight="bold" />
            <span className="hidden sm:inline">Timed out</span>
          </>
        )}
      </span>
    </div>
  );
}

function EndScene({ title, line }: { title: string; line: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-10 place-items-center rounded-[10px] bg-lime-tint text-lime">
        <Check size={18} weight="bold" />
      </span>
      <p className="text-[17px] font-medium text-text-1">{title}</p>
      <p className="text-[13px] text-text-3">{line}</p>
    </div>
  );
}
