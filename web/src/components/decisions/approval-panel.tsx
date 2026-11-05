"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LockSimple } from "@phosphor-icons/react";
import type { ApprovalIntent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type State = "waiting" | "checking" | "confirmed" | "declined";

// What the server verifies before it acts (PRD section 15). Shown one by one while it works.
const CHECKS = [
  "Same action you saw",
  "Still your request",
  "Not expired",
  "Page hasn't changed",
  "Submitted once",
];
const CHECK_MS = 380;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * Exactly what the agent will do, with the screenshot it will act on.
 * The click only records intent; the server validates the intent hash, ownership,
 * expiry and page state, then executes at most once.
 * TODO(api): POST /api/approvals/{id}/decision and stream the verified outcome.
 */
export function ApprovalPanel({
  intent,
  onSettled,
  onResolved,
}: {
  intent: ApprovalIntent;
  /** Tells the page whether this approval still needs the user. */
  onSettled?: (settled: boolean) => void;
  /** Fires once the server has confirmed the submit, or when the user declines. */
  onResolved?: (result: "approved" | "declined") => void;
}) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<State>("waiting");
  const [passed, setPassed] = useState(0);

  // Simulated server checks. A real approval is "confirmed" only when the backend says so.
  useEffect(() => {
    if (state !== "checking") return;
    const id = setInterval(
      () => setPassed((n) => Math.min(n + 1, CHECKS.length)),
      reduce ? 0 : CHECK_MS,
    );
    return () => clearInterval(id);
  }, [state, reduce]);
  const shown: State =
    state === "checking" && passed >= CHECKS.length ? "confirmed" : state;

  // Report the confirmed submit once, after the last server check.
  const reported = useRef(false);
  useEffect(() => {
    if (shown === "confirmed" && !reported.current) {
      reported.current = true;
      onResolved?.("approved");
    }
  }, [shown, onResolved]);

  const approve = () => {
    setPassed(0);
    setState("checking");
    onSettled?.(true);
  };
  const decline = () => {
    setState("declined");
    onSettled?.(true);
    onResolved?.("declined");
  };
  const undo = () => {
    setState("waiting");
    onSettled?.(false);
  };

  return (
    <section className="flex flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 items-center gap-3 px-6">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-[1px] transition-colors",
            shown === "waiting" ? "bg-lavender" : "bg-text-disabled",
          )}
        />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-1">
          {intent.title}
        </h2>
        <span className="tnum shrink-0 text-[13px] text-text-3">
          {shown === "waiting" ? (
            <>
              <span className="hidden sm:inline">Expires </span>
              {time(intent.expiresAt)}
            </>
          ) : (
            "Approval used"
          )}
        </span>
      </header>

      <div className="grid gap-gutter border-t border-line p-4 sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-6">
        <FormShot intent={intent} state={shown} />

        <dl className="flex flex-col">
          <Fact label="Sends to">
            <span className="font-mono text-[13px]">{intent.destination}</span>
          </Fact>
          {intent.fields.map((f) => (
            <Fact key={f.label} label={f.label}>
              {f.value}
            </Fact>
          ))}
          <Fact label="What happens">{intent.consequence}</Fact>
        </dl>
      </div>

      <footer className="min-h-[76px] border-t border-line px-6 py-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={shown}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2"
            role="status"
          >
            {shown === "waiting" && (
              <>
                <Button variant="primary" size="lg" onClick={approve}>
                  Approve and submit
                </Button>
                <Button variant="ghost" size="lg" onClick={decline}>
                  Decline
                </Button>
                <span className="ml-auto hidden text-[13px] text-text-3 lg:block">
                  Approves this exact action, once
                </span>
              </>
            )}
            {shown === "checking" && (
              <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {CHECKS.map((c, i) => (
                  <li
                    key={c}
                    className={cn(
                      "flex items-center gap-2 text-[13px] transition-colors duration-200",
                      i < passed ? "text-text-1" : i === passed ? "text-text-2" : "text-text-3",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-[4px]",
                        i < passed
                          ? "bg-lime-tint text-lime"
                          : i === passed
                            ? "border border-lavender"
                            : "border border-line-strong",
                      )}
                    >
                      {i < passed ? (
                        <Check size={10} weight="bold" />
                      ) : i === passed ? (
                        <span className="size-1 animate-pulse rounded-[1px] bg-lavender" />
                      ) : null}
                    </span>
                    {c}
                  </li>
                ))}
              </ol>
            )}
            {shown === "confirmed" && (
              <p className="flex items-center gap-3 text-text-1">
                <span className="grid size-5 place-items-center rounded-[5px] bg-lime-tint text-lime">
                  <Check size={12} weight="bold" />
                </span>
                Submitted once. The page confirmed it.
                <span className="text-text-3">Sample</span>
              </p>
            )}
            {shown === "declined" && (
              <p className="flex items-center gap-4 text-text-2">
                Declined. Nothing was sent.
                <button
                  type="button"
                  className="rounded-md text-[13px] text-text-3 transition-colors hover:text-text-1"
                  onClick={undo}
                >
                  Undo
                </button>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </footer>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 flex-col justify-center gap-0.5 border-t border-line py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-[13px] text-text-3">{label}</dt>
      <dd className="min-w-0 text-text-1 sm:text-right">{children}</dd>
    </div>
  );
}

/**
 * The screenshot the agent will act on, drawn from the intent's fields.
 * TODO(api): replace with the runner's real screenshot for this intent.
 */
function FormShot({ intent, state }: { intent: ApprovalIntent; state: State }) {
  const reduce = useReducedMotion();
  const done = state === "confirmed";
  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-[12px] border border-line bg-bg">
        <div className="flex h-8 items-center gap-2 border-b border-line px-3">
          <LockSimple size={11} className="shrink-0 text-text-3" />
          <span className="truncate font-mono text-[11px] text-text-3">
            {intent.destination}
          </span>
        </div>
        <div className="relative p-5">
          {/* The form stays in the layout so the frame never changes height. */}
          <motion.div
            animate={{ opacity: done ? 0 : state === "declined" ? 0.4 : 1 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className="flex flex-col gap-3"
            aria-hidden={done}
          >
            <span className="h-3.5 w-1/2 rounded-[3px] bg-white/10" />
            {intent.fields.map((f) => (
              <span key={f.label} className="flex flex-col gap-1">
                <span className="text-[11px] text-text-3">{f.label}</span>
                <span className="truncate rounded-[6px] border border-line bg-surface-1 px-2.5 py-1.5 text-[12px] text-text-1">
                  {f.value}
                </span>
              </span>
            ))}
            <span
              className={cn(
                "mt-1 h-8 w-28 rounded-[6px] border text-center text-[12px] leading-[30px] transition-colors",
                state === "waiting"
                  ? "border-lavender text-lavender"
                  : "border-line text-text-3",
              )}
            >
              Submit
            </span>
          </motion.div>
          <AnimatePresence initial={false}>
            {done && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.25, delay: reduce ? 0 : 0.1 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center"
              >
                <span className="grid size-9 place-items-center rounded-[9px] bg-lime-tint text-lime">
                  <Check size={16} weight="bold" />
                </span>
                <p className="text-[15px] text-text-1">Trial request received</p>
                <p className="text-[12px] text-text-3">Confirmation page</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <figcaption className="text-[12px] text-text-3">
        {done ? "After: confirmation page" : `Screenshot · ${intent.screenshotLabel}`}
      </figcaption>
    </figure>
  );
}
