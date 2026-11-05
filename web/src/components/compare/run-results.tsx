"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "@phosphor-icons/react";
import type { CandidateResult, RunResult } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { Money } from "@/components/kit/money";
import { Tag } from "@/components/kit/tag";
import { ToolMark } from "@/components/kit/tool-mark";
import { PassBar } from "@/components/kit/charts";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * One decision, then the evidence behind it. Lean right: the verdict, the head-to-head and the
 * evidence are wide on the right; run facts, limits and every attempt sit narrow on the left.
 */
export function RunResults({ result }: { result: RunResult }) {
  // TODO(api): POST /api/decisions. Until then the choice is local only.
  const [decision, setDecision] = useState<"none" | "saved" | "disagreed">("none");
  const [a, b] = result.candidates;
  const cost = result.candidates.reduce((n, c) => n + (c.runCostCents ?? 0), 0);

  return (
    <div className="flex flex-col gap-gutter">
      {/* Row 1: the verdict (right) and the run facts (left). DOM order = phone order. */}
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 grid xl:col-span-8">
          <Panel variant="accent">
            <div className="flex h-full flex-col justify-between gap-10 p-2 pt-8">
              <div>
                <h2 className="display text-[32px] leading-[38px] font-medium">
                  {result.recommendation.title}
                </h2>
                <p className="mt-3 max-w-[56ch] text-[16px] leading-[24px] text-ink/70">
                  {result.recommendation.reason}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {decision === "none" && (
                  <>
                    <Button variant="inverse" size="lg" onClick={() => setDecision("saved")}>
                      Save decision
                    </Button>
                    <Button
                      variant="inverse-ghost"
                      size="lg"
                      onClick={() => setDecision("disagreed")}
                    >
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
        </div>

        <div className="col-span-12 grid xl:order-first xl:col-span-4">
          <Panel title="This run" flush>
            <KeyValue className="border-t border-line">
              <KeyValueRow label="Finished">{time(result.finishedAt)}</KeyValueRow>
              <KeyValueRow label="Runs">
                <span className="tnum">{a.attempts} each</span>
              </KeyValueRow>
              <KeyValueRow label="Policy checks">
                <span className="tnum">
                  {result.policy.allowed} allowed
                  <span className="text-text-3"> · </span>
                  <span className="text-lavender">{result.policy.stopped} stopped</span>
                </span>
              </KeyValueRow>
              <KeyValueRow label="Inference cost">
                <Money cents={cost} />
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
                  <span className="text-danger">Cleanup failed</span>
                )}
              </KeyValueRow>
            </KeyValue>
          </Panel>
        </div>
      </div>

      {/* Row 2: head to head (right) and what this result does not show (left). */}
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 xl:col-span-8">
          <HeadToHead a={a} b={b} />
        </div>
        <div className="col-span-12 grid xl:order-first xl:col-span-4">
          <Panel title="What this doesn't show" flush>
            <ul className="border-t border-line">
              {result.limitations.map((l) => (
                <li
                  key={l}
                  className="flex gap-3 border-t border-line px-6 py-4 text-text-2 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-[1px] bg-text-disabled"
                  />
                  {l}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Row 3: evidence (right) and every attempt, including the failed one (left). */}
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 xl:col-span-8">
          <Panel
            title="Evidence"
            titleAddon={
              <span className="tnum text-[13px] font-normal text-text-3">
                {result.evidence.length}
              </span>
            }
            flush
            className="h-full"
          >
            <ul className="border-t border-line">
              {result.evidence.map((e) => (
                <li
                  key={e.id}
                  className="flex min-h-12 items-center gap-4 border-t border-line px-6 py-3 first:border-t-0"
                >
                  <span className="w-24 shrink-0">
                    <Tag kind={e.kind} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-1">
                    {e.title}
                    {e.limitation && <span className="text-text-3"> · {e.limitation}</span>}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[12px] text-text-3 md:inline">
                    {e.source}
                  </span>
                  <span className="tnum hidden w-16 shrink-0 text-right text-[13px] text-text-3 sm:inline">
                    {time(e.capturedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="col-span-12 xl:order-first xl:col-span-4">
          <Panel title="Every run" flush className="h-full">
            <ul className="border-t border-line">
              {result.attempts.map((r) => (
                <li
                  key={`${r.toolName}-${r.attempt}`}
                  className="flex h-12 items-center gap-3 border-t border-line px-6 first:border-t-0"
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
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

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
    { label: "Evidence", a: <Tag kind="tested" />, b: <Tag kind="tested" />, win: 0 },
  ];

  return (
    <section className="flex h-full flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-6 pt-6 pb-5 sm:gap-4">
        <Side tool={a} />
        <span className="grid size-9 place-items-center rounded-[8px] bg-surface-3 text-[13px] text-text-3">
          vs
        </span>
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
