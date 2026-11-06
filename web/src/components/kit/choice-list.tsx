"use client";

import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Selectable one-line rows backed by native radio/checkbox inputs.
 * Use inside a flush Panel. `meta` is a short right-side note (e.g. "In your stack").
 */
export function ChoiceList<T extends string>({
  name,
  type,
  options,
  value,
  onChange,
  legend,
  max,
}: {
  name: string;
  type: "radio" | "checkbox";
  options: { id: T; label: string; meta?: string; icon?: React.ReactNode }[];
  value: T[];
  onChange: (next: T[]) => void;
  legend: string;
  /** For checkboxes: maximum selections. */
  max?: number;
}) {
  const toggle = (id: T) => {
    if (type === "radio") return onChange([id]);
    if (value.includes(id)) return onChange(value.filter((v) => v !== id));
    if (max && value.length >= max) return;
    onChange([...value, id]);
  };

  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => {
        const checked = value.includes(o.id);
        const disabled =
          type === "checkbox" && !checked && !!max && value.length >= max;
        return (
          <label
            key={o.id}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 border-t border-line px-6 py-3 first:border-t-0",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            <input
              type={type}
              name={name}
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(o.id)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "grid size-[18px] shrink-0 place-items-center border transition-colors",
                type === "radio" ? "rounded-[5px]" : "rounded-[4px]",
                checked
                  ? "border-lavender bg-lavender text-ink"
                  : "border-line-strong",
              )}
            >
              {checked &&
                (type === "radio" ? (
                  <span className="size-2 rounded-[2px] bg-ink" />
                ) : (
                  <Check size={11} weight="bold" />
                ))}
            </span>
            {o.icon}
            <span
              className={cn(
                "min-w-0 flex-1",
                checked ? "text-text-1" : "text-text-2",
              )}
            >
              {o.label}
            </span>
            {o.meta && (
              <span className="shrink-0 text-[13px] text-text-3">{o.meta}</span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
