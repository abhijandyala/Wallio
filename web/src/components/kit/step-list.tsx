import { Check, Prohibit, X } from "@phosphor-icons/react/dist/ssr";
import type { RunStep } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Live progress of an agent run. One line per step; blocked/failed steps show a short note. */
export function StepList({
  steps,
}: {
  steps: Pick<RunStep, "id" | "label" | "status" | "atSeconds" | "note" | "approval">[];
}) {
  return (
    <ol className="flex flex-col" aria-live="polite">
      {steps.map((s) => (
        <li
          key={s.id}
          className="flex min-h-12 items-center gap-3 border-t border-line px-6 py-3 first:border-t-0"
        >
          <StepIcon status={s.status} />
          <span
            className={cn(
              "min-w-0 flex-1",
              s.status === "pending" && "text-text-3",
              s.status === "active" && "text-text-1",
              s.status === "done" && "text-text-2",
              (s.status === "blocked" || s.status === "failed") &&
                "text-text-2",
            )}
          >
            {s.label}
            {(s.status === "blocked" || s.status === "failed") && s.note && (
              <span className="text-text-3"> · {s.note}</span>
            )}
          </span>
          <span className="tnum shrink-0 text-[13px] text-text-3">
            {s.status === "active"
              ? s.approval
                ? "Needs you"
                : "Working"
              : s.atSeconds !== null
                ? `${s.atSeconds}s`
                : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ status }: { status: RunStep["status"] }) {
  const base = "grid size-5 shrink-0 place-items-center rounded-[5px]";
  switch (status) {
    case "done":
      return (
        <span className={cn(base, "bg-lime-tint text-lime")} aria-label="Done">
          <Check size={12} weight="bold" />
        </span>
      );
    case "active":
      return (
        <span
          className={cn(base, "border border-aurora")}
          aria-label="In progress"
        >
          <span className="size-1.5 animate-pulse rounded-[1px] bg-aurora" />
        </span>
      );
    case "blocked":
      return (
        <span
          className={cn(base, "bg-surface-3 text-text-2")}
          aria-label="Blocked"
        >
          <Prohibit size={12} />
        </span>
      );
    case "failed":
      return (
        <span
          className={cn(base, "bg-surface-3 text-danger")}
          aria-label="Failed"
        >
          <X size={12} weight="bold" />
        </span>
      );
    default:
      return (
        <span
          className={cn(base, "border border-line-strong")}
          aria-label="Waiting"
        />
      );
  }
}
