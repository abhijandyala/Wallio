"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { ArrowRight, CaretRight, Check, Question, X } from "@phosphor-icons/react";
import type {
  AccessMode,
  Evidence,
  FitComponent,
  FitComponentKey,
  Match,
  RequirementCheck,
  SavingsScenario,
  Statement,
} from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { ToolMark } from "@/components/kit/tool-mark";
import { Tag } from "@/components/kit/tag";
import { Money } from "@/components/kit/money";
import { ButtonLink } from "@/components/kit/button-link";
import { hatch } from "@/components/kit/charts";
import { formatMoney, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const LABEL: Record<FitComponentKey, string> = {
  workflow: "Workflow quality",
  features: "Features",
  cost: "Cost",
  privacy: "Privacy",
  switching: "Easy to switch",
};

export const formatScore = (s: Match["score"]) =>
  s.low === s.high ? `${s.low}` : `${s.low}–${s.high}`;

/** The three ways a claim can be established. Visiting a page never counts as a test. */
export function AccessTag({ mode }: { mode: AccessMode }) {
  return mode === "researched" ? (
    <Tag kind="researched" />
  ) : (
    <Tag kind="tested">
      {mode === "tested_owned_demo" ? "Tested in owned demo" : "Tested via integration"}
    </Tag>
  );
}

const money0 = (c: number) => formatMoney(Math.abs(c)).replace(/\.00$/, "");

/** Everything about one match: summary, why, requirements, and where each claim came from. */
export function MatchDetail({
  match,
  onOpenSource,
}: {
  match: Match;
  onOpenSource: (e: Evidence) => void;
}) {
  const tested = match.accessMode !== "researched";
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
            <AccessTag mode={match.accessMode} />
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

        {match.savings && match.comparesTo && (
          <Savings savings={match.savings} replaces={match.comparesTo} />
        )}

        {match.comparesTo && (
          <footer className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-5">
            <ButtonLink
              // Discover is sample data (there's no research API yet), so every compare goes to
              // the live comparison on the Wallio API, which runs its golden path today.
              href="/compare?live=1"
              variant="primary"
            >
              {tested ? "See a live comparison" : "Run a live comparison"}
              <ArrowRight size={16} weight="bold" />
            </ButtonLink>
            {!tested && (
              <span className="text-[13px] text-text-3">
                Runs a real task on Vultr. The live API compares GitHub Copilot and Zed for now.
              </span>
            )}
          </footer>
        )}
      </section>

      <div className="md:col-span-2">
        <WhyPanel match={match} onOpenSource={onOpenSource} />
      </div>

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
            <SourceRow key={e.id} ev={e} onOpen={() => onOpenSource(e)} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ── Savings: what switching changes, with its assumptions ─────────────── */

function Savings({ savings, replaces }: { savings: SavingsScenario; replaces: string }) {
  const reduce = useReducedMotionConfig();
  const [open, setOpen] = useState(false);
  const d = savings.monthlyDeltaCents;
  const cheaper = d !== null && d < 0;
  const renewal = savings.renewalOn ? formatShortDate(savings.renewalOn) : null;

  return (
    <div className="border-t border-line">
      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <SavingsCell label={`Per month vs ${replaces}`}>
          {d === null ? (
            <span className="text-text-3">Unknown</span>
          ) : d === 0 ? (
            "Same"
          ) : (
            <span className={cheaper ? "text-lime" : "text-text-1"}>
              {cheaper ? "−" : "+"}
              {formatMoney(Math.abs(d))}
            </span>
          )}
        </SavingsCell>
        <SavingsCell label="Cash back now">
          <span className={savings.immediateCents > 0 ? "text-lime" : "text-text-1"}>
            {money0(savings.immediateCents)}
          </span>
        </SavingsCell>
        <SavingsCell label={renewal ? `At the ${renewal} renewal` : "At renewal"}>
          {savings.renewalAvoidanceCents === null ? (
            <span className="text-text-3">Costs more</span>
          ) : (
            <span className="text-lime">
              {money0(savings.renewalAvoidanceCents)}
              <span className="ml-1 text-[13px] font-normal text-text-3">a year</span>
            </span>
          )}
        </SavingsCell>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-line px-6 py-3 text-left text-[13px] text-text-3 transition-colors hover:text-text-1"
      >
        <CaretRight
          size={11}
          weight="bold"
          className={cn("transition-transform duration-200", open && "rotate-90")}
        />
        Estimate, based on {savings.assumptions.length} assumption
        {savings.assumptions.length === 1 ? "" : "s"}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {savings.assumptions.map((a) => (
              <li key={a} className="px-6 pb-2.5 pl-[43px] text-[13px] text-text-2 last:pb-4">
                {a}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function SavingsCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-4">
      <span className="text-[13px] text-text-3">{label}</span>
      <span className="display tnum text-[22px] leading-7 font-medium">{children}</span>
    </div>
  );
}

/* ── Why: for, against, unsure, needs a test, next step ────────────────── */

type GroupRole = Statement["role"] | "test";
const GROUPS: { role: GroupRole; label: string; mark: string }[] = [
  { role: "supporting", label: "For it", mark: "bg-lime" },
  { role: "counter", label: "Against it", mark: "bg-text-2" },
  { role: "uncertainty", label: "Not sure yet", mark: "border border-aurora" },
  { role: "test", label: "Needs a test", mark: "border border-text-3" },
  { role: "next_step", label: "Next step", mark: "bg-aurora" },
];

function WhyPanel({
  match,
  onOpenSource,
}: {
  match: Match;
  onOpenSource: (e: Evidence) => void;
}) {
  const byId = new Map(match.sources.map((s) => [s.id, s]));
  const rows: { role: GroupRole; text: string; refs: React.ReactNode }[] = [];
  for (const g of GROUPS) {
    if (g.role === "test") {
      match.needsTesting.forEach((t) => rows.push({ role: "test", text: t, refs: null }));
      continue;
    }
    match.statements
      .filter((s) => s.role === g.role)
      .forEach((s) =>
        rows.push({
          role: g.role,
          text: s.text,
          refs: (
            <>
              {s.sourceIds.map((id) => {
                const e = byId.get(id);
                return e ? (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenSource(e)}
                    className="rounded-md text-[12px] text-text-3 underline-offset-4 transition-colors hover:text-text-1 hover:underline"
                  >
                    {e.source}
                  </button>
                ) : null;
              })}
              {s.userInputs?.length ? (
                <span className="text-[12px] text-text-3">You said</span>
              ) : null}
            </>
          ),
        }),
      );
  }

  return (
    <Panel title="Why" flush>
      <ul className="border-t border-line">
        {rows.map((r, i) => {
          const g = GROUPS.find((x) => x.role === r.role)!;
          const firstOfGroup = i === 0 || rows[i - 1].role !== r.role;
          return (
            <li
              key={`${r.role}-${r.text}`}
              className={cn(
                "grid grid-cols-1 items-start gap-x-4 gap-y-1 px-6 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center",
                firstOfGroup && i > 0 && "border-t border-line",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-2 text-[13px] text-text-2",
                  !firstOfGroup && "invisible max-sm:hidden",
                )}
              >
                <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-[1px]", g.mark)} />
                {g.label}
              </span>
              <span className={r.role === "counter" ? "text-text-2" : "text-text-1"}>
                {r.text}
              </span>
              <span className="flex flex-wrap gap-x-3 sm:justify-end">
                {r.refs}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Score breakdown, requirements, sources ────────────────────────────── */

/** The five weighted parts of the score. Unknown parts are hatched, never filled in. */
function ScoreBreakdown({ components }: { components: FitComponent[] }) {
  const reduce = useReducedMotionConfig();
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
                style={{ backgroundImage: hatch("rgba(132,216,207,0.35)", 6) }}
              />
            ) : (
              <motion.span
                className="absolute inset-y-0 left-0 rounded-[3px] bg-aurora"
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
          <span className={cn("tnum text-right", c.score === null ? "text-text-3" : "text-text-1")}>
            {c.score === null ? "Unknown" : c.score}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RequirementRow({ req }: { req: RequirementCheck }) {
  const Icon = req.status === "met" ? Check : req.status === "missing" ? X : Question;
  const met = req.status === "met";
  // Stacked on phones, one line from sm up. The value never truncates.
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

/** A source row opens its capture. The limitation is the important part, so it wraps instead of truncating. */
function SourceRow({ ev, onOpen }: { ev: Evidence; onOpen: () => void }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-h-12 w-full items-center gap-3 px-6 py-3 text-left"
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-[1px]", ev.kind === "tested" ? "bg-lime" : "bg-aurora")}
        />
        <span className="min-w-0 flex-1">
          <span className="text-text-1">{ev.title}</span>
          {ev.limitation && <span className="text-text-3"> · {ev.limitation}</span>}
        </span>
        <span className="shrink-0 text-[13px] text-text-3">
          {formatShortDate(ev.capturedAt.slice(0, 10))}
        </span>
        <CaretRight
          size={12}
          className="shrink-0 text-text-3 transition-colors group-hover:text-text-1"
        />
      </button>
    </li>
  );
}
