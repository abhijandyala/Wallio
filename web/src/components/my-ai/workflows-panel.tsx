"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, Plus, X } from "@phosphor-icons/react";
import type { Workflow } from "@/lib/types";
import { ToolMark } from "@/components/kit/tool-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The user's workflows, most important first, with the tools they use for each.
 * Discover and Compare rank against these, so editing them re-ranks both.
 * TODO(api): save through POST /api/profile/versions (workflows are part of the profile version).
 */
export function WorkflowsPanel({
  workflows,
  tools,
  onSave,
}: {
  workflows: Workflow[];
  /** Tool names in the stack, offered when assigning tools to a workflow. */
  tools: string[];
  onSave: (next: Workflow[]) => void;
}) {
  const reduce = useReducedMotion();
  const sorted = [...workflows].sort((a, b) => a.priority - b.priority);
  const [draft, setDraft] = useState<Workflow[] | null>(null);
  const editing = draft !== null;

  const move = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const next = [...d];
      const j = i + by;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const patch = (i: number, w: Partial<Workflow>) =>
    setDraft((d) => d && d.map((x, k) => (k === i ? { ...x, ...w } : x)));
  const toggleTool = (i: number, t: string) =>
    setDraft(
      (d) =>
        d &&
        d.map((x, k) =>
          k !== i
            ? x
            : {
                ...x,
                tools: x.tools?.includes(t)
                  ? x.tools.filter((n) => n !== t)
                  : [...(x.tools ?? []), t],
              },
        ),
    );

  const save = () => {
    if (!draft) return;
    onSave(
      draft
        .filter((w) => w.name.trim())
        .map((w, i) => ({ ...w, name: w.name.trim(), priority: i + 1 })),
    );
    setDraft(null);
  };

  const rows = draft ?? sorted;

  return (
    <section className="flex flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-6">
        <h2 className="text-[15px] font-medium text-text-1">Your workflows</h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setDraft(sorted)}
            className="rounded-md text-[13px] text-text-3 transition-colors hover:text-text-1"
          >
            Edit
          </button>
        )}
      </header>

      <ol className="border-t border-line">
        <AnimatePresence initial={false}>
          {rows.map((w, i) => (
            <motion.li
              key={w.id}
              layout={!reduce}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-3 border-t border-line px-6 py-4 first:border-t-0"
            >
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "display grid size-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-medium",
                    i === 0 ? "bg-lavender text-ink" : "bg-surface-2 text-text-2",
                  )}
                >
                  {i + 1}
                </span>
                {editing ? (
                  <>
                    <input
                      value={w.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                      aria-label={`Workflow ${i + 1} name`}
                      placeholder="Name this workflow"
                      className="h-9 min-w-0 flex-1 rounded-[8px] border border-line-strong bg-bg px-3 text-[14px] text-text-1 outline-none placeholder:text-text-3 focus:border-lavender/60"
                    />
                    <span className="flex shrink-0 items-center">
                      <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ArrowUp size={13} />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        onClick={() => move(i, 1)}
                        disabled={i === rows.length - 1}
                      >
                        <ArrowDown size={13} />
                      </IconButton>
                      <IconButton
                        label={`Remove ${w.name || "workflow"}`}
                        onClick={() => setDraft((d) => d && d.filter((_, k) => k !== i))}
                      >
                        <X size={13} />
                      </IconButton>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-text-1">
                      {w.name}
                    </span>
                    <span className="flex -space-x-1.5">
                      {(w.tools ?? []).map((t) => (
                        <span key={t} className="rounded-md ring-2 ring-surface-1">
                          <ToolMark name={t} />
                        </span>
                      ))}
                    </span>
                  </>
                )}
              </div>

              {editing && (
                <div className="flex flex-wrap gap-1.5 pl-[52px]">
                  {tools.map((t) => {
                    const on = w.tools?.includes(t) ?? false;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTool(i, t)}
                        aria-pressed={on}
                        title={t}
                        className={cn(
                          "rounded-md transition-opacity duration-150",
                          on ? "opacity-100" : "opacity-30 hover:opacity-60",
                        )}
                      >
                        <ToolMark name={t} />
                        <span className="sr-only">{t}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {editing && (
        <footer className="flex flex-col gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={() =>
              setDraft((d) => [
                ...(d ?? []),
                { id: `wf_${Date.now()}`, name: "", priority: (d?.length ?? 0) + 1, tools: [] },
              ])
            }
            className="flex h-9 items-center gap-2 self-start rounded-md text-[13px] text-text-2 transition-colors hover:text-text-1"
          >
            <Plus size={14} /> Add a workflow
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={save}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <span className="ml-auto text-[12px] text-text-3">Saving re-ranks Discover</span>
          </div>
        </footer>
      )}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 place-items-center rounded-md text-text-3 transition-colors hover:text-text-1 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
