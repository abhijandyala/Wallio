import type { Workflow } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { ToolMark } from "@/components/kit/tool-mark";

/** The user's workflows, most important first, with the tools they use for each. */
export function WorkflowsPanel({ workflows }: { workflows: Workflow[] }) {
  const sorted = [...workflows].sort((a, b) => a.priority - b.priority);
  return (
    <Panel
      title="Your workflows"
      action={{ label: "Compare", href: "/compare" }}
      flush
      className="h-full"
    >
      <ol className="border-t border-line">
        {sorted.map((w, i) => (
          <li
            key={w.id}
            className="flex items-center gap-4 border-t border-line px-6 py-5 first:border-t-0"
          >
            <span
              className={
                i === 0
                  ? "display grid size-9 shrink-0 place-items-center rounded-[10px] bg-lavender text-[15px] font-medium text-ink"
                  : "display grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[15px] font-medium text-text-2"
              }
            >
              {w.priority}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-text-1">
                {w.name}
              </span>
              {i === 0 && (
                <span className="block text-[12px] text-text-3">
                  Top priority
                </span>
              )}
            </span>
            <span className="flex -space-x-1.5">
              {(w.tools ?? []).map((t) => (
                <span key={t} className="rounded-md ring-2 ring-surface-1">
                  <ToolMark name={t} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
