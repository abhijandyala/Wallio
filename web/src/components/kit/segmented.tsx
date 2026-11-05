"use client";

import { useId } from "react";
import { motion, useReducedMotionConfig } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A small switcher for filtering one view (not page navigation). Radius 8, never pills.
 * The selected thumb slides between options instead of jumping.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const group = useId();
  const reduce = useReducedMotionConfig();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-surface-1 p-0.5"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative h-8 rounded-[6px] px-3 text-[13px] whitespace-nowrap transition-colors duration-200",
              active ? "text-text-1" : "text-text-3 hover:text-text-1",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-thumb-${group}`}
                className="absolute inset-0 rounded-[6px] bg-surface-3"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
