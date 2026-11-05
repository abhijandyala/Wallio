"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import recorded from "@/mocks/recorded-runs.json";
import type { ApprovalIntent, Evidence as ApiEvidence, Recommendation, Run, RunEvent } from "@/lib/api/contract";
import { api, ApiFailure, useApiStatus } from "@/lib/api/client";
import { isTerminal, liveSource, recordedSource } from "@/lib/api/run-source";
import type { Evidence as UiEvidence } from "@/lib/types";
import { PageHeader } from "@/components/kit/page-header";
import { Segmented } from "@/components/kit/segmented";
import { ToolMark } from "@/components/kit/tool-mark";
import { Button } from "@/components/ui/button";
import { EvidenceDrawer } from "@/components/discover/evidence-drawer";
import {
  AllowlistCard,
  ApprovalCard,
  SuccessChecks,
  type Check,
  Card,
  ContainmentCard,
  RecommendationCard,
  RunCard,
  VultrPanel,
  toUiEvidence,
  toolName,
  type Kind,
  type Replay,
  type Source,
} from "./live-panels";
import { cn } from "@/lib/utils";

/**
 * Compare against the real Wallio API (Anish's service on Vultr): the golden path
 * (GitHub Copilot vs Zed on a debugging task), the containment test, and the
 * approval gate with its replay check. If the API can't be reached, the same screens
 * play a run that was recorded from the API, and say so.
 */

interface Recording {
  recordedAt: string;
  runMode: string;
  tools: Record<string, string>;
  comparison: { run: Run; events: RunEvent[]; recommendation: Recommendation };
  trial: {
    run: Run;
    events: RunEvent[];
    intent: ApprovalIntent;
    evidence: ApiEvidence;
    decision: ApprovalIntent;
    replay: { status: number; error: { message: string; correlationId?: string } };
    screenshot: string;
  };
  containment: { run: Run; events: RunEvent[] };
}
const REC = recorded as unknown as Recording;

const GOLDEN = {
  incumbent: "tool_copilot",
  candidate: "tool_zed",
  workflowId: "wf_debugging",
  workflow: "Debugging a small web app",
  taskId: "task_js_offbyone_v1",
  task: "Fix an off-by-one bug",
  capMinor: 50,
};
const PINNED_MODEL = "qwen3.8-flash-next";
const NAMES = REC.tools;

interface Job {
  source: Source;
  events: RunEvent[];
  run: Run | null;
  error: string | null;
}

const fresh = (source: Source): Job => ({ source, events: [], run: null, error: null });
const message = (e: unknown) => (e instanceof ApiFailure ? e.error.message : "The Wallio API can't be reached right now.");

export function LiveCompare({ focus }: { focus: "comparison" | "containment" }) {
  const status = useApiStatus();
  const [pick, setPick] = useState<Source | null>(null);
  const source: Source = pick ?? (status.state === "offline" ? "recorded" : "live");
  const liveDemo = status.state === "online" && status.runMode === "mock";

  const [jobs, setJobs] = useState<Partial<Record<Kind, Job>>>({});
  const [order, setOrder] = useState<Kind[]>([]);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [intent, setIntent] = useState<ApprovalIntent | null>(null);
  const [decided, setDecided] = useState<"approved" | "declined" | null>(null);
  const [replay, setReplay] = useState<Replay>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<UiEvidence | null>(null);
  const [trialEvidence, setTrialEvidence] = useState<ApiEvidence | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);

  const stops = useRef<Partial<Record<Kind, () => void>>>({});
  useEffect(() => {
    const s = stops.current;
    return () => Object.values(s).forEach((stop) => stop?.());
  }, []);

  const patch = (kind: Kind, p: Partial<Job> | ((j: Job) => Partial<Job>)) =>
    setJobs((all) => {
      const j = all[kind];
      if (!j) return all;
      return { ...all, [kind]: { ...j, ...(typeof p === "function" ? p(j) : p) } };
    });

  const demoFor = (j: Job | undefined) => (j?.source === "recorded" ? REC.runMode === "mock" : liveDemo);

  /** Runs after the run's last event: load its final state (and the recommendation). */
  async function finish(kind: Kind, src: Source, runId: string) {
    // The plan's containment check includes "the app is still healthy" afterwards.
    if (kind === "containment") api.health().then((h) => setHealthy(h.ok), () => setHealthy(false));
    if (src === "recorded") {
      patch(kind, { run: REC[kind].run });
      if (kind === "comparison") setRec(REC.comparison.recommendation);
      return;
    }
    try {
      const run = await api.run(runId);
      patch(kind, { run });
      if (kind === "comparison" && run.recommendationId) setRec(await api.recommendation(run.recommendationId));
    } catch (e) {
      patch(kind, { error: message(e) });
    }
  }

  function onEvent(kind: Kind, src: Source, e: RunEvent) {
    patch(kind, (j) => ({ events: [...j.events, e] }));
    if (kind === "trial" && e.type === "approval_required") {
      if (src === "recorded") {
        setIntent(REC.trial.intent);
        setTrialEvidence(REC.trial.evidence);
      } else {
        api.approval(e.data.approvalId).then(
          (i) => {
            setIntent(i);
            api.evidence(i.screenshotEvidenceId).then(setTrialEvidence, () => {});
          },
          (err) => patch("trial", { error: message(err) }),
        );
      }
    }
    if (isTerminal(e)) void finish(kind, src, e.runId);
  }

  async function start(kind: Kind, src: Source = source) {
    stops.current[kind]?.();
    setJobs((all) => ({ ...all, [kind]: fresh(src) }));
    setOrder((o) => [...o.filter((k) => k !== kind), kind]);
    if (kind === "comparison") {
      setRec(null);
      setIntent(null);
      setDecided(null);
      setReplay(null);
      setJobs((all) => ({ ...all, trial: undefined }));
    }
    if (kind === "containment") setHealthy(null);
    if (kind === "trial") {
      setIntent(null);
      setDecided(null);
      setReplay(null);
    }

    if (src === "recorded") {
      const events = REC[kind].events;
      stops.current[kind] = recordedSource(events, {
        until: kind === "trial" ? (e) => e.type === "approval_required" : undefined,
      }).start((e) => onEvent(kind, "recorded", e), () => {});
      return;
    }

    try {
      let runId: string;
      if (kind === "comparison") {
        const profile = await api.profile();
        runId = (
          await api.startComparison({
            profileVersionId: profile.id,
            workflowId: GOLDEN.workflowId,
            taskId: GOLDEN.taskId,
            incumbentToolId: GOLDEN.incumbent,
            candidateToolIds: [GOLDEN.candidate],
            spendCapMinor: GOLDEN.capMinor,
          })
        ).runId;
      } else if (kind === "containment") {
        runId = (await api.startContainment()).runId;
      } else {
        if (!rec) return;
        runId = (await api.startTrialRequest(rec.id, GOLDEN.candidate)).runId;
      }
      stops.current[kind] = liveSource(runId).start(
        (e) => onEvent(kind, "live", e),
        (msg) => patch(kind, { error: msg }),
      );
    } catch (e) {
      patch(kind, { error: message(e) });
    }
  }

  async function decide(d: "approve" | "decline") {
    if (!intent) return;
    const trial = jobs.trial;
    setBusy(true);
    if (trial?.source === "recorded") {
      setDecided(d === "approve" ? "approved" : "declined");
      if (d === "approve") {
        setIntent(REC.trial.decision);
        const from = REC.trial.events.find((e) => e.type === "approval_required")?.seq ?? 0;
        stops.current.trial = recordedSource(REC.trial.events, { from }).start((e) => onEvent("trial", "recorded", e), () => {});
      } else {
        patch("trial", { run: { ...REC.trial.run, outcome: "cancelled" } });
      }
      setBusy(false);
      return;
    }
    try {
      const next = await api.decide(intent.id, d, intent.intentHash);
      setIntent(next);
      setDecided(d === "approve" ? "approved" : "declined");
    } catch (e) {
      patch("trial", { error: message(e) });
    } finally {
      setBusy(false);
    }
  }

  /** The replay check: a second decision on the same approval must be refused. */
  async function tryAgain() {
    if (!intent) return;
    if (jobs.trial?.source === "recorded") {
      setReplay({ status: REC.trial.replay.status, message: REC.trial.replay.error.message, correlationId: REC.trial.replay.error.correlationId });
      return;
    }
    setBusy(true);
    try {
      await api.decide(intent.id, "approve", intent.intentHash);
      setReplay({ status: 200, message: "That should not happen. Tell Anish with the run's correlation ID." });
    } catch (e) {
      if (e instanceof ApiFailure) setReplay({ status: e.status, message: e.error.message, correlationId: e.error.correlationId });
      else setReplay({ status: 0, message: message(e) });
    } finally {
      setBusy(false);
    }
  }

  const openEvidence = (id: string) => {
    const comparison = jobs.comparison;
    const e = rec?.evidence.find((x) => x.id === id);
    if (!e) return;
    const demo = demoFor(comparison);
    setDrawer(toUiEvidence(e, { demo, screenshotUrl: comparison?.source === "live" ? api.screenshotUrl(e.id) : undefined }));
  };
  const showForm = () => {
    if (!trialEvidence) return;
    const t = jobs.trial;
    setDrawer(
      toUiEvidence(trialEvidence, {
        demo: demoFor(t),
        screenshotUrl: t?.source === "recorded" ? REC.trial.screenshot : api.screenshotUrl(trialEvidence.id),
      }),
    );
  };

  const allEvents = useMemo(
    () => (["comparison", "trial", "containment"] as Kind[]).flatMap((k) => jobs[k]?.events ?? []),
    [jobs],
  );
  const runs = useMemo(
    () => (["comparison", "trial", "containment"] as Kind[]).flatMap((k) => (jobs[k]?.run ? [jobs[k]!.run!] : [])),
    [jobs],
  );
  const running = (k: Kind) => !!jobs[k] && !jobs[k]!.run && !jobs[k]!.error;
  const anyRunning = (["comparison", "containment", "trial"] as Kind[]).some(running);
  const panelSource: Source = jobs[order.at(-1) ?? "comparison"]?.source ?? source;
  const demo = panelSource === "recorded" ? REC.runMode === "mock" : liveDemo;

  const checks = successChecks({
    calls: allEvents.filter((e) => e.type === "inference_call"),
    comparison: jobs.comparison,
    containment: jobs.containment,
    rec,
    replay,
    decided,
    demoComparison: demoFor(jobs.comparison),
    demoContainment: demoFor(jobs.containment),
  });

  const statusLine =
    status.state === "checking"
      ? "Checking the Wallio API"
      : status.state === "online"
        ? `Wallio API on Vultr is online${status.runMode === "mock" ? " in demo playback" : ""}`
        : "The Wallio API can't be reached. Recorded runs still play.";

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Compare, live"
        subtitle={statusLine}
        actions={
          <>
            <Segmented<Source>
              label="Where runs come from"
              value={source}
              onChange={(v) => setPick(v)}
              options={[
                { id: "live", label: "Live API" },
                { id: "recorded", label: "Recorded run" },
              ]}
            />
            <Link href="/compare" className="flex h-9 items-center px-2 text-[13px] text-text-3 transition-colors hover:text-text-1">
              Sample compare
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 flex flex-col gap-gutter lg:col-span-4">
          <VultrPanel events={allEvents} runs={runs} demo={demo} source={panelSource} pinnedModel={PINNED_MODEL} />
          <SuccessChecks checks={checks} />
          <AllowlistCard />
        </div>

        <div className="order-first col-span-12 flex flex-col gap-gutter lg:order-none lg:col-span-8">
          <Card title="The run" action={<span className="text-[13px] text-text-3">Spend cap $0.50</span>}>
            <div className={cn("flex min-h-16 flex-wrap items-center gap-3 px-6 py-3")}>
              <span className="flex items-center gap-3 whitespace-nowrap">
                <ToolMark name={NAMES[GOLDEN.incumbent]} />
                <span className="text-text-1">
                  {NAMES[GOLDEN.incumbent]} <span className="text-text-3">yours</span>
                </span>
              </span>
              <span className="text-text-3">vs</span>
              <span className="flex items-center gap-3 whitespace-nowrap">
                <ToolMark name={NAMES[GOLDEN.candidate]} />
                <span className="text-text-1">{NAMES[GOLDEN.candidate]}</span>
              </span>
            </div>
            <dl className="border-t border-line">
              {[
                ["Workflow", GOLDEN.workflow],
                ["Task", `${GOLDEN.task} · runs in our owned test page`],
              ].map(([k, v]) => (
                <div key={k} className="flex min-h-12 items-center justify-between gap-6 border-t border-line px-6 py-3 first:border-t-0">
                  <dt className="shrink-0 text-text-3">{k}</dt>
                  <dd className="min-w-0 text-right text-text-1">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
              <Button
                variant={focus === "comparison" ? "primary" : "secondary"}
                disabled={status.state === "checking" || anyRunning}
                onClick={() => void start("comparison")}
              >
                {jobs.comparison ? "Run the comparison again" : "Run the comparison"}
              </Button>
              <Button
                variant={focus === "containment" ? "primary" : "secondary"}
                disabled={status.state === "checking" || anyRunning}
                onClick={() => void start("containment")}
              >
                Run the containment test
              </Button>
              {source === "recorded" && (
                <span className="text-[13px] text-text-3">
                  Recorded from the API on{" "}
                  {new Date(REC.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          </Card>

          {order.map((k) =>
            k === "comparison" && jobs.comparison ? (
              <div key="comparison" className="flex flex-col gap-gutter">
                <RunCard
                  title={`${NAMES[GOLDEN.incumbent]} vs ${NAMES[GOLDEN.candidate]}`}
                  events={jobs.comparison.events}
                  run={jobs.comparison.run}
                  error={jobs.comparison.error}
                  source={jobs.comparison.source}
                  onRetryRecorded={jobs.comparison.source === "live" ? () => void start("comparison", "recorded") : undefined}
                />
                {rec && (
                  <RecommendationCard rec={rec} names={NAMES} demo={demoFor(jobs.comparison)} onEvidence={openEvidence}>
                    {!jobs.trial && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
                        <span className="text-text-2">
                          Next: ask {toolName(NAMES, GOLDEN.candidate)} for a trial. Nothing is sent until you approve.
                        </span>
                        <Button variant="secondary" onClick={() => void start("trial", jobs.comparison!.source)}>
                          Prepare the trial request
                        </Button>
                      </div>
                    )}
                    {jobs.trial && !intent && (
                      <RunCardInline job={jobs.trial} />
                    )}
                    {jobs.trial && intent && (
                      <ApprovalCard
                        intent={intent}
                        candidate={toolName(NAMES, GOLDEN.candidate)}
                        busy={busy}
                        decided={decided}
                        replay={replay}
                        onDecide={(d) => void decide(d)}
                        onReplay={() => void tryAgain()}
                        onShowForm={showForm}
                      />
                    )}
                  </RecommendationCard>
                )}
                {jobs.trial && (jobs.trial.events.length > 0 || jobs.trial.error) && (
                  <RunCard
                    title="Trial request"
                    events={jobs.trial.events}
                    run={jobs.trial.run}
                    error={jobs.trial.error}
                    source={jobs.trial.source}
                  />
                )}
              </div>
            ) : k === "containment" && jobs.containment ? (
              <div key="containment" className="flex flex-col gap-gutter">
                <RunCard
                  title="Containment test"
                  events={jobs.containment.events}
                  run={jobs.containment.run}
                  error={jobs.containment.error}
                  source={jobs.containment.source}
                  onRetryRecorded={jobs.containment.source === "live" ? () => void start("containment", "recorded") : undefined}
                />
                <ContainmentCard events={jobs.containment.events} demo={demoFor(jobs.containment)} healthy={healthy} />
              </div>
            ) : null,
          )}
        </div>
      </div>

      <EvidenceDrawer evidence={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

function RunCardInline({ job }: { job: Job }) {
  return (
    <p className="flex min-h-12 items-center gap-3 border-t border-line px-6 text-text-2">
      {job.error ? (
        <span className="text-danger">{job.error}</span>
      ) : (
        <>
          <span className="size-1.5 animate-pulse rounded-[1px] bg-lavender" />
          {job.events.at(-1)?.message ?? "Preparing the trial request"}
        </>
      )}
    </p>
  );
}

/** docs/GOLDEN_PATH.md §7, checked against what this page has seen so far. */
function successChecks(x: {
  calls: RunEvent[];
  comparison?: Job;
  containment?: Job;
  rec: Recommendation | null;
  replay: Replay;
  decided: "approved" | "declined" | null;
  demoComparison: boolean;
  demoContainment: boolean;
}): Check[] {
  const { calls, comparison, containment, rec, replay, decided } = x;
  const runFirst = "Run the comparison to check this.";

  const inference: Check = {
    name: "Inference",
    condition: "Every agent model call goes to Vultr Serverless Inference, with usage recorded",
    state: "waiting",
    note: runFirst,
  };
  if (comparison?.run) {
    const ok = calls.every((c) => c.type === "inference_call" && c.data.ok);
    if (x.demoComparison) inference.note = "Demo playback makes no model calls. Checked once runs are live.";
    else if (calls.length && ok) Object.assign(inference, { state: "pass", note: `${calls.length} calls, all answered` });
    else Object.assign(inference, { state: "fail", note: calls.length ? "A model call failed" : "No model calls were seen" });
  }

  const evidence: Check = {
    name: "Evidence",
    condition: "At least one capture per tool, each with a hash and a screenshot",
    state: "waiting",
    note: runFirst,
  };
  if (rec) {
    const tools = rec.candidates.map((c) => c.toolId);
    const good = tools.filter((t) => rec.evidence.some((e) => e.candidateToolId === t && e.contentHash && e.hasScreenshot));
    if (good.length === tools.length) Object.assign(evidence, { state: "pass", note: `${tools.length} of ${tools.length} tools have one` });
    else if (x.demoComparison) evidence.note = "Demo playback stores placeholder captures. Checked once the runner is live.";
    else Object.assign(evidence, { state: "fail", note: `${good.length} of ${tools.length} tools have one` });
  }

  const traceability: Check = {
    name: "Traceability",
    condition: "Every statement cites evidence or something you told us",
    state: "waiting",
    note: runFirst,
  };
  if (rec) {
    const facts = rec.statements.filter((st) => st.role !== "next_step");
    const cited = facts.filter((st) => st.evidenceIds.length + st.userInputRefs.length > 0).length;
    Object.assign(traceability, {
      state: cited === facts.length ? "pass" : "fail",
      note: `${cited} of ${facts.length} statements cite a source`,
    });
  }

  const honesty: Check = {
    name: "Honesty",
    condition: "No price or test result that isn't from a capture or an executed test",
    state: "waiting",
    note: runFirst,
  };
  if (rec) {
    const ids = new Set(rec.evidence.map((e) => e.id));
    const tests = rec.candidates.filter((c) => c.testResult);
    const backed = tests.every((c) => ids.has(c.testResult!.evidenceId));
    Object.assign(honesty, {
      state: backed ? "pass" : "fail",
      note: backed
        ? tests.length
          ? "Every test result points at its evidence"
          : "No price or test result is claimed without evidence"
        : "A test result has no evidence",
    });
  }

  const approval: Check = {
    name: "Approval",
    condition: "Nothing is sent before you approve, and a second use is refused",
    state: "waiting",
    note: rec ? "Prepare and approve the trial request, then try approving it again." : runFirst,
  };
  if (decided === "approved" && !replay) approval.note = "Now press “Try approving it again”.";
  if (decided === "declined") approval.note = "Declined, so nothing was sent. Approve one to check the replay.";
  if (replay) {
    Object.assign(approval, replay.status >= 400
      ? { state: "pass", note: `Second decision refused (${replay.status})` }
      : { state: "fail", note: "The API accepted a second decision" });
  }

  const contain: Check = {
    name: "Containment",
    condition: "Private targets denied, sentinel unchanged, cleanup verified",
    state: "waiting",
    note: "Run the containment test to check this.",
  };
  const result = containment?.events.find((e) => e.type === "containment_result");
  if (result && result.type === "containment_result") {
    const d = result.data;
    const blocked = d.deniedRequests + d.refusedActions;
    if (!d.contained) Object.assign(contain, { state: "fail", note: "The page wasn't contained" });
    else if (!d.sentinel) contain.note = `${blocked} blocked. ${x.demoContainment ? "Sentinel isn't read in demo playback" : "Sentinel couldn't be read"}.`;
    else if (d.sentinel.before === d.sentinel.after && d.cleanupVerified) Object.assign(contain, { state: "pass", note: `${blocked} blocked, sentinel unchanged, cleanup verified` });
    else Object.assign(contain, { state: "fail", note: d.sentinel.before !== d.sentinel.after ? "The sentinel changed" : "Cleanup wasn't verified" });
  }

  const timing: Check = {
    name: "Timing",
    condition: "The whole comparison under 180 s, aiming for under 90 s",
    state: "waiting",
    note: runFirst,
  };
  if (comparison?.run && comparison.events.length > 1) {
    const secs = Math.round(
      (new Date(comparison.events.at(-1)!.ts).getTime() - new Date(comparison.events[0].ts).getTime()) / 1000,
    );
    Object.assign(timing, {
      state: secs < 180 ? "pass" : "fail",
      note: `${secs}s${x.demoComparison ? " in demo playback" : ""}`,
    });
  }

  return [inference, evidence, traceability, honesty, approval, contain, timing];
}
