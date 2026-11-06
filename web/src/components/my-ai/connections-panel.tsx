"use client";

import { GithubLogo, EnvelopeSimple } from "@phosphor-icons/react";
import type { Connection } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<string, React.ElementType> = {
  con_github: GithubLogo,
  con_receipts: EnvelopeSimple,
};

/**
 * Accounts Wallio reads from, and exactly what each may read.
 * TODO(api): GET /api/connections, DELETE /api/connections/{id}.
 */
export function ConnectionsPanel({
  connections,
  disconnected,
  onToggle,
}: {
  connections: Connection[];
  disconnected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="flex flex-col rounded-[20px] border border-line bg-surface-1">
      <header className="flex h-14 items-center px-6">
        <h2 className="text-[15px] font-medium text-text-1">Connected</h2>
      </header>
      <ul className="border-t border-line">
        {connections.map((c) => {
          const Icon = ICON[c.id] ?? GithubLogo;
          const off = disconnected.includes(c.id);
          const later = c.status === "coming_later";
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 border-t border-line px-6 py-4 first:border-t-0"
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md bg-surface-3",
                  later || off ? "text-text-3" : "text-text-1",
                )}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block", later || off ? "text-text-3" : "text-text-1")}>
                  {c.name}
                  {c.status === "sample" && !off && (
                    <span className="text-[12px] text-text-3"> · Sample</span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-text-3" title={c.reads}>
                  {off ? "Disconnected. Its guesses were removed." : `Reads: ${c.reads}`}
                </span>
              </span>
              {later ? (
                <span className="shrink-0 text-[12px] text-text-3">Coming later</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggle(c.id)}
                  className="shrink-0 rounded-md text-[13px] text-text-3 transition-colors hover:text-text-1"
                >
                  {off ? "Undo" : "Disconnect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
