"use client";

import { useState } from "react";
import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import { Tag } from "@/components/kit/tag";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "/cursor renewal",
  "/cheaper debugging setup",
  "/overlap in coding",
];

// TODO(api): POST /api/ask -> Vultr Serverless Inference via the control plane.
// Until then: canned answers from sample data, clearly labelled.
function sampleAnswer(q: string) {
  const s = q.toLowerCase();
  if (s.includes("cursor") || s.includes("renew"))
    return "Cursor Pro renews Nov 14 for $20. Your last comparison kept it: 3 of 3 runs passed vs 2 of 3 for Windsurf.";
  if (s.includes("cheap") || s.includes("save"))
    return "Windsurf could save about $60 a year on debugging. It missed 1 of 3 runs, so it isn't a clear win yet.";
  if (s.includes("overlap") || s.includes("coding"))
    return "Cursor and GitHub Copilot both cover coding. Together they cost $28.33 a month.";
  return "In the live app this is answered by Wallio's AI, with sources from your stack.";
}

/** Inline question box that sits at the bottom of a chart panel. */
export function AskBar() {
  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const submit = (q: string) => {
    if (!q.trim()) return;
    setAnswer(sampleAnswer(q));
  };

  return (
    <div className="border-t border-line bg-surface-2/60 px-5 pt-4 pb-5">
      <p className="mb-3 flex items-center gap-2 text-[14px] text-text-2">
        <Sparkle
          size={16}
          weight="fill"
          className="text-lavender"
          aria-hidden="true"
        />
        What would you like to know about your AI?
      </p>

      <form
        className="flex h-12 items-center gap-2 rounded-[12px] border border-line-strong bg-bg pr-1.5 pl-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <label htmlFor="ask-wallio" className="sr-only">
          Ask Wallio
        </label>
        <input
          id="ask-wallio"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Is there a cheaper setup for debugging?"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-1 outline-none placeholder:text-text-3"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={!value.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-lime text-ink transition-opacity disabled:opacity-30"
        >
          <ArrowUp size={16} weight="bold" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setValue(s.slice(1));
              submit(s);
            }}
            className="rounded-[6px] bg-lime-tint px-2 py-1 font-mono text-[12px] text-lime transition-opacity hover:opacity-80"
          >
            {s}
          </button>
        ))}
      </div>

      {answer && (
        <p
          className={cn(
            "mt-4 flex items-start gap-3 text-[14px] leading-[21px] text-text-1",
          )}
          role="status"
        >
          <Tag kind="sample" className="mt-0.5" />
          {answer}
        </p>
      )}
    </div>
  );
}
