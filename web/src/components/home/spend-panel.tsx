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
  // No percentage without a budget, and no total when every price is unknown (never "$0").
  const unknown = totals.monthlyUnknown === true;
  const pct = budgetCents > 0 && !unknown ? Math.round((totals.monthlyCents / budgetCents) * 100) : null;
  const budget = formatMoney(budgetCents).replace(".00", "");
  const unknownNote = totals.unknownPriceCount > 0 && <> · {totals.unknownPriceCount} price unknown</>;

  return (
    <Panel title="Monthly spend" action={{ label: "Budget", href: "/settings#spending" }}>
      <div className="flex h-full flex-col justify-end gap-5">
        <p className="display text-[44px] leading-[48px] font-medium text-text-1">
          {unknown ? "Unknown" : <NumberTicker value={totals.monthlyCents} kind="money" />}
        </p>
        {pct !== null && <Meter value={pct} label={`${pct}% of monthly budget`} />}
        <p className="text-[13px] text-text-3">
          {pct !== null ? (
            <>
              <span className="tnum text-text-2">{pct}%</span> of your {budget} budget
            </>
          ) : budgetCents > 0 ? (
            <>Your budget is {budget}</>
          ) : (
            <>No budget set</>
          )}
          {unknownNote}
        </p>
      </div>
    </Panel>
  );
}
