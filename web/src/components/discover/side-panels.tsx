"use client";

import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { ArrowsClockwise, X } from "@phosphor-icons/react";
import type { DiscoverData, FitComponentKey, Match } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { ToolMark } from "@/components/kit/tool-mark";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LABEL, formatScore } from "./match-detail";

const SPRING = { type: "spring", stiffness: 480, damping: 38 } as const;

/**
 * The ranked shortlist. The selected rank gets the aurora square, which slides between rows,
 * and rows glide when the ranking changes. "Not for me" lives on the row it applies to.
 */
export function ShortlistPanel({
  matches,
  selectedId,
  onSelect,
  onDismiss,
  note,
}: {
  matches: Match[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  /** e.g. "Re-ranked with profile version 4. Copilot moved to 1." */
  note: string | null;
}) {
  const reduce = useReducedMotionConfig();
  return (
    <Panel title="Shortlist" flush>
      {matches.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-text-3">Nothing left on the shortlist.</p>
      ) : (
        <ol className="border-t border-line">
          {matches.map((m, i) => {
            const active = m.id === selectedId;
            return (
              <motion.li
                key={m.id}
                layout={!reduce}
                transition={reduce ? { duration: 0 } : SPRING}
                className="group relative flex items-center border-t border-line bg-surface-1 first:border-t-0"
              >
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  aria-pressed={active}
                  className="flex h-16 min-w-0 flex-1 items-center gap-4 pl-6 text-left"
                >
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-[8px] bg-surface-2">
                    {active && (
                      <motion.span
                        layoutId="discover-rank"
                        className="absolute inset-0 rounded-[8px] bg-aurora"
                        transition={reduce ? { duration: 0 } : SPRING}
                      />
                    )}
                    <span
                      className={cn(
                        "display relative text-[14px] font-medium transition-colors duration-200",
                        active ? "text-ink" : "text-text-2",
                      )}
                    >
                      {i + 1}
                    </span>
                  </span>
                  <ToolMark name={m.toolName} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[15px] transition-colors duration-200",
                      active ? "text-text-1" : "text-text-2 group-hover:text-text-1",
                    )}
                  >
                    {m.toolName}
                  </span>
                  <span
                    className={cn(
                      "tnum shrink-0 text-[14px] transition-colors duration-200",
                      active ? "text-text-1" : "text-text-3",
                    )}
                  >
                    {formatScore(m.score)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(m.id)}
                  aria-label={`Not for me: ${m.toolName}`}
                  title="Not for me"
                  className={cn(
                    "mr-3 ml-1 grid size-8 shrink-0 place-items-center rounded-md text-text-3 transition-[color,opacity] hover:text-text-1",
                    active ? "opacity-100" : "opacity-100 xl:opacity-0 xl:group-hover:opacity-100",
                  )}
                >
                  <X size={13} />
                </button>
              </motion.li>
            );
          })}
        </ol>
      )}
      <AnimatePresence>
        {note && (
          <motion.p
            key={note}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            role="status"
          >
            <span className="flex items-center gap-2 border-t border-line px-6 py-3 text-[13px] text-text-2">
              <span className="size-1.5 shrink-0 rounded-[1px] bg-lime" aria-hidden="true" />
              {note}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </Panel>
  );
}

/* ── Weights ──────────────────────────────────────────────────────────── */

export type Weights = Record<FitComponentKey, number>;
export const DEFAULT_WEIGHTS: Weights = { workflow: 8, features: 4, cost: 3, privacy: 3, switching: 2 };
const KEYS = Object.keys(DEFAULT_WEIGHTS) as FitComponentKey[];

export const weightPct = (w: Weights) => {
  const sum = KEYS.reduce((n, k) => n + w[k], 0) || 1;
  return Object.fromEntries(KEYS.map((k) => [k, Math.round((w[k] / sum) * 100)])) as Weights;
};

/** How much each part of the score counts. Changes preview live; saving makes a new profile version. */
export function WeightsPanel({
  weights,
  open,
  dirty,
  onOpen,
  onChange,
  onSave,
  onReset,
}: {
  weights: Weights;
  open: boolean;
  dirty: boolean;
  onOpen: (open: boolean) => void;
  onChange: (w: Weights) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const reduce = useReducedMotionConfig();
  const pct = weightPct(weights);
  return (
    <section className="flex flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 items-center justify-between gap-4 px-6">
        <h2 className="flex items-center gap-2 text-[15px] font-medium text-text-1">
          What matters most
          {dirty && <span className="text-[13px] font-normal text-aurora">Preview</span>}
        </h2>
        <button
          type="button"
          onClick={() => onOpen(!open)}
          className="rounded-md text-[13px] text-text-3 transition-colors hover:text-text-1"
        >
          {open ? "Done" : "Adjust"}
        </button>
      </header>
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="open"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 border-t border-line px-6 py-5">
              {KEYS.map((k) => (
                <label key={k} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-[13px]">
                  <span className="truncate text-text-2">{LABEL[k]}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={weights[k]}
                    onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) })}
                    className="h-1.5 w-full cursor-pointer accent-aurora"
                  />
                  <span className="tnum text-right text-text-1">{pct[k]}%</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
              <Button variant="secondary" size="sm" onClick={onSave} disabled={!dirty}>
                Save as my weights
              </Button>
              <Button variant="ghost" size="sm" onClick={onReset}>
                Reset to default
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="closed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            className="tnum border-t border-line px-6 py-4 text-[13px] text-text-3"
          >
            {KEYS.map((k, i) => (
              <span key={k}>
                {i > 0 && " · "}
                {LABEL[k].split(" ")[0]} <span className="text-text-1">{pct[k]}</span>
              </span>
            ))}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ── Also checked ─────────────────────────────────────────────────────── */

/** Every other tool the research looked at, and why it ranked lower. */
export function AlsoCheckedPanel({ others }: { others: DiscoverData["others"] }) {
  if (others.length === 0) return null;
  return (
    <Panel
      title="Also checked"
      titleAddon={<span className="tnum text-[13px] font-normal text-text-3">{others.length}</span>}
      flush
    >
      <ul className="border-t border-line">
        {others.map((o) => (
          <li
            key={o.toolName}
            className="flex min-h-14 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0"
          >
            <ToolMark name={o.toolName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-text-2">{o.toolName}</span>
              <span className="block truncate text-[12px] text-text-3">{o.reason}</span>
            </span>
            <span className="tnum shrink-0 text-[14px] text-text-3">{formatScore(o.score)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Filtered out ─────────────────────────────────────────────────────── */

/** Tools a hard requirement ruled out, plus ones the user passed on (with undo). */
export function FilteredOutPanel({
  excluded,
  passed,
  onUndo,
}: {
  excluded: DiscoverData["excluded"];
  passed: Match[];
  onUndo: (id: string) => void;
}) {
  const empty = excluded.length === 0 && passed.length === 0;
  return (
    <Panel title="Filtered out" flush>
      {empty ? (
        <p className="border-t border-line px-6 py-5 text-text-3">Nothing was ruled out.</p>
      ) : (
        <ul className="border-t border-line">
          {passed.map((m) => (
            <li key={m.id} className="flex h-14 items-center gap-3 border-t border-line px-6 first:border-t-0">
              <ToolMark name={m.toolName} />
              <span className="min-w-0 flex-1 truncate text-text-2">{m.toolName}</span>
              <span className="shrink-0 text-[13px] text-text-3">You passed</span>
              <button
                type="button"
                onClick={() => onUndo(m.id)}
                className="shrink-0 rounded-md text-[13px] text-text-2 transition-colors hover:text-text-1"
              >
                Undo
              </button>
            </li>
          ))}
          {excluded.map((x) => (
            <li
              key={x.id}
              className="flex min-h-14 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0"
            >
              <ToolMark name={x.toolName} />
              <span className="shrink-0 text-text-2">{x.toolName}</span>
              <span className="min-w-0 flex-1 text-right text-[13px] text-text-3">{x.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── How this was ranked ──────────────────────────────────────────────── */

/** How the shortlist was built, and the button that re-runs the research in the sandbox. */
export function HowRankedPanel({
  research,
  refreshedToday,
  profileVersion,
  researching,
  onResearch,
}: {
  research: DiscoverData["research"][number] | undefined;
  refreshedToday: boolean;
  profileVersion: number;
  researching: boolean;
  onResearch: () => void;
}) {
  return (
    <Panel title="How this was ranked" flush>
      <KeyValue className="border-t border-line">
        <KeyValueRow label="Tools checked">
          <span className="tnum">{research?.checked ?? "Unknown"}</span>
        </KeyValueRow>
        <KeyValueRow label="Pages read in a sandbox">
          <span className="tnum">{research?.pagesRead ?? "Unknown"}</span>
        </KeyValueRow>
        <KeyValueRow label="Last researched">
          {refreshedToday ? "Today" : research ? formatShortDate(research.researchedOn) : "Never"}
        </KeyValueRow>
        <KeyValueRow label="Profile version">
          <span className="tnum">{profileVersion}</span>
        </KeyValueRow>
        <KeyValueRow label="Paid placements">Never ranked</KeyValueRow>
      </KeyValue>
      <div className="border-t border-line px-6 py-4">
        <Button variant="secondary" size="sm" onClick={onResearch} disabled={researching}>
          <ArrowsClockwise size={14} />
          {researching ? "Researching…" : "Research again"}
        </Button>
      </div>
    </Panel>
  );
}
