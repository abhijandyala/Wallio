"use client";

import { Plus } from "@phosphor-icons/react";
import { ToolMark } from "@/components/kit/tool-mark";

const COMMON = ["ChatGPT", "Claude", "Cursor", "GitHub Copilot", "Perplexity", "Midjourney"];

/** First run, or after removing everything: pick a common tool or add your own. */
export function ToolsEmpty({ onAdd }: { onAdd: (name?: string) => void }) {
  return (
    <section className="flex flex-col gap-6 rounded-[20px] border border-line bg-surface-1 p-6 sm:p-8">
      <div>
        <h2 className="display text-[24px] leading-[30px] font-medium text-text-1">
          Add the AI tools you pay for
        </h2>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-[22px] text-text-2">
          Start with one. A price you don&apos;t know stays Unknown, never $0.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {COMMON.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAdd(t)}
            className="group flex h-14 items-center gap-3 rounded-[12px] border border-line px-4 text-left transition-colors"
          >
            <ToolMark name={t} />
            <span className="min-w-0 flex-1 truncate text-text-2 transition-colors group-hover:text-text-1">
              {t}
            </span>
            <Plus size={14} className="text-text-3 transition-colors group-hover:text-text-1" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAdd()}
          className="flex h-14 items-center gap-3 rounded-[12px] border border-dashed border-line-strong px-4 text-left text-text-3 transition-colors hover:text-text-1 sm:col-span-2"
        >
          <span className="grid size-7 place-items-center rounded-md bg-surface-2">
            <Plus size={14} />
          </span>
          Something else
        </button>
      </div>
    </section>
  );
}
