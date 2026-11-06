"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { CaretRight, Check, Prohibit, X } from "@phosphor-icons/react";
import type { CandidateResult, Evidence, RunOutcome, RunResult, Statement } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { Money } from "@/components/kit/money";
import { Tag } from "@/components/kit/tag";
import { ToolMark } from "@/components/kit/tool-mark";
import { PassBar } from "@/components/kit/charts";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AccessTag } from "@/components/discover/match-detail";
import { EvidenceDrawer } from "@/components/discover/evidence-drawer";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const OUTCOME: Record<RunOutcome, string> = {
  succeeded: "Finished",
  partial: "Partial",
  failed: "Failed",
  timed_out: "Timed out",
  cancelled: "Stopped by you",
};

/**
 * One decision, then the evidence behind it. Lean right: verdict, head-to-head, why and evidence are
 * wide on the right; run facts, the test, limits and every attempt sit narrow on the left.
 * Failed and timed-out runs say so plainly and give no verdict.
 */
export function RunResults({ result }: { result: RunResult }) {
  const [source, setSource] = useState<Evidence | null>(null);
  const [a, b] = result.candidates;
  const verdict = result.outcome === "succeeded" || result.outcome === "partial";

  return (
    <div className="flex flex-col gap-gutter">
      {/* Row 1: the verdict (right) and the run facts (left). DOM order = phone order. */}
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 grid xl:col-span-8">
          {verdict ? <Verdict result={result} /> : <NoVerdict result={result} />}
        </div>
        <div className="col-span-12 grid xl:order-first xl:col-span-4">
          <ThisRun result={result} />
        </div>
      </div>

      {/* Row 2: head to head (right) and the test that decides pass or fail (left). */}
      <div className="grid grid-cols-12 gap-gutter">
        {result.outcome !== "failed" && (
          <div className="col-span-12 xl:col-span-8">
            <HeadToHead a={a} b={b} />
          </div>
        )}
        <div className={cn("col-span-12 grid xl:order-first", result.outcome === "failed" ? "xl:col-span-12" : "xl:col-span-4")}>
          <TheTest test={result.test} />
        </div>
      </div>

      {/* Row 3: why (right) and what this result does not show (left). */}
      <div className="grid grid-cols-12 gap-gutter">
        {verdict && (
          <div className="col-span-12 xl:col-span-8">
            <WhyPanel statements={result.statements} evidence={result.evidence} onOpen={setSource} />
          </div>
        )}
        <div className={cn("col-span-12 grid xl:order-first", verdict ? "xl:col-span-4" : "xl:col-span-12")}>
          <Panel title="What this doesn't show" flush>
            <ul className="border-t border-line">
              {result.limitations.map((l) => (
                <li key={l} className="flex gap-3 border-t border-line px-6 py-4 text-text-2 first:border-t-0">
                  <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-[1px] bg-text-disabled" />
                  {l}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Row 4: evidence (right) and every attempt, including failed ones (left). */}
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 xl:col-span-8">
          <Panel
            title="Evidence"
            titleAddon={<span className="tnum text-[13px] font-normal text-text-3">{result.evidence.length}</span>}
            flush
            className="h-full"
          >
            <ul className="border-t border-line">
              {result.evidence.map((e) => (
                <li key={e.id} className="border-t border-line first:border-t-0">
                  <button
                    type="button"
                    onClick={() => setSource(e)}
                    className="group flex min-h-12 w-full items-center gap-4 px-6 py-3 text-left"
                  >
                    <span className="w-[148px] shrink-0">
                      {e.kind === "tested" ? <AccessTag mode="tested_owned_demo" /> : <Tag kind={e.kind} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-text-1">{e.title}</span>
                      {e.limitation && <span className="text-text-3"> · {e.limitation}</span>}
                    </span>
                    <span className="hidden shrink-0 font-mono text-[12px] text-text-3 lg:inline">{e.source}</span>
                    <span className="tnum hidden w-16 shrink-0 text-right text-[13px] text-text-3 sm:inline">
                      {time(e.capturedAt)}
                    </span>
                    <CaretRight size={12} className="shrink-0 text-text-3 transition-colors group-hover:text-text-1" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="col-span-12 xl:order-first xl:col-span-4">
          <EveryRun attempts={result.attempts} />
        </div>
      </div>

      <EvidenceDrawer evidence={source} onClose={() => setSource(null)} />
    </div>
  );
}

/* ── Verdict ──────────────────────────────────────────────────────────── */

function Verdict({ result }: { result: RunResult }) {
  // TODO(api): POST /api/decisions. Until then the choice is local only.
  const [decision, setDecision] = useState<"none" | "saved" | "disagreed">("none");
  const s = result.savings;
  return (
    <Panel variant="accent">
      <div className="flex h-full flex-col justify-between gap-8 p-2 pt-6">
        <div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink/70">
            <span>
              Confidence: <span className="font-medium text-ink">{result.confidence}</span>
            </span>
            {result.outcome === "partial" && (
              <span className="font-medium text-ink">· Partial result</span>
            )}
          </p>
          <h2 className="display mt-2 text-[32px] leading-[38px] font-medium">{result.recommendation.title}</h2>
          <p className="mt-3 max-w-[60ch] text-[16px] leading-[24px] text-ink/70">
            {result.recommendation.reason}
            {s && s.monthlyDeltaCents !== null && s.monthlyDeltaCents > 0 && (
              <> {s.assumptions[0]}, an estimate.</>
            )}
          </p>
          {result.partialNote && (
            <p className="mt-3 max-w-[60ch] text-[14px] leading-[21px] text-ink/70">{result.partialNote}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {decision === "none" && (
            <>
              <Button variant="inverse" size="lg" onClick={() => setDecision("saved")}>
                Save decision
              </Button>
              <Button variant="inverse-ghost" size="lg" onClick={() => setDecision("disagreed")}>
                Disagree
              </Button>
            </>
          )}
          {decision === "saved" && (
            <>
              <span className="inline-flex h-11 items-center gap-2 rounded-md bg-ink/10 px-5 text-[14px] font-medium">
                <Check size={16} weight="bold" /> Saved to Decisions
              </span>
              <Link
                href="/decisions"
                className="inline-flex h-11 items-center rounded-md px-5 text-[14px] text-ink/70 transition-colors hover:text-ink"
              >
                View
              </Link>
            </>
          )}
          {decision === "disagreed" && (
            <>
              <span className="inline-flex h-11 items-center rounded-md bg-ink/10 px-5 text-[14px] font-medium">
                Noted. Nothing changes until you decide.
              </span>
              <Button variant="inverse-ghost" size="lg" onClick={() => setDecision("none")}>
                Undo
              </Button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Failed or timed out: say what happened, what finished, and that there's no verdict. */
function NoVerdict({ result }: { result: RunResult }) {
  const [a, b] = result.candidates;
  const failed = result.outcome === "failed";
  return (
    <section className="flex flex-col justify-between gap-8 rounded-[20px] border border-line bg-surface-1 p-8">
      <div>
        <p className={cn("text-[13px]", failed ? "text-danger" : "text-lavender")}>{OUTCOME[result.outcome]}</p>
        <h2 className="display mt-2 text-[28px] leading-[34px] font-medium text-text-1">
          {failed ? "No verdict. The run didn't finish." : "No verdict. The run hit its time limit."}
        </h2>
        <p className="mt-3 max-w-[60ch] text-[16px] leading-[24px] text-text-2">
          {failed
            ? result.error?.message
            : `${a.toolName} finished all 3 runs. ${b.toolName}'s runs didn't start before the 180s limit, so there's nothing fair to compare.`}
        </p>
        {result.error && (
          <p className="mt-3 font-mono text-[12px] text-text-3">Reference {result.error.correlationId}</p>
        )}
      </div>
      <p className="text-[13px] text-text-3">Nothing was decided for you. Run it again when you&apos;re ready.</p>
    </section>
  );
}

function ThisRun({ result }: { result: RunResult }) {
  const reduce = useReducedMotionConfig();
  const [open, setOpen] = useState(false);
  return (
    <Panel title="This run" flush>
      <KeyValue className="border-t border-line">
        <KeyValueRow label="Outcome">
          <span
            className={cn(
              result.outcome === "succeeded" ? "text-text-1" : result.outcome === "failed" ? "text-danger" : "text-lavender",
            )}
          >
            {OUTCOME[result.outcome]} · {time(result.finishedAt)}
          </span>
        </KeyValueRow>
        <KeyValueRow label="Runs">
          <span className="tnum">{result.attempts.length} of 6</span>
        </KeyValueRow>
        <KeyValueRow label="Policy checks">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="tnum flex items-center gap-1.5 rounded-md transition-colors hover:text-text-1"
          >
            {result.policy.allowed} allowed
            <span className="text-text-3">·</span>
            <span className="text-lavender">{result.policy.stopped} stopped</span>
            <CaretRight size={11} className={cn("text-text-3 transition-transform", open && "rotate-90")} />
          </button>
        </KeyValueRow>
      </KeyValue>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="overflow-hidden border-t border-line bg-bg/40"
          >
            {result.policy.denied.map((d) => (
              <li key={d.target} className="flex flex-col gap-0.5 px-6 py-3 text-[13px]">
                <span className="flex items-center gap-2">
                  <Prohibit size={13} className="shrink-0 text-lavender" />
                  <span className="font-mono text-[12px] text-text-2">{d.action}</span>
                  <span className="min-w-0 truncate font-mono text-[12px] text-text-1">{d.target}</span>
                </span>
                <span className="pl-[21px] text-text-3">Denied · {d.reason}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <KeyValue className="border-t border-line">
        <KeyValueRow label="Spend">
          <span className="tnum">
            <Money cents={result.spend.actualCents} /> <span className="text-text-3">of</span>{" "}
            <Money cents={result.spend.capCents} /> <span className="text-text-3">cap</span>
          </span>
        </KeyValueRow>
        <KeyValueRow label="Sandbox">
          {result.cleanup.status === "cleaned" ? (
            <span className="flex items-center gap-2">
              Destroyed {result.cleanup.at && time(result.cleanup.at)}
              <Check size={14} weight="bold" className="text-lime" />
            </span>
          ) : result.cleanup.status === "pending" ? (
            <span className="text-text-3">Cleaning up</span>
          ) : (
            <span className="text-danger">Cleanup failed. New runs paused.</span>
          )}
        </KeyValueRow>
      </KeyValue>
    </Panel>
  );
}

/* ── The test ─────────────────────────────────────────────────────────── */

function TheTest({ test }: { test: RunResult["test"] }) {
  return (
    <Panel title="The test" titleAddon={<AccessTag mode="tested_owned_demo" />} className="h-full">
      <p className="text-text-2">{test.name}. The same check decides pass or fail for both tools.</p>
      <pre className="mt-4 overflow-x-auto rounded-[12px] border border-line bg-bg px-4 py-3 font-mono text-[12px] leading-[19px] text-text-1">
        {test.assertion}
      </pre>
    </Panel>
  );
}

function EveryRun({ attempts }: { attempts: RunResult["attempts"] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="Every run" flush className="h-full">
      {attempts.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-text-3">No runs finished.</p>
      ) : (
        <ul className="border-t border-line">
          {attempts.map((r) => {
            const id = `${r.toolName}-${r.attempt}`;
            return (
              <li key={id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpen((o) => (o === id ? null : id))}
                  aria-expanded={open === id}
                  className="flex h-12 w-full items-center gap-3 px-6 text-left"
                >
                  <ToolMark name={r.toolName} />
                  <span className="min-w-0 flex-1 truncate text-text-2">
                    {r.toolName} <span className="text-text-3">· Run {r.attempt}</span>
                  </span>
                  <span
                    className={cn(
                      "tnum flex shrink-0 items-center gap-1.5 text-[13px]",
                      r.passed ? "text-lime" : "text-text-2",
                    )}
                  >
                    {r.passed ? <Check size={12} weight="bold" /> : <X size={12} weight="bold" />}
                    {r.passed ? `${r.seconds}s` : (r.note ?? "Failed")}
                  </span>
                </button>
                {open === id && r.output && (
                  <p className="px-6 pb-3 pl-[64px] font-mono text-[12px] text-text-3">{r.output}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ── Why ──────────────────────────────────────────────────────────────── */

const GROUPS: { role: Statement["role"]; label: string; mark: string }[] = [
  { role: "supporting", label: "For it", mark: "bg-lime" },
  { role: "counter", label: "Against it", mark: "bg-text-2" },
  { role: "uncertainty", label: "Not sure yet", mark: "border border-lavender" },
  { role: "next_step", label: "Next step", mark: "bg-lavender" },
];

function WhyPanel({
  statements,
  evidence,
  onOpen,
}: {
  statements: Statement[];
  evidence: Evidence[];
  onOpen: (e: Evidence) => void;
}) {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const rows = GROUPS.flatMap((g) => statements.filter((s) => s.role === g.role).map((s) => ({ s, g })));
  return (
    <Panel title="Why" flush className="h-full">
      <ul className="border-t border-line">
        {rows.map(({ s, g }, i) => {
          const first = i === 0 || rows[i - 1].g.role !== g.role;
          return (
            <li
              key={s.text}
              className={cn(
                "grid grid-cols-1 items-start gap-x-4 gap-y-1 px-6 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center",
                first && i > 0 && "border-t border-line",
              )}
            >
              <span className={cn("flex items-center gap-2 text-[13px] text-text-2", !first && "invisible max-sm:hidden")}>
                <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-[1px]", g.mark)} />
                {g.label}
              </span>
              <span className={s.role === "counter" ? "text-text-2" : "text-text-1"}>{s.text}</span>
              <span className="flex flex-wrap gap-x-3 sm:justify-end">
                {s.sourceIds.map((id) => {
                  const e = byId.get(id);
                  return e ? (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpen(e)}
                      className="rounded-md text-[12px] text-text-3 underline-offset-4 transition-colors hover:text-text-1 hover:underline"
                    >
                      {e.source}
                    </button>
                  ) : null;
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Head to head ─────────────────────────────────────────────────────── */

/** Both tools face to face, one measure per row. The better value is bright; the other is dim. */
function HeadToHead({ a, b }: { a: CandidateResult; b: CandidateResult }) {
  const better = (x: number | null, y: number | null, lowerWins: boolean) => {
    if (x === null || y === null || x === y) return 0;
    return (lowerWins ? x < y : x > y) ? -1 : 1; // -1 = a wins, 1 = b wins
  };
  const passWin = better(a.passed / a.attempts, b.passed / b.attempts, false);
  const rows: { label: string; a: React.ReactNode; b: React.ReactNode; win: number }[] = [
    {
      label: "Median time",
      a: a.medianSeconds === null ? "Unknown" : `${a.medianSeconds}s`,
      b: b.medianSeconds === null ? "Unknown" : `${b.medianSeconds}s`,
      win: better(a.medianSeconds, b.medianSeconds, true),
    },
    {
      label: "Price per month",
      a: a.monthlyCents === 0 ? "Free" : formatMoney(a.monthlyCents).replace(/\.00$/, ""),
      b: b.monthlyCents === 0 ? "Free" : formatMoney(b.monthlyCents).replace(/\.00$/, ""),
      win: better(a.monthlyCents, b.monthlyCents, true),
    },
    {
      label: "Cost of this test",
      a: a.runCostCents === null ? "Unknown" : `${a.runCostCents}¢`,
      b: b.runCostCents === null ? "Unknown" : `${b.runCostCents}¢`,
      win: better(a.runCostCents, b.runCostCents, true),
    },
  ];

  return (
    <section className="flex h-full flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-6 pt-6 pb-5 sm:gap-4">
        <Side tool={a} />
        <span className="grid size-9 place-items-center rounded-[8px] bg-surface-3 text-[13px] text-text-3">vs</span>
        <Side tool={b} right />
      </header>

      {/* Passed the test: the 3D pass blocks, mirrored. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-line px-6 py-5">
        <span className="flex items-center gap-3">
          <span className={cn("tnum shrink-0 text-[20px] font-medium", passWin <= 0 ? "text-text-1" : "text-text-3")}>
            {a.passed}/{a.attempts}
          </span>
          <span className="hidden flex-1 sm:flex">
            <PassBar passed={a.passed} attempts={a.attempts} best={passWin === -1} />
          </span>
        </span>
        <span className="w-24 text-center text-[13px] text-text-3 sm:w-36">Passed the test</span>
        <span className="flex items-center justify-end gap-3">
          <span className="hidden flex-1 sm:flex">
            <PassBar passed={b.passed} attempts={b.attempts} best={passWin === 1} />
          </span>
          <span className={cn("tnum shrink-0 text-[20px] font-medium", passWin >= 0 ? "text-text-1" : "text-text-3")}>
            {b.passed}/{b.attempts}
          </span>
        </span>
      </div>

      {rows.map((r) => (
        <div
          key={r.label}
          className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-line px-6 py-3"
        >
          <span className={cn("tnum", r.win === 1 ? "text-text-3" : "text-text-1")}>{r.a}</span>
          <span className="w-24 text-center text-[13px] text-text-3 sm:w-36">{r.label}</span>
          <span className={cn("tnum flex justify-end text-right", r.win === -1 ? "text-text-3" : "text-text-1")}>
            {r.b}
          </span>
        </div>
      ))}
      <div className="mt-auto flex min-h-12 items-center justify-center border-t border-line px-6 py-3">
        <AccessTag mode="tested_owned_demo" />
      </div>
    </section>
  );
}

function Side({ tool, right = false }: { tool: CandidateResult; right?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", right && "flex-row-reverse text-right")}>
      <span className="hidden sm:block">
        <ToolMark name={tool.toolName} size="lg" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-medium text-text-1">{tool.toolName}</span>
        <span className="hidden text-[13px] text-text-3 sm:block">
          {tool.isCurrent ? "In your stack" : "Candidate"}
        </span>
      </span>
    </span>
  );
}
