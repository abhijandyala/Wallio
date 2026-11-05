"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { Check, X } from "@phosphor-icons/react";
import type {
  DecisionLogEntry,
  DecisionsData,
  Recommendation,
  RecommendedAction,
} from "@/lib/types";
import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { Tag } from "@/components/kit/tag";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { ButtonLink } from "@/components/kit/button-link";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApprovalPanel } from "./approval-panel";

const ACTION: Record<RecommendedAction, string> = {
  keep: "Keep",
  try: "Try",
  compare: "Compare",
  replace_after_validation: "Replace after a test",
  review_renewal: "Review",
  no_action: "No action",
};

const RESULT: Record<DecisionLogEntry["result"], string> = {
  helped: "Helped",
  no_change: "No change",
  pending: "Check-in due",
};

type RecState = "open" | "later" | "dismissed";

/**
 * Decisions: approvals that need you, open recommendations, and the memory of what you chose.
 * Approving is a backend operation; the rest is local until the API lands.
 * TODO(api): GET /api/decisions, POST /api/recommendations/{id}/{defer|dismiss}, POST /api/decisions/{id}/outcome.
 */
export function DecisionsView({ data }: { data: DecisionsData }) {
  const reduce = useReducedMotionConfig();
  const [recs, setRecs] = useState<Record<string, RecState>>({});
  const [outcomes, setOutcomes] = useState<Record<string, DecisionLogEntry["result"]>>({});

  const history = data.history.map((h) => ({ ...h, result: outcomes[h.id] ?? h.result }));
  const open = data.recommendations.filter((r) => (recs[r.id] ?? "open") === "open").length;
  const [settled, setSettled] = useState<string[]>([]);
  const waiting = data.approvals.filter((a) => !settled.includes(a.id)).length;
  const saved = history
    .filter((h) => h.result === "helped")
    .reduce((n, h) => n + (h.savedAnnualCents ?? 0), 0);

  const set = (id: string, s: RecState) => setRecs((p) => ({ ...p, [id]: s }));

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Decisions"
        subtitle={
          <>
            {waiting > 0 ? (
              <span className="text-text-1">{waiting} waiting on you</span>
            ) : (
              "Nothing waiting on you"
            )}
            {" · "}
            {open} open recommendation{open === 1 ? "" : "s"}
          </>
        }
      />

      <div className="grid grid-cols-12 gap-gutter xl:grid-rows-[auto_auto_1fr]">
        {/* Right, and first on phones: what needs you. */}
        <div className="col-span-12 flex flex-col gap-gutter xl:col-span-8 xl:col-start-5 xl:row-span-3 xl:row-start-1">
          {data.approvals.length > 0 ? (
            data.approvals.map((a) => (
              <ApprovalPanel
                key={a.id}
                intent={a}
                onSettled={(done) =>
                  setSettled((p) => (done ? [...p, a.id] : p.filter((x) => x !== a.id)))
                }
              />
            ))
          ) : (
            <Panel title="Approvals">
              <p className="text-text-3">Nothing to approve. The agent asks here before it submits anything.</p>
            </Panel>
          )}

          <Panel
            title="Recommendations"
            titleAddon={<span className="tnum text-[13px] font-normal text-text-3">{open}</span>}
            flush
          >
            <ul className="border-t border-line">
              {data.recommendations.map((r) => (
                <RecRow
                  key={r.id}
                  rec={r}
                  state={recs[r.id] ?? "open"}
                  onSet={(s) => set(r.id, s)}
                  reduce={!!reduce}
                />
              ))}
            </ul>
          </Panel>
        </div>

        {/* Left: decision memory. */}
        <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-1">
          <section className="flex flex-col gap-1 rounded-[20px] border border-line bg-surface-1 p-6">
            <p className="text-[13px] text-text-3">Saved by your decisions, estimated</p>
            <p className="display text-[44px] leading-[48px] font-medium text-lime">
              <Money cents={saved} dropCents />
              <span className="ml-1 text-[15px] font-normal tracking-normal text-text-3">/yr</span>
            </p>
          </section>
        </div>

        <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-2">
          <Panel title="History" flush>
            <ul className="border-t border-line">
              {history.map((h) => (
                <HistoryRow
                  key={h.id}
                  entry={h}
                  onAnswer={(r) => setOutcomes((p) => ({ ...p, [h.id]: r }))}
                />
              ))}
            </ul>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-4 xl:col-start-1 xl:row-start-3 xl:self-start">
          <Panel title="What the agent does alone" flush>
            <KeyValue className="border-t border-line">
              <KeyValueRow label="Read public pages">In a sandbox</KeyValueRow>
              <KeyValueRow label="Submit a form">Asks you first</KeyValueRow>
              <KeyValueRow label="Cancel a plan">Gives you the link</KeyValueRow>
              <KeyValueRow label="Pay for anything">Never</KeyValueRow>
            </KeyValue>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RecRow({
  rec,
  state,
  onSet,
  reduce,
}: {
  rec: Recommendation;
  state: RecState;
  onSet: (s: RecState) => void;
  reduce: boolean;
}) {
  return (
    <li className="border-t border-line first:border-t-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
          className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3"
        >
          {state === "open" ? (
            <>
              <span className="hidden w-[72px] shrink-0 text-[13px] text-text-2 sm:block">{ACTION[rec.action]}</span>
              <span className="min-w-0 flex-1 basis-48 truncate text-text-1">{rec.title}</span>
              <span className="hidden w-24 shrink-0 md:block">
                <Tag kind={rec.evidence} />
              </span>
              <span className="tnum hidden w-24 shrink-0 text-right text-[13px] text-text-3 sm:block">
                {rec.dueOn ? `Due ${formatShortDate(rec.dueOn)}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-1 max-sm:w-full">
                <ButtonLink href={rec.href} variant="secondary" size="sm" className="w-[84px]">
                  {rec.cta}
                </ButtonLink>
                <button
                  type="button"
                  onClick={() => onSet("later")}
                  className="h-8 rounded-md px-2.5 text-[13px] text-text-3 transition-colors hover:text-text-1"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={() => onSet("dismissed")}
                  aria-label={`Dismiss: ${rec.title}`}
                  className="grid size-8 place-items-center rounded-md text-text-3 transition-colors hover:text-text-1"
                >
                  <X size={14} />
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-text-3">{rec.title}</span>
              <span className="shrink-0 text-[13px] text-text-3">
                {state === "later" ? "Snoozed for a week" : "Dismissed"}
              </span>
              <button
                type="button"
                onClick={() => onSet("open")}
                className="h-8 shrink-0 rounded-md px-2.5 text-[13px] text-text-2 transition-colors hover:text-text-1"
              >
                Undo
              </button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </li>
  );
}

function HistoryRow({
  entry,
  onAnswer,
}: {
  entry: DecisionLogEntry;
  onAnswer: (r: DecisionLogEntry["result"]) => void;
}) {
  const pending = entry.result === "pending";
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-6 py-3 first:border-t-0">
      <ToolMark name={entry.toolName} />
      <span className={cn("flex-1 truncate text-text-1", pending ? "min-w-[9rem]" : "min-w-0")}>
        {entry.summary}
      </span>
      {pending ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[13px] text-lavender">Did it help?</span>
          <button
            type="button"
            onClick={() => onAnswer("helped")}
            aria-label="Yes, it helped"
            className="grid size-7 place-items-center rounded-md border border-line text-text-2 transition-colors hover:text-text-1"
          >
            <Check size={12} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => onAnswer("no_change")}
            aria-label="No change"
            className="grid size-7 place-items-center rounded-md border border-line text-text-2 transition-colors hover:text-text-1"
          >
            <X size={12} weight="bold" />
          </button>
        </span>
      ) : (
        <>
          <span className="tnum hidden shrink-0 text-[13px] text-text-3 sm:inline">
            {formatShortDate(entry.decidedOn)}
          </span>
          <span
            className={cn(
              "w-[72px] shrink-0 text-right text-[13px]",
              entry.result === "helped" ? "text-lime" : "text-text-3",
            )}
          >
            {RESULT[entry.result]}
          </span>
        </>
      )}
    </li>
  );
}
