"use client";

import { motion, useReducedMotion } from "motion/react";
import type { DiscoverData, Match } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { ToolMark } from "@/components/kit/tool-mark";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatScore } from "./match-detail";

/** The ranked shortlist. The selected rank gets the lavender square, which slides between rows. */
export function ShortlistPanel({
  matches,
  selectedId,
  onSelect,
}: {
  matches: Match[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <Panel title="Shortlist" flush>
      {matches.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-text-3">
          Nothing left on the shortlist.
        </p>
      ) : (
        <ol className="border-t border-line">
          {matches.map((m, i) => {
            const active = m.id === selectedId;
            return (
              <li key={m.id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  aria-pressed={active}
                  className="group flex h-16 w-full items-center gap-4 px-6 text-left"
                >
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-[8px] bg-surface-2">
                    {active && (
                      <motion.span
                        layoutId="discover-rank"
                        className="absolute inset-0 rounded-[8px] bg-lavender"
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 480, damping: 38 }
                        }
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
                      active
                        ? "text-text-1"
                        : "text-text-2 group-hover:text-text-1",
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
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

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
        <p className="border-t border-line px-6 py-5 text-text-3">
          Nothing was ruled out.
        </p>
      ) : (
        <ul className="border-t border-line">
          {passed.map((m) => (
            <li
              key={m.id}
              className="flex h-14 items-center gap-3 border-t border-line px-6 first:border-t-0"
            >
              <ToolMark name={m.toolName} />
              <span className="min-w-0 flex-1 truncate text-text-2">
                {m.toolName}
              </span>
              <span className="shrink-0 text-[13px] text-text-3">
                You passed
              </span>
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
              <span className="min-w-0 flex-1 text-right text-[13px] text-text-3">
                {x.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** How the shortlist was built. The research itself runs in the sandboxed browser. */
export function HowRankedPanel({
  research,
}: {
  research: DiscoverData["research"][number] | undefined;
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
          {research ? formatShortDate(research.researchedOn) : "Never"}
        </KeyValueRow>
        <KeyValueRow label="Paid placements">Never ranked</KeyValueRow>
      </KeyValue>
    </Panel>
  );
}
