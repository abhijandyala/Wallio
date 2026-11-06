"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { LockSimple, Prohibit } from "@phosphor-icons/react";
import type { RunStep } from "@/lib/types";
import { StepList } from "@/components/kit/step-list";
import { Meter } from "@/components/kit/meter";
import { Button } from "@/components/ui/button";
import { hatch } from "@/components/kit/charts";
import { cn } from "@/lib/utils";

const STEP_MS = 520;

/**
 * Re-research one workflow in the sandboxed browser: read each shortlisted tool's pages again,
 * re-check requirements, re-score, then destroy the sandbox. Simulated until the API lands.
 * TODO(api): POST /api/research {workflowId}, then stream GET /api/runs/{id}/events.
 */
export function ResearchRun({
  workflowName,
  hosts,
  onDone,
  onStop,
}: {
  workflowName: string;
  /** Pages to read, in order. A `blocked` page is skipped, never bypassed. */
  hosts: { host: string; blocked?: boolean }[];
  onDone: () => void;
  onStop: () => void;
}) {
  const reduce = useReducedMotionConfig();
  const plan = useMemo<RunStep[]>(
    () => [
      { id: "p", label: "Planning on Vultr Serverless Inference", status: "pending", atSeconds: null, host: "Vultr Serverless Inference" },
      ...hosts.map((h, i) => ({
        id: `r${i}`,
        label: `Reading ${h.host}`,
        status: "pending" as const,
        atSeconds: null,
        host: h.host,
        note: h.blocked ? "Login wall. Skipped, not bypassed." : undefined,
      })),
      { id: "q", label: "Checking your requirements", status: "pending", atSeconds: null, host: "Wallio policy" },
      { id: "s", label: "Scoring and ranking", status: "pending", atSeconds: null, host: "Wallio scoring" },
      { id: "c", label: "Destroying the sandbox", status: "pending", atSeconds: null, host: "sandbox" },
    ],
    [hosts],
  );
  const [done, setDone] = useState(0);
  // Keep the latest callback without restarting the step timer when the parent re-renders.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (done >= plan.length) {
      const t = setTimeout(() => onDoneRef.current(), reduce ? 0 : 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), reduce ? 0 : STEP_MS);
    return () => clearTimeout(t);
  }, [done, plan.length, reduce]);

  const steps: RunStep[] = plan.map((s, i) =>
    i < done
      ? { ...s, status: s.note ? "blocked" : "done", atSeconds: i + 1 }
      : i === done
        ? { ...s, status: "active" }
        : s,
  );
  const current = steps[Math.min(done, steps.length - 1)];
  const finished = done >= plan.length;
  const reading = current.id.startsWith("r");
  const blocked = reading && !!current.note && current.status !== "pending";

  return (
    <section className="flex flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 items-center gap-3 px-6">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-1">
          Researching {workflowName}
        </h2>
        <span className="flex shrink-0 items-center gap-2 text-[13px] text-text-3">
          <span className={cn("size-1.5 rounded-[1px]", finished ? "bg-text-disabled" : "animate-pulse bg-aurora")} />
          {finished ? "Sandbox destroyed" : "Live"}
        </span>
        {!finished && (
          <Button variant="secondary" size="sm" onClick={onStop}>
            Stop
          </Button>
        )}
      </header>

      <div className="grid border-t border-line md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="border-line md:border-r">
          <StepList steps={steps} />
        </div>

        <div className="flex flex-col gap-4 border-t border-line p-4 sm:p-6 md:border-t-0">
          <div className="overflow-hidden rounded-[12px] border border-line bg-bg">
            <div className="flex h-9 items-center gap-2 border-b border-line px-3">
              <LockSimple size={12} className="shrink-0 text-text-3" />
              <span className="truncate font-mono text-[12px] text-text-2">
                {finished ? "closed" : current.host}
              </span>
            </div>
            <div className="relative aspect-[16/10]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={finished ? "end" : current.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.15 }}
                  className="absolute inset-0 p-5"
                >
                  {reading ? (
                    <div className={cn("flex h-full flex-col gap-3", blocked && "opacity-25")}>
                      <span className="h-3 w-1/3 rounded-[3px] bg-white/10" />
                      <span className="h-2.5 w-1/2 rounded-[3px] bg-white/[0.06]" />
                      <div className="mt-1 grid flex-1 grid-cols-3 gap-2">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className={cn("rounded-[6px] border", i === 1 ? "border-aurora/40" : "border-line")}
                            style={{ backgroundImage: hatch("rgba(255,255,255,0.04)", 6) }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center text-center text-[13px] text-text-3">
                      {finished ? "Nothing left running." : current.label}
                    </div>
                  )}
                  {blocked && (
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface-3 px-4 py-2 text-[13px] text-text-1">
                        <Prohibit size={14} className="text-aurora" />
                        Login wall. Skipped, not bypassed.
                      </span>
                    </span>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-text-3">Actions</span>
              <span className="tnum text-text-1">{Math.min(done * 2, 20)} of 20</span>
            </div>
            <Meter value={(Math.min(done * 2, 20) / 20) * 100} label="Actions used" />
          </div>
        </div>
      </div>
    </section>
  );
}
