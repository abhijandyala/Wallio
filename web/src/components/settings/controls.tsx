"use client";

import { useState } from "react";
import { motion, useReducedMotionConfig } from "motion/react";
import { CaretDown, LockSimple, Plus, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Settings building blocks. Every row is one line: a label on the left, its control on the right.
 * Fixed safety rules show a lock; anything that needs the backend says "Coming later" and is disabled.
 */

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 items-center px-6">
        <h2 className="text-[15px] font-medium text-text-1">{title}</h2>
      </header>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

/** A small label inside a section, e.g. "Always on". */
export function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">
      <p className="px-6 pt-4 pb-1 text-[13px] text-text-3">{label}</p>
      {children}
    </div>
  );
}

export function Row({
  label,
  children,
  htmlFor,
  stack = false,
  inline = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  /** Put the control under the label (for wide controls like chip lists). */
  stack?: boolean;
  /** Keep label and control on one line even on phones (switches, small buttons). */
  inline?: boolean;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div
      className={cn(
        "flex min-h-14 gap-x-6 gap-y-3 border-t border-line px-6 py-3 first:border-t-0",
        stack
          ? "flex-col"
          : inline
            ? "flex-row items-center justify-between"
            : "flex-col sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <Label htmlFor={htmlFor} className="min-w-0 text-text-1">
        {label}
      </Label>
      {/* Wide switches scroll sideways inside the row on phones instead of widening the page. */}
      <div
        className={cn(
          "flex max-w-full min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          stack ? "flex-wrap" : "flex-nowrap",
          !stack && "sm:justify-end",
          inline && "shrink-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A safety rule the server enforces. Shown so people know it exists; not changeable. */
export function FixedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-t border-line px-6 py-3 first:border-t-0 sm:gap-6">
      <span className="min-w-0 flex-1 text-text-2">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-right text-[13px] text-text-1">
        {value}
        <LockSimple size={12} className="shrink-0 text-text-3" aria-label="Fixed" />
      </span>
    </div>
  );
}

/** Needs the backend or an integration. Visible so the plan is honest, but disabled. */
export function LaterRow({ label }: { label: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 border-t border-line px-6 py-3 first:border-t-0">
      <span className="min-w-0 text-text-3">{label}</span>
      <span className="shrink-0 text-[13px] text-text-3">Coming later</span>
    </div>
  );
}

/** On/off. Square-cornered to match the kit (no pills). */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const reduce = useReducedMotionConfig();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative flex h-6 w-10 shrink-0 items-center rounded-[7px] border p-[3px] transition-colors duration-200 disabled:opacity-40",
        checked ? "justify-end border-lavender bg-lavender" : "justify-start border-line-strong bg-surface-2",
      )}
    >
      <motion.span
        layout={!reduce}
        transition={{ type: "spring", stiffness: 600, damping: 38 }}
        className={cn("size-4 rounded-[4px]", checked ? "bg-ink" : "bg-text-3")}
      />
    </button>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; disabled?: boolean }[];
  label: string;
  id?: string;
}) {
  return (
    <span className="relative inline-flex">
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 max-w-[16rem] appearance-none truncate rounded-md border border-line-strong bg-bg py-0 pr-9 pl-3 text-[14px] text-text-1 outline-none [color-scheme:dark] focus:border-lavender/60"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <CaretDown size={12} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-3" />
    </span>
  );
}

const field =
  "h-9 rounded-md border border-line-strong bg-bg px-3 text-[14px] text-text-1 outline-none placeholder:text-text-3 focus:border-lavender/60";

/** Text that saves when you leave the field or press Enter. Shows an error instead of saving bad input. */
export function TextField({
  value,
  onSave,
  label,
  id,
  validate,
  prefix,
  width = "w-56",
  inputMode,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  id?: string;
  validate?: (v: string) => string | null;
  prefix?: string;
  width?: string;
  inputMode?: "decimal" | "text";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const error = draft !== null && validate ? validate(draft) : null;
  const commit = () => {
    if (draft === null) return;
    if (!error && draft.trim() !== value) onSave(draft.trim());
    if (!error) setDraft(null);
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="relative">
        {prefix && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3">{prefix}</span>
        )}
        <input
          id={id}
          aria-label={label}
          aria-invalid={!!error}
          inputMode={inputMode}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(null);
          }}
          className={cn(field, width, prefix && "pl-7", "tnum", error && "border-danger/60")}
        />
      </span>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}

export function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className={cn(field, "tnum w-32 [color-scheme:dark]")}
    />
  );
}

/** A list of small removable items with an add field. Used for blocked sites and muted providers. */
export function ChipList({
  items,
  onChange,
  placeholder,
  label,
  validate,
  normalize = (v) => v.trim(),
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  label: string;
  validate?: (v: string) => string | null;
  normalize?: (v: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const v = normalize(draft);
    if (!v) return;
    const problem = validate?.(v) ?? (items.includes(v) ? "Already on the list" : null);
    if (problem) return setError(problem);
    onChange([...items, v]);
    setDraft("");
    setError(null);
  };
  return (
    <div className="flex w-full flex-col gap-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <li
              key={it}
              className="flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface-2 pr-1 pl-3 font-mono text-[12px] text-text-1"
            >
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== it))}
                aria-label={`Remove ${it}`}
                className="grid size-6 place-items-center rounded-md text-text-3 transition-colors hover:text-text-1"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <span className="flex flex-col gap-1">
          <input
            aria-label={label}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className={cn(field, "w-64 max-w-full", error && "border-danger/60")}
          />
          {error && <span className="text-[12px] text-danger">{error}</span>}
        </span>
        <button
          type="button"
          onClick={add}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-3 text-[13px] text-text-1 transition-colors hover:bg-surface-3"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

/** Multi-select as a row of toggle buttons (devices you use). */
export function MultiPick({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "h-8 rounded-[8px] border px-3 text-[13px] transition-colors",
              on ? "border-lavender/60 text-text-1" : "border-line text-text-3 hover:text-text-1",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
