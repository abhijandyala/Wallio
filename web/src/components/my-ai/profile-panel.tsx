"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GithubLogo, PencilSimple } from "@phosphor-icons/react";
import type { ProfileField } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What Wallio knows: guesses waiting for a yes or no, then the facts you've confirmed.
 * Every save is a new profile version; recommendations pin the version they used.
 * TODO(api): POST /api/profile/versions on confirm, remove and edit.
 */
export function ProfilePanel({
  fields,
  version,
  savedNote,
  onConfirm,
  onRemove,
  onEdit,
}: {
  fields: ProfileField[];
  version: number;
  /** Shown after a save, e.g. "Saved as version 4. Discover will re-rank." */
  savedNote: string | null;
  onConfirm: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, value: string) => void;
}) {
  const reduce = useReducedMotion();
  const pending = fields.filter((f) => f.source === "inferred" && f.status === "pending");
  const known = fields.filter((f) => !(f.source === "inferred" && f.status === "pending"));

  return (
    <Panel
      title="What Wallio knows about you"
      titleAddon={
        <span className="tnum text-[13px] font-normal text-text-3">Version {version}</span>
      }
      className="h-full"
    >
      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.section
            key="review"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.24 }}
            className="overflow-hidden"
          >
            <ul className="mb-gutter grid gap-gutter md:grid-cols-2">
              <AnimatePresence initial={false}>
                {pending.map((f) => (
                  <motion.li
                    key={f.id}
                    layout={!reduce}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    className="flex flex-col gap-3 rounded-[16px] border border-lavender/30 bg-lavender-tint px-5 py-4"
                  >
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-text-2">{f.label}</span>
                      <span
                        className="flex shrink-0 items-center gap-1.5 text-text-3"
                        title={f.inferredFrom ?? undefined}
                      >
                        <GithubLogo size={13} aria-hidden="true" />
                        Guess{f.confidence && `, ${f.confidence}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[17px] font-medium text-text-1">{f.value}</span>
                      <span className="flex gap-1">
                        <Button variant="secondary" size="sm" onClick={() => onConfirm(f.id)}>
                          That&rsquo;s right
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onRemove(f.id)}>
                          Remove
                        </Button>
                      </span>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2">
        {known.map((f, i) => (
          <Fact
            key={f.id}
            field={f}
            wide={i === known.length - 1 && known.length % 2 === 1}
            onSave={(v) => onEdit(f.id, v)}
          />
        ))}
      </dl>

      <AnimatePresence>
        {savedNote && (
          <motion.p
            key={savedNote}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-center gap-2 text-[13px] text-text-2"
            role="status"
          >
            <span className="size-1.5 rounded-[1px] bg-lime" aria-hidden="true" />
            {savedNote}
          </motion.p>
        )}
      </AnimatePresence>
    </Panel>
  );
}

/** One fact. Click to edit in place. The square says where it came from: you, or a confirmed guess. */
function Fact({
  field,
  wide,
  onSave,
}: {
  field: ProfileField;
  wide: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const stated = field.source === "stated";
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== field.value) onSave(draft.trim());
    setDraft(null);
  };

  return (
    <div className={cn("group bg-surface-1 px-5 py-4", wide && "sm:col-span-2")}>
      <dt className="flex items-center gap-2 text-[13px] text-text-3">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-[1px]",
            stated ? "bg-text-2" : "border border-lavender bg-transparent",
          )}
        />
        <span title={stated ? "You said" : "A guess you confirmed"}>{field.label}</span>
      </dt>
      {editing ? (
        <dd className="mt-1.5 flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setDraft(null);
            }}
            aria-label={field.label}
            className="h-9 min-w-0 flex-1 rounded-[8px] border border-line-strong bg-bg px-3 text-[14px] text-text-1 outline-none focus:border-lavender/60"
          />
          <Button variant="secondary" size="sm" onClick={commit}>
            Save
          </Button>
        </dd>
      ) : (
        <dd className="mt-1">
          <button
            type="button"
            onClick={() => setDraft(field.value)}
            className="flex w-full items-center justify-between gap-3 rounded-md text-left text-[15px] text-text-1"
          >
            <span className="min-w-0">{field.value}</span>
            <PencilSimple
              size={13}
              className="shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
            <span className="sr-only">Edit {field.label}</span>
          </button>
        </dd>
      )}
    </div>
  );
}
