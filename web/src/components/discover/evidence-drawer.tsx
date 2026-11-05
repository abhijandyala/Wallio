"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { LockSimple, X } from "@phosphor-icons/react";
import type { Evidence } from "@/lib/types";
import { Tag } from "@/components/kit/tag";
import { hatch } from "@/components/kit/charts";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * One capture, in full: what was seen, where, when, how, and what it can't tell you.
 * TODO(api): GET /api/evidence/{id} and its screenshot from GET /api/evidence/{id}/screenshot.
 */
export function EvidenceDrawer({
  evidence,
  onClose,
}: {
  evidence: Evidence | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    if (!evidence) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [evidence, onClose]);

  return (
    <AnimatePresence>
      {evidence && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[60] bg-bg/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            key={evidence.id}
            role="dialog"
            aria-modal="true"
            aria-label={evidence.title}
            className="fixed inset-y-3 right-3 z-[61] flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-line-strong bg-surface-1"
            initial={{ x: reduce ? 0 : 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: reduce ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ x: reduce ? 0 : 40, opacity: 0, transition: { duration: reduce ? 0 : 0.18 } }}
          >
            <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-6">
              <h2 className="min-w-0 truncate text-[16px] font-medium text-text-1">{evidence.title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-md text-text-3 transition-colors hover:text-text-1"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
              <figure className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-[12px] border border-line bg-bg">
                  <div className="flex h-8 items-center gap-2 border-b border-line px-3">
                    <LockSimple size={11} className="shrink-0 text-text-3" />
                    <span className="truncate font-mono text-[11px] text-text-3">{evidence.source}</span>
                  </div>
                  <div className="flex aspect-[16/10] flex-col gap-3 p-5">
                    <span className="h-3.5 w-2/5 rounded-[3px] bg-white/10" />
                    <span className="h-2.5 w-1/3 rounded-[3px] bg-white/[0.06]" />
                    <div className="mt-1 grid flex-1 grid-cols-3 gap-2">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="rounded-[6px] border border-line"
                          style={{ backgroundImage: hatch("rgba(255,255,255,0.04)", 6) }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <figcaption className="text-[12px] text-text-3">
                  Screenshot taken in the sandbox. Sample image until the runner is connected.
                </figcaption>
              </figure>

              <dl className="flex flex-col rounded-[12px] border border-line text-[14px]">
                <Row label="Kind">
                  <Tag kind={evidence.kind} />
                </Row>
                <Row label="Captured">{when(evidence.capturedAt)}</Row>
                <Row label="Where">
                  <span className="font-mono text-[13px]">{evidence.source}</span>
                </Row>
                {evidence.method && <Row label="How">{evidence.method}</Row>}
                {evidence.hash && (
                  <Row label="Page hash">
                    <span className="font-mono text-[13px]">{evidence.hash}</span>
                  </Row>
                )}
              </dl>

              <div className="rounded-[12px] border border-line px-4 py-3">
                <p className="text-[13px] text-text-3">What it can&apos;t tell you</p>
                <p className="mt-1 text-text-1">
                  {evidence.limitation ??
                    (evidence.kind === "tested"
                      ? "One task in our owned demo. Not a benchmark of the product."
                      : "What the vendor says. Visiting a page doesn't test the tool.")}
                </p>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-t border-line px-4 py-2.5 first:border-t-0">
      <dt className="shrink-0 text-[13px] text-text-3">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text-1">{children}</dd>
    </div>
  );
}
