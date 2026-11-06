"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, X } from "@phosphor-icons/react";
import type { DataSource, Subscription } from "@/lib/types";
import { formatShortDate } from "@/lib/format";
import { ToolMark } from "@/components/kit/tool-mark";
import { Segmented } from "@/components/kit/segmented";
import { Button } from "@/components/ui/button";

type Draft = {
  toolName: string;
  category: string;
  plan: string;
  price: string; // dollars as typed, for the billing cadence
  cadence: "monthly" | "annual";
  renewsOn: string;
  status: Subscription["status"];
};

const toDraft = (s: Subscription | null, preset?: string): Draft => ({
  toolName: s?.toolName ?? preset ?? "",
  category: s?.category ?? "",
  plan: s?.plan ?? "",
  price: s?.renewalCents != null ? (s.renewalCents / 100).toFixed(2) : "",
  cadence: s?.cadence === "annual" ? "annual" : "monthly",
  renewsOn: s?.renewsOn ?? "",
  status: s?.status ?? "active",
});

/**
 * Side sheet to add or edit a tool.
 * TODO(api): POST/PATCH /api/inventory. The backend computes the monthly equivalent;
 * the value computed here is only for the local preview.
 */
export function ToolDrawer({
  open,
  tool,
  presetName,
  onClose,
  onSave,
  onRemove,
}: {
  open: boolean;
  tool: Subscription | null; // null = adding
  /** When adding from a suggestion, the tool name to start with. */
  presetName?: string;
  onClose: () => void;
  onSave: (s: Subscription) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <DrawerBody
          key={tool?.id ?? `new-${presetName ?? ""}`}
          tool={tool}
          presetName={presetName}
          onClose={onClose}
          onSave={onSave}
          onRemove={onRemove}
        />
      )}
    </AnimatePresence>
  );
}

function DrawerBody({
  tool,
  presetName,
  onClose,
  onSave,
  onRemove,
}: {
  tool: Subscription | null;
  presetName?: string;
  onClose: () => void;
  onSave: (s: Subscription) => void;
  onRemove: (id: string) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(tool, presetName));
  const first = useRef<HTMLInputElement>(null);
  const adding = tool === null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const t = setTimeout(() => first.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const cents =
    d.price.trim() === "" ? null : Math.round(parseFloat(d.price) * 100);
  const valid =
    d.toolName.trim() !== "" && (cents === null || Number.isFinite(cents));

  const save = () => {
    if (!valid) return;
    const renewal = cents !== null && Number.isFinite(cents) ? cents : null;
    onSave({
      id: tool?.id ?? `sub_${Date.now()}`,
      toolName: d.toolName.trim(),
      category: d.category.trim() || "Other",
      plan: d.plan.trim() || "Unknown",
      renewalCents: renewal,
      monthlyCents:
        renewal === null
          ? null
          : d.cadence === "annual"
            ? Math.round(renewal / 12)
            : renewal,
      cadence: renewal === null ? "unknown" : d.cadence,
      renewsOn: d.renewsOn || null,
      source: tool?.source ?? "manual",
      status: d.status,
      overlapsWith: tool?.overlapsWith ?? [],
      lastCheckedOn: tool?.lastCheckedOn ?? null,
      manageUrl: tool?.manageUrl ?? null,
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-bg/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={adding ? "Add a tool" : `Edit ${tool.toolName}`}
        className="fixed inset-y-3 right-3 z-[61] flex w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-line-strong bg-surface-1"
        initial={{ x: 40, opacity: 0 }}
        animate={{
          x: 0,
          opacity: 1,
          transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
        }}
        exit={{
          x: 40,
          opacity: 0,
          transition: { duration: 0.18, ease: [0.5, 0, 0.75, 0] },
        }}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-6">
          <span className="flex items-center gap-3">
            {!adding && <ToolMark name={tool.toolName} />}
            <h2 className="text-[16px] font-medium text-text-1">
              {adding ? "Add a tool" : tool.toolName}
            </h2>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-md text-text-3 hover:text-text-1"
          >
            <X size={18} />
          </button>
        </header>

        <form
          className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {!adding && (
            <dl className="-mt-1 flex flex-col rounded-[12px] border border-line text-[13px]">
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-text-3">Added by</dt>
                <dd className="text-text-1">{SOURCE[tool.source]}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-2.5">
                <dt className="text-text-3">Price checked</dt>
                <dd className={tool.lastCheckedOn ? "text-text-1" : "text-text-3"}>
                  {tool.lastCheckedOn
                    ? `${formatShortDate(tool.lastCheckedOn)}, public pricing page`
                    : "Never"}
                </dd>
              </div>
              {tool.manageUrl && (
                <a
                  href={tool.manageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 border-t border-line px-4 py-2.5 text-text-2 transition-colors hover:text-text-1"
                >
                  Manage or cancel on {new URL(tool.manageUrl).host}
                  <ArrowUpRight size={13} />
                </a>
              )}
            </dl>
          )}
          <Field label="Tool">
            <input
              ref={first}
              value={d.toolName}
              onChange={(e) => set("toolName", e.target.value)}
              placeholder="e.g. Cursor"
              className={input}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input
                value={d.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Coding"
                className={input}
              />
            </Field>
            <Field label="Plan">
              <input
                value={d.plan}
                onChange={(e) => set("plan", e.target.value)}
                placeholder="Pro"
                className={input}
              />
            </Field>
          </div>
          <Field label="Billing" group>
            <Segmented
              label="Billing"
              value={d.cadence}
              onChange={(v) => set("cadence", v)}
              options={[
                { id: "monthly", label: "Monthly" },
                { id: "annual", label: "Yearly" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={
                d.cadence === "annual" ? "Price per year" : "Price per month"
              }
            >
              <span className="relative block">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3">
                  $
                </span>
                <input
                  inputMode="decimal"
                  value={d.price}
                  onChange={(e) =>
                    set("price", e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="Leave blank if unknown"
                  className={`${input} tnum pl-7`}
                />
              </span>
            </Field>
            <Field label="Renews on">
              <input
                type="date"
                value={d.renewsOn}
                onChange={(e) => set("renewsOn", e.target.value)}
                className={`${input} tnum [color-scheme:dark]`}
              />
            </Field>
          </div>
          {!adding && (
            <Field label="Status" group>
              <Segmented
                label="Status"
                value={d.status}
                onChange={(v) => set("status", v)}
                options={[
                  { id: "active", label: "Active" },
                  { id: "paused", label: "Paused" },
                  { id: "archived", label: "Archived" },
                ]}
              />
            </Field>
          )}
          <p className="text-[12px] leading-[18px] text-text-3">
            A blank price stays &ldquo;Unknown&rdquo;. Wallio never counts it as
            $0.
          </p>
        </form>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4">
          {!adding ? (
            <button
              type="button"
              onClick={() => onRemove(tool.id)}
              className="text-[13px] text-text-3 hover:text-danger"
            >
              Remove tool
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!valid} onClick={save}>
              {adding ? "Add tool" : "Save"}
            </Button>
          </span>
        </footer>
      </motion.aside>
    </>
  );
}

const SOURCE: Record<DataSource, string> = {
  manual: "You",
  imported: "Import",
  connector: "A connection",
  sample: "Sample data",
};

const input =
  "h-11 w-full rounded-[10px] border border-line-strong bg-bg px-3 text-[14px] text-text-1 outline-none placeholder:text-text-3 transition-colors focus:border-lavender/60";

/** `group` = a set of buttons (not one input), so it must not be a <label>. */
function Field({
  label,
  group = false,
  children,
}: {
  label: string;
  group?: boolean;
  children: React.ReactNode;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag
      className={
        group ? "flex flex-col items-start gap-2" : "flex flex-col gap-2"
      }
    >
      <span className="text-[13px] text-text-3">{label}</span>
      {children}
    </Tag>
  );
}
