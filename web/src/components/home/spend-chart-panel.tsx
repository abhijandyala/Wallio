"use client";

import { useState } from "react";
import type { HomeSummary } from "@/lib/types";
import { BlockBarChart } from "@/components/kit/charts";
import { Segmented } from "@/components/kit/segmented";
import { Money } from "@/components/kit/money";
import { AskBar } from "./ask-bar";

type Range = "3m" | "6m" | "1y";
const COUNT: Record<Range, number> = { "3m": 3, "6m": 6, "1y": 12 };

/** The Home centerpiece: spend over time, with the Ask bar attached underneath. */
export function SpendChartPanel({
  history,
}: {
  history: HomeSummary["spendHistory"];
}) {
  const [range, setRange] = useState<Range>("6m");
  const data = history
    .slice(-COUNT[range])
    .map((h) => ({ label: h.month, cents: h.cents }));
  const first = data[0]?.cents ?? 0;
  const last = data[data.length - 1]?.cents ?? 0;
  const change = first ? Math.round(((last - first) / first) * 100) : 0;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-surface-1">
      <header className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
        <div>
          <h2 className="text-[15px] font-medium text-text-1">
            AI spend over time
          </h2>
          <p className="display mt-3 text-[36px] leading-[40px] font-medium text-text-1">
            <Money cents={last} />
            <span className="ml-3 align-middle text-[14px] font-normal tracking-normal text-lavender">
              +{change}% in {data.length} months
            </span>
          </p>
        </div>
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { id: "3m", label: "3M" },
            { id: "6m", label: "6M" },
            { id: "1y", label: "1Y" },
          ]}
        />
      </header>

      <div className="flex-1 px-6 pt-8 pb-6">
        <BlockBarChart key={range} data={data} height={200} />
      </div>

      <AskBar />
    </section>
  );
}
