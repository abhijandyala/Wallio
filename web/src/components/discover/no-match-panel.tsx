"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import type { DiscoverData } from "@/lib/types";
import { ToolMark } from "@/components/kit/tool-mark";
import { ButtonLink } from "@/components/kit/button-link";
import { cn } from "@/lib/utils";

/** "Nothing beats what you have" is a real answer. Shows the current tool against the closest alternatives. */
export function NoMatchPanel({
  result,
  workflowName,
  checked,
}: {
  result: DiscoverData["noBetterMatch"][number];
  workflowName: string;
  checked: number | undefined;
}) {
  const reduce = useReducedMotionConfig();
  const rows = [
    { toolName: result.currentTool, score: result.currentScore, reason: "In your stack", current: true },
    ...result.closest.map((c) => ({ ...c, current: false })),
  ];

  return (
    <section className="flex flex-col rounded-[20px] border border-line bg-surface-1">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-4">
          <ToolMark name={result.currentTool} size="lg" />
          <h2 className="display text-[24px] leading-[30px] font-medium text-text-1">
            Keep {result.currentTool} for {workflowName}
          </h2>
        </div>
        <p className="mt-3 text-[15px] leading-[22px] text-text-2">
          {checked
            ? `We checked ${checked} tools against your requirements. None scored higher than what you have.`
            : "None of the tools we checked scored higher than what you have."}
        </p>
      </div>

      <ul className="flex flex-col gap-4 px-6 py-8">
        {rows.map((r, i) => (
          <li
            key={r.toolName}
            className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)_2.5rem_minmax(0,13rem)]"
          >
            <ToolMark name={r.toolName} />
            <span className={cn("truncate", r.current ? "text-text-1" : "text-text-2")}>
              {r.toolName}
            </span>
            {/* Phones: the bar takes its own line under the name. */}
            <span className="relative order-last col-span-2 col-start-2 h-3 overflow-hidden rounded-[4px] bg-surface-3 sm:order-none sm:col-span-1 sm:col-start-auto">
              <motion.span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-[4px]",
                  r.current ? "bg-aurora" : "bg-[#255b56]",
                )}
                initial={{ width: reduce ? `${r.score}%` : 0 }}
                animate={{ width: `${r.score}%` }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 + i * 0.06 }
                }
              />
            </span>
            <span className={cn("tnum text-right", r.current ? "text-text-1" : "text-text-3")}>
              {r.score}
            </span>
            <span className="hidden truncate text-[13px] text-text-3 sm:block">
              {r.reason}
            </span>
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-line px-6 py-5">
        <ButtonLink href="/compare" variant="secondary">
          Compare anyway
        </ButtonLink>
        <span className="ml-auto hidden text-[13px] text-text-3 lg:block">
          We&apos;ll tell you if a new tool or price change moves this
        </span>
      </footer>
    </section>
  );
}
