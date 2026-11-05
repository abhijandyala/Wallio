"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RunStep } from "@/lib/types";
import {
  STEP_TIMES,
  buildAttempts,
  buildResult,
  buildSteps,
  compareSetupSample as data,
  runResultSample,
} from "@/mocks/compare";
import { PageHeader } from "@/components/kit/page-header";
import { Button } from "@/components/ui/button";
import { CompareSetup, defaultChoice, type SetupChoice } from "./compare-setup";
import { RunLive, attemptStates } from "./run-live";
import { RunResults } from "./run-results";

type Phase = "setup" | "running" | "cancelled" | "done";

const TICK_MS = 160; // one simulated second
const LAST = STEP_TIMES[STEP_TIMES.length - 1];
const HOLD = 2; // simulated seconds to show "Sandbox destroyed" before the result

/** Reads ?workflow=…&tools=A,B (from Discover) into a starting matchup. */
function choiceFromParams(params: URLSearchParams): SetupChoice {
  const workflowId = data.workflows.some((w) => w.id === params.get("workflow"))
    ? params.get("workflow")!
    : (data.workflows[0]?.id ?? "");
  const base = defaultChoice(data, workflowId);
  const wanted = (params.get("tools") ?? "")
    .split(",")
    .filter((n) =>
      data.tools.some((t) => t.name === n && t.workflowIds.includes(workflowId)),
    )
    .slice(0, 2);
  return wanted.length === 2 ? { ...base, tools: wanted } : base;
}

/**
 * Setup -> live run -> results. Until the backend lands, the run is simulated from sample data.
 * TODO(api): POST /api/comparisons, then subscribe to GET /api/runs/{id}/events.
 */
export function CompareFlow() {
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const [rawPhase, setPhase] = useState<Phase>(
    params.get("view") === "results" ? "done" : "setup",
  );
  const [fromSample, setFromSample] = useState(params.get("view") === "results");
  const [choice, setChoice] = useState<SetupChoice>(() => choiceFromParams(params));
  const [elapsed, setElapsed] = useState(0);

  // A running simulation that reached its end is done. Derived, not stored.
  const phase: Phase =
    rawPhase === "running" && elapsed >= LAST + HOLD ? "done" : rawPhase;

  const [a, b] = choice.tools as [string, string];
  const workflow = data.workflows.find((w) => w.id === choice.workflowId)?.name ?? "";
  const task = data.tasks.find((t) => t.id === choice.taskId)?.title ?? "";

  const steps: RunStep[] = useMemo(
    () =>
      buildSteps(a ?? "", b ?? "").map((s, i) => {
        const doneAt = STEP_TIMES[i];
        const startAt = i === 0 ? 0 : STEP_TIMES[i - 1];
        if (elapsed >= doneAt)
          return { ...s, status: s.note ? "blocked" : "done", atSeconds: doneAt };
        if (elapsed >= startAt && rawPhase === "running")
          return { ...s, status: "active", atSeconds: null };
        return { ...s, status: "pending", atSeconds: null };
      }),
    [a, b, elapsed, rawPhase],
  );
  const attempts = useMemo(
    () => attemptStates(buildAttempts(a ?? "", b ?? ""), steps, STEP_TIMES, elapsed),
    [a, b, steps, elapsed],
  );

  const result = useMemo(() => {
    if (fromSample) return runResultSample;
    const tool = (n: string) => data.tools.find((t) => t.name === n)!;
    return buildResult({ a: tool(a), b: tool(b), workflow, task });
  }, [fromSample, a, b, workflow, task]);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed((e) => e + 1), TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  const start = () => {
    setElapsed(0);
    setFromSample(false);
    setPhase("running");
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  const restart = () => {
    setPhase("setup");
    window.scrollTo({ top: 0 });
  };

  const [ra, rb] = result.candidates;
  const header =
    phase === "setup"
      ? { title: "Compare", subtitle: "Run one real task on two tools, in a sandbox." }
      : phase === "done"
        ? {
            title: `${ra.toolName} vs ${rb.toolName}`,
            subtitle: `${result.workflow} · ${result.task}`,
          }
        : {
            title: `${a} vs ${b}`,
            subtitle:
              phase === "cancelled"
                ? `Stopped by you at ${elapsed}s. Nothing else ran.`
                : `${workflow} · ${task}`,
          };

  const actions =
    phase === "running" ? (
      <Button variant="secondary" onClick={() => setPhase("cancelled")}>
        Stop run
      </Button>
    ) : phase === "cancelled" ? (
      <Button variant="secondary" onClick={restart}>
        Start over
      </Button>
    ) : phase === "done" ? (
      <Button variant="secondary" onClick={restart}>
        New comparison
      </Button>
    ) : null;

  // Running and cancelled share one scene so stopping doesn't re-fade the page.
  const scene = phase === "cancelled" ? "running" : phase;

  return (
    <div className="flex flex-col gap-section">
      <PageHeader title={header.title} subtitle={header.subtitle} actions={actions} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={scene}
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: reduce ? 0 : 0.36, ease: [0.16, 1, 0.3, 1] },
          }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.14 } }}
        >
          {scene === "setup" && (
            <CompareSetup data={data} choice={choice} onChange={setChoice} onStart={start} />
          )}
          {scene === "running" && (
            <RunLive
              steps={steps}
              attempts={attempts}
              tools={[a, b]}
              elapsed={elapsed}
              stopped={phase === "cancelled"}
            />
          )}
          {scene === "done" && <RunResults result={result} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
