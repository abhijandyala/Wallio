"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Question, X } from "@phosphor-icons/react";
import type {
  Evidence,
  FitComponent,
  FitComponentKey,
  Match,
  RequirementCheck,
} from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { ToolMark } from "@/components/kit/tool-mark";
import { Tag } from "@/components/kit/tag";
import { Money } from "@/components/kit/money";
import { ButtonLink } from "@/components/kit/button-link";
import { Button } from "@/components/ui/button";
import { hatch } from "@/components/kit/charts";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const LABEL: Record<FitComponentKey, string> = {
  workflow: "Workflow quality",
  features: "Features",
  cost: "Cost",
  privacy: "Privacy",
  switching: "Easy to switch",
};

export const formatScore = (s: Match["score"]) =>
  s.low === s.high ? `${s.low}` : `${s.low}–${s.high}`;

/** Everything about one match: the summary, the requirement check, and where each claim came from. */
export function MatchDetail({
  match,
  onDismiss,
}: {
  match: Match;
  onDismiss: () => void;
}) {
  const tested = match.evidence === "tested";
  const met = match.requirements.filter((r) => r.status === "met").length;

  return (
    <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
      <section className="flex flex-col rounded-[20px] border border-line bg-surface-1 md:col-span-2">
        <header className="flex items-center gap-4 px-6 pt-6">
          <ToolMark name={match.toolName} size="lg" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="truncate text-[20px] leading-7 font-medium text-text-1">
              {match.toolName}
            </h2>
            <Tag kind={match.evidence} />
          </div>
          <span className="display shrink-0 text-[28px] leading-8 font-medium text-text-1">
            {match.monthlyCents === 0 ? (
              "Free"
            ) : (
              <>
                <Money cents={match.monthlyCents} dropCents />
                <span className="ml-1 text-[14px] font-normal tracking-normal text-text-3">
                  /mo
                </span>
              </>
            )}
          </span>
        </header>

        <div className="grid gap-x-10 gap-y-6 px-6 py-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <p className="text-[13px] text-text-3">
              {match.score.low === match.score.high ? "Fit score" : "Fit range"}
            </p>
            <p className="display mt-1 text-[44px] leading-[48px] font-medium text-text-1">
              {formatScore(match.score)}
              <span className="ml-1 text-[14px] font-normal tracking-normal text-text-3">
                /100
              </span>
            </p>
          </div>
          <ScoreBreakdown components={match.components} />
        </div>

        <dl className="border-t border-line">
          <ReasonRow label="Fits because">{match.fit}</ReasonRow>
          <ReasonRow label="Watch out" quiet>
            {match.risk}
          </ReasonRow>
          <ReasonRow label="Verified" quiet>
            {match.verified}
          </ReasonRow>
        </dl>

        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-5">
          {match.comparesTo && (
            <ButtonLink
              href={
                tested
                  ? "/compare?view=results"
                  : `/compare?workflow=${match.workflowId}&tools=${encodeURIComponent(`${match.comparesTo},${match.toolName}`)}`
              }
              variant="primary"
            >
              {tested ? "See the comparison" : `Compare with ${match.comparesTo}`}
              <ArrowRight size={16} weight="bold" />
            </ButtonLink>
          )}
          <Button variant="ghost" onClick={onDismiss}>
            Not for me
          </Button>
          {match.comparesTo && !tested && (
            <span className="ml-auto hidden text-[13px] text-text-3 lg:block">
              Runs one real task on both, in a sandbox
            </span>
          )}
        </footer>
      </section>

      <Panel
        title="Your requirements"
        titleAddon={
          <span className="tnum text-[13px] font-normal text-text-3">
            {met} of {match.requirements.length}
          </span>
        }
        flush
      >
        <dl className="border-t border-line">
          {match.requirements.map((r) => (
            <RequirementRow key={r.label} req={r} />
          ))}
        </dl>
      </Panel>

      <Panel
        title="Sources"
        titleAddon={
          <span className="tnum text-[13px] font-normal text-text-3">
            {match.sources.length}
          </span>
        }
        flush
      >
        <ul className="border-t border-line">
          {match.sources.map((e) => (
            <SourceRow key={e.id} ev={e} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/** A label and a sentence. Side by side on wide screens, stacked on phones so sentences don't ragged-wrap. */
function ReasonRow({
  label,
  quiet = false,
  children,
}: {
  label: string;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 flex-col gap-1 border-t border-line px-6 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-text-3">{label}</dt>
      <dd className={cn("min-w-0 sm:text-right", quiet ? "text-text-2" : "text-text-1")}>
        {children}
      </dd>
    </div>
  );
}

/** The five weighted parts of the score. Unknown parts are hatched, never filled in. */
function ScoreBreakdown({ components }: { components: FitComponent[] }) {
  const reduce = useReducedMotion();
  return (
    <ul className="flex flex-col justify-center gap-3">
      {components.map((c, i) => (
        <li
          key={c.key}
          className="grid grid-cols-[minmax(0,1fr)_2.25rem_3.5rem] items-center gap-x-3 gap-y-2 text-[13px] sm:grid-cols-[minmax(0,9.5rem)_2.25rem_minmax(0,1fr)_3.5rem]"
        >
          <span className="truncate text-text-2">{LABEL[c.key]}</span>
          <span className="tnum text-text-3">{c.weight}%</span>
          {/* Phones: the bar drops to its own line under the label so it never collapses. */}
          <span className="relative order-last col-span-3 h-2 overflow-hidden rounded-[3px] bg-surface-3 sm:order-none sm:col-span-1">
            {c.score === null ? (
              <span
                className="absolute inset-0"
                style={{ backgroundImage: hatch("rgba(173,150,241,0.35)", 6) }}
              />
            ) : (
              <motion.span
                className="absolute inset-y-0 left-0 rounded-[3px] bg-lavender"
                initial={{ width: reduce ? `${c.score}%` : 0 }}
                animate={{ width: `${c.score}%` }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 + i * 0.05 }
                }
              />
            )}
          </span>
          <span
            className={cn(
              "tnum text-right",
              c.score === null ? "text-text-3" : "text-text-1",
            )}
          >
            {c.score === null ? "Unknown" : c.score}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RequirementRow({ req }: { req: RequirementCheck }) {
  const Icon =
    req.status === "met" ? Check : req.status === "missing" ? X : Question;
  const met = req.status === "met";
  // Stacked on phones (like the reasons above), one line from sm up. The value never truncates.
  return (
    <div className="flex min-h-12 flex-col gap-1 border-t border-line px-6 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="min-w-0 flex-1 text-text-3">{req.label}</dt>
      <dd className="flex shrink-0 items-center justify-between gap-3">
        <span className={met ? "text-text-1" : "text-text-3"}>{req.detail}</span>
        <Icon
          size={14}
          weight="bold"
          aria-label={req.status}
          className={cn("shrink-0", met ? "text-text-1" : "text-text-3")}
        />
      </dd>
    </div>
  );
}

function SourceRow({ ev }: { ev: Evidence }) {
  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-[1px]",
          ev.kind === "tested" ? "bg-lime" : "bg-lavender",
        )}
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-text-1">{ev.title}</span>
        {ev.limitation && (
          <span className="text-text-3"> · {ev.limitation}</span>
        )}
      </span>
      <span className="shrink-0 text-[13px] text-text-3">
        <span className="hidden sm:inline">{ev.source} · </span>
        {formatShortDate(ev.capturedAt.slice(0, 10))}
      </span>
    </li>
  );
}
