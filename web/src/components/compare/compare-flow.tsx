"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import type { ApprovalIntent, RunOutcome, RunStep } from "@/lib/types";
import {
  APPROVAL_STEP,
  CONTAINMENT_TIMES,
  STEP_TIMES,
  buildAttempts,
  buildContainmentSteps,
  buildResult,
  buildSteps,
  compareSetupSample as data,
  resultForRun,
} from "@/mocks/compare";
import { PageHeader } from "@/components/kit/page-header";
import { Button } from "@/components/ui/button";
import { CompareSetup, defaultChoice, type SetupChoice } from "./compare-setup";
import { RunLive, attemptStates } from "./run-live";
import { RunResults } from "./run-results";
import { useSettings } from "@/lib/settings";

type Phase = "setup" | "running" | "cancelled" | "done" | "containment";
/** Front-end only: lets a demo or review show the run's other outcomes (?simulate=…). */
type Sim = "none" | "partial" | "failed" | "timed_out" | "reconnecting" | "cleanup_failed";

const TICK_MS = 160; // one simulated second
const LAST = STEP_TIMES[STEP_TIMES.length - 1];
const HOLD = 2; // simulated seconds to show "Sandbox destroyed" before the result
const PAUSE_AT = STEP_TIMES[APPROVAL_STEP - 1]; // the clock stops here until the user decides
const RECONNECT = { at: 14, ticks: 16 };
const FAIL_AT = 15;
const TIMEOUT_AT = 30;
const C_LAST = CONTAINMENT_TIMES[CONTAINMENT_TIMES.length - 1];

const slug = (t: string) => t.toLowerCase().replace(/\s+/g, "-");

/** Reads ?workflow=…&tools=A,B (from Discover) into a starting matchup. */
function choiceFromParams(params: URLSearchParams): SetupChoice {
  const workflowId = data.workflows.some((w) => w.id === params.get("workflow"))
    ? params.get("workflow")!
    : (data.workflows[0]?.id ?? "");
  const base = defaultChoice(data, workflowId);
  const wanted = (params.get("tools") ?? "")
    .split(",")
    .filter((n) => data.tools.some((t) => t.name === n && t.workflowIds.includes(workflowId)))
    .slice(0, 2);
  return wanted.length === 2 ? { ...base, tools: wanted } : base;
}

/** Marks steps done, active or waiting from the simulated clock. */
function advance(steps: RunStep[], times: number[], elapsed: number, running: boolean): RunStep[] {
  return steps.map((s, i) => {
    const doneAt = times[i];
    const startAt = i === 0 ? 0 : times[i - 1];
    if (elapsed >= doneAt) return { ...s, status: s.note ? "blocked" : "done", atSeconds: doneAt };
    if (elapsed >= startAt && running) return { ...s, status: "active", atSeconds: null };
    return { ...s, status: "pending", atSeconds: null };
  });
}

/**
 * Setup -> live run (with an approval pause) -> results, plus the containment test.
 * Until the backend lands, runs are simulated from sample data.
 * TODO(api): POST /api/comparisons, then subscribe to GET /api/runs/{id}/events.
 */
export function CompareFlow() {
  // Re-mount when the query changes (e.g. opening a report from Recent), so state starts fresh.
  const params = useSearchParams();
  return <Flow key={params.toString()} params={params} />;
}

function Flow({ params }: { params: URLSearchParams }) {
  const reduce = useReducedMotionConfig();
  const settings = useSettings();
  // ?simulate= wins; otherwise Settings -> Demo -> "Next comparison ends as".
  const sim = (params.get("simulate") ?? settings.simulate) as Sim;
  const [rawPhase, setPhase] = useState<Phase>(params.get("view") === "results" ? "done" : "setup");
  const [savedRun, setSavedRun] = useState<string | null>(
    params.get("view") === "results" ? (params.get("run") ?? "r_cursor_ws") : null,
  );
  const [choice, setChoice] = useState<SetupChoice>(() => choiceFromParams(params));
  // null = use the default from Settings -> Agent and runs.
  const [capPick, setCapCents] = useState<number | null>(null);
  const capCents = capPick ?? settings.runCapCents;
  const [wall, setWall] = useState(0);
  const [approval, setApproval] = useState<"pending" | "approved" | "declined">("pending");

  // The simulated clock. A dropped connection freezes it for a moment, then it resumes.
  const reconnecting =
    sim === "reconnecting" && wall >= RECONNECT.at && wall < RECONNECT.at + RECONNECT.ticks;
  const elapsed =
    sim === "reconnecting" && wall >= RECONNECT.at
      ? Math.max(RECONNECT.at, wall - RECONNECT.ticks)
      : wall;

  const awaiting = rawPhase === "running" && elapsed >= PAUSE_AT && approval === "pending";
  const failedEarly =
    (sim === "failed" && elapsed >= FAIL_AT) || (sim === "timed_out" && elapsed >= TIMEOUT_AT);
  // A running simulation that reached its end is done. Derived, not stored.
  const phase: Phase =
    rawPhase === "running" && (elapsed >= LAST + HOLD || failedEarly) ? "done" : rawPhase;
  const containmentDone = rawPhase === "containment" && wall >= C_LAST + HOLD;

  const [a, b] = choice.tools as [string, string];
  const workflow = data.workflows.find((w) => w.id === choice.workflowId)?.name ?? "";
  const task = data.tasks.find((t) => t.id === choice.taskId)?.title ?? "";

  const steps: RunStep[] = useMemo(() => {
    const list = advance(buildSteps(a ?? "", b ?? ""), STEP_TIMES, elapsed, rawPhase === "running");
    // The approval step reflects the user's choice once they make it.
    return list.map((s) =>
      s.approval && approval !== "pending" && s.status !== "pending"
        ? approval === "approved"
          ? { ...s, label: "Approved. Submitted once.", status: "done" }
          : { ...s, label: "You declined the trial request", status: "blocked", note: "Nothing was sent." }
        : s,
    );
  }, [a, b, elapsed, rawPhase, approval]);
  const attempts = useMemo(
    () => attemptStates(buildAttempts(a ?? "", b ?? ""), steps, STEP_TIMES, elapsed),
    [a, b, steps, elapsed],
  );
  const cSteps = useMemo(
    () => advance(buildContainmentSteps(), CONTAINMENT_TIMES, wall, rawPhase === "containment"),
    [wall, rawPhase],
  );

  const outcome: RunOutcome =
    sim === "failed" ? "failed" : sim === "timed_out" ? "timed_out" : sim === "partial" ? "partial" : "succeeded";
  const result = useMemo(() => {
    if (savedRun) return resultForRun(savedRun);
    const tool = (n: string) => data.tools.find((t) => t.name === n)!;
    return buildResult({
      a: tool(a),
      b: tool(b),
      workflow,
      task,
      taskId: choice.taskId,
      outcome,
      cleanupFailed: sim === "cleanup_failed",
      capCents,
    });
  }, [savedRun, a, b, workflow, task, choice.taskId, outcome, sim, capCents]);

  const intent: ApprovalIntent = {
    id: "apr_run",
    title: `Request a ${b} trial`,
    destination: `trial.wallio.test/${slug(b ?? "")}`,
    fields: [
      { label: "Name", value: "Sample User" },
      { label: "Email", value: "sample@wallio.test" },
      { label: "Plan", value: "Pro trial, 14 days" },
    ],
    consequence: "Submits one form. No payment, no account.",
    expiresAt: "2026-11-05T16:00:00",
    screenshotLabel: "Filled form, ready to submit",
  };

  const ticking =
    (phase === "running" && !awaiting) || (rawPhase === "containment" && !containmentDone);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setWall((w) => w + 1), TICK_MS);
    return () => clearInterval(id);
  }, [ticking]);

  const begin = (next: Phase) => {
    setWall(0);
    setApproval("pending");
    setSavedRun(null);
    setPhase(next);
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  const runAgain = () => {
    if (savedRun) {
      const [x, y] = result.candidates.map((c) => c.toolName);
      const wf = data.workflows.find((w) => w.name === result.workflow)?.id ?? choice.workflowId;
      const tk = data.tasks.find((t) => t.title === result.task)?.id ?? defaultChoice(data, wf).taskId;
      setChoice({ workflowId: wf, taskId: tk, tools: [x, y] });
    }
    begin("running");
  };
  const restart = () => {
    setSavedRun(null);
    setPhase("setup");
    window.scrollTo({ top: 0 });
  };

  const [ra, rb] = result.candidates;
  const spendNow = Math.round(13 * Math.min(1, elapsed / LAST));
  const header =
    phase === "setup"
      ? { title: "Compare", subtitle: "Run one real task on two tools, in a sandbox." }
      : phase === "containment"
        ? {
            title: "Containment test",
            subtitle: containmentDone
              ? "Contained. Nothing left the sandbox. A controlled test, not proof of invulnerability."
              : "Our own hostile page tries to make the agent leak data.",
          }
        : phase === "done"
          ? { title: `${ra.toolName} vs ${rb.toolName}`, subtitle: `${result.workflow} · ${result.task}` }
          : {
              title: `${a} vs ${b}`,
              subtitle:
                phase === "cancelled"
                  ? `Stopped by you at ${elapsed}s. Nothing else ran.`
                  : awaiting
                    ? "Paused. The agent is waiting for your approval."
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
      <>
        <Button variant="secondary" onClick={runAgain}>
          Run again
        </Button>
        <Button variant="ghost" onClick={restart}>
          New comparison
        </Button>
      </>
    ) : phase === "containment" ? (
      containmentDone ? (
        <>
          <Button variant="secondary" onClick={() => begin("containment")}>
            Run again
          </Button>
          <Button variant="ghost" onClick={restart}>
            Back to Compare
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={restart}>
          Stop
        </Button>
      )
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
            <CompareSetup
              data={data}
              choice={choice}
              onChange={setChoice}
              capCents={capCents}
              onCap={setCapCents}
              onStart={() => begin("running")}
              onContainment={() => begin("containment")}
            />
          )}
          {scene === "running" && (
            <RunLive
              steps={steps}
              attempts={attempts}
              tools={[a, b]}
              elapsed={elapsed}
              stopped={phase === "cancelled"}
              spend={{ actualCents: spendNow, capCents }}
              approval={awaiting ? { intent, onResolved: setApproval } : null}
              reconnecting={
                reconnecting
                  ? { lastActivity: `${steps.find((s) => s.status === "active")?.label ?? "Running"}, ${wall - RECONNECT.at}s ago` }
                  : null
              }
            />
          )}
          {scene === "containment" && (
            <RunLive
              mode="containment"
              steps={cSteps}
              attempts={[]}
              tools={["", ""]}
              elapsed={Math.min(wall, C_LAST)}
              stopped={false}
              spend={{ actualCents: Math.round(4 * Math.min(1, wall / C_LAST)), capCents: 25 }}
              approval={null}
              reconnecting={null}
            />
          )}
          {scene === "done" && <RunResults result={result} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
