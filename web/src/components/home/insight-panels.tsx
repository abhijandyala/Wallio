import type { HomeSummary, Subscription } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { Money } from "@/components/kit/money";
import { ToolMark } from "@/components/kit/tool-mark";
import {
  EvidenceDots,
  PassBar,
  RenewalTimeline,
  SegmentBar,
  SegmentSwatch,
} from "@/components/kit/charts";
import { daysUntil } from "@/lib/format";

/** Renewals in the next 30 days, placed on a timeline. */
export function RenewalsPanel({
  subscriptions,
  today,
}: {
  subscriptions: Subscription[];
  today: string;
}) {
  const due = subscriptions
    .filter(
      (s) =>
        s.renewsOn &&
        daysUntil(s.renewsOn, today) <= 30 &&
        daysUntil(s.renewsOn, today) >= 0,
    )
    .sort((a, b) => a.renewsOn!.localeCompare(b.renewsOn!));
  // Display only: the backend owns the authoritative total.
  const dueCents = due.reduce((n, s) => n + (s.renewalCents ?? 0), 0);

  return (
    <Panel
      title="Renewals"
      action={{ label: "Next 30 days", href: "/my-ai" }}
      className="h-full"
    >
      <p className="display text-[32px] leading-[36px] font-medium text-text-1">
        <Money cents={dueCents} />
        <span className="ml-2 text-[14px] font-normal tracking-normal text-text-3">
          due
        </span>
      </p>
      <div className="mt-4">
        <RenewalTimeline
          today={today}
          items={due.map((s) => ({
            toolName: s.toolName,
            date: s.renewsOn!,
            cents: s.renewalCents,
          }))}
        />
      </div>
    </Panel>
  );
}

/** Where the money goes, as one segmented bar and a short list. */
export function CategoryPanel({
  categories,
  totalCents,
}: {
  categories: HomeSummary["categories"];
  totalCents: number;
}) {
  return (
    <Panel title="By category" className="h-full">
      <SegmentBar parts={categories} />
      <ul className="mt-5 flex flex-col gap-3">
        {categories.map((c, i) => (
          <li key={c.name} className="flex items-center gap-3 text-[14px]">
            <SegmentSwatch index={i} />
            <span className="flex-1 text-text-2">
              {c.name}
              <span className="text-text-3"> · {c.tools}</span>
            </span>
            {c.cents > 0 ? (
              <>
                <Money cents={c.cents} className="text-text-1" />
                <span className="tnum w-10 text-right text-text-3">
                  {Math.round((c.cents / totalCents) * 100)}%
                </span>
              </>
            ) : (
              <span className="text-text-3">Unknown</span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** How much of what Wallio says is backed by a test vs. read from a page. */
export function ConfidencePanel({
  tools,
}: {
  tools: HomeSummary["evidenceByTool"];
}) {
  const tested = tools.filter((t) => t.tested > 0).length;
  return (
    <Panel title="How sure Wallio is" className="h-full">
      <p className="display text-[32px] leading-[36px] font-medium text-text-1">
        <span className="tnum">{tested}</span>
        <span className="text-text-3"> of {tools.length}</span>
        <span className="ml-2 text-[14px] font-normal tracking-normal text-text-3">
          tested
        </span>
      </p>
      <div className="mt-6">
        <EvidenceDots tools={tools} />
      </div>
      <p className="mt-5 flex gap-4 text-[12px] text-text-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-lime" /> Tested
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-lavender/70" /> Read
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] border border-white/20" />{" "}
          Unknown
        </span>
      </p>
    </Panel>
  );
}

/** The most recent comparison, as pass bars. */
export function LastComparisonPanel({
  comparison,
}: {
  comparison: HomeSummary["lastComparison"];
}) {
  if (!comparison) {
    return (
      <Panel title="Last comparison" className="h-full">
        <p className="text-text-3">No comparisons yet.</p>
      </Panel>
    );
  }
  const best = Math.max(
    ...comparison.candidates.map((c) => c.passed / c.attempts),
  );
  return (
    <Panel
      title="Last comparison"
      action={{ label: "Report", href: "/compare?view=results" }}
      className="h-full"
    >
      <p className="display text-[24px] leading-[30px] font-medium text-lime">
        {comparison.verdict}
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        {comparison.candidates.map((c) => (
          <li key={c.toolName} className="flex items-center gap-3">
            <ToolMark name={c.toolName} />
            <span className="w-20 shrink-0 text-[14px] text-text-1">
              {c.toolName}
            </span>
            <PassBar
              passed={c.passed}
              attempts={c.attempts}
              best={c.passed / c.attempts === best}
            />
            <span className="tnum w-10 shrink-0 text-right text-[13px] text-text-2">
              {c.passed}/{c.attempts}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[12px] text-text-3">
        {comparison.title} · {comparison.finishedOn}
      </p>
    </Panel>
  );
}
