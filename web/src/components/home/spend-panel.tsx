import type { HomeSummary } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { Meter } from "@/components/kit/meter";
import { NumberTicker } from "@/components/kit/number-ticker";
import { formatMoney } from "@/lib/format";

export function SpendPanel({
  totals,
  budgetCents,
}: {
  totals: HomeSummary["totals"];
  budgetCents: number;
}) {
  const pct = Math.round((totals.monthlyCents / budgetCents) * 100);
  const budget = formatMoney(budgetCents).replace(".00", "");

  return (
    <Panel title="Monthly spend" action={{ label: "Budget", href: "/settings#spending" }}>
      <div className="flex h-full flex-col justify-end gap-5">
        <p className="display text-[44px] leading-[48px] font-medium text-text-1">
          <NumberTicker value={totals.monthlyCents} kind="money" />
        </p>
        <Meter value={pct} label={`${pct}% of monthly budget`} />
        <p className="text-[13px] text-text-3">
          <span className="tnum text-text-2">{pct}%</span> of your {budget}{" "}
          budget
          {totals.unknownPriceCount > 0 && (
            <> · {totals.unknownPriceCount} price unknown</>
          )}
        </p>
      </div>
    </Panel>
  );
}
