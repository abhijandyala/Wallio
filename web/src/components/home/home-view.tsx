import type { HomeSummary } from "@/lib/types";
import { DisplayName, LiveSpendPanel } from "@/components/home/settings-bits";
import { ButtonLink } from "@/components/kit/button-link";
import { Stat, StatStrip } from "@/components/kit/stat";
import { Money } from "@/components/kit/money";
import { NumberTicker } from "@/components/kit/number-ticker";
import { Sparkbars } from "@/components/kit/charts";
import { DecisionHero } from "@/components/home/decision-hero";
import { StackPanel } from "@/components/home/stack-panel";
import { InboxPanel } from "@/components/home/inbox-panel";
import { SpendChartPanel } from "@/components/home/spend-chart-panel";
import {
  CategoryPanel,
  ConfidencePanel,
  LastComparisonPanel,
  RenewalsPanel,
} from "@/components/home/insight-panels";
import { HomeEmpty } from "@/components/home/home-states";

/**
 * Home. Draws a HomeSummary; HomeLive builds it from the Wallio API (inventory, profile,
 * decisions). `sampleNote` names the panels that still show sample data; `live` drops the
 * sample-only extras (deltas and mini charts) so nothing made up sits next to real numbers.
 */
export function HomeView({
  data,
  budgetCents,
  live = false,
  sampleNote,
  banner,
}: {
  data: HomeSummary;
  budgetCents?: number;
  live?: boolean;
  sampleNote?: string;
  banner?: React.ReactNode;
}) {
  const { totals } = data;
  const needsYou = data.inbox.filter((i) => i.needsYou).length;

  if (data.subscriptions.length === 0)
    return <HomeEmpty name={data.userFirstName} />;

  return (
    <div className="flex flex-col gap-section">
      {banner}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[40px] leading-[44px] font-medium text-text-1 sm:text-[52px] sm:leading-[56px]">
            Welcome back, <DisplayName />
          </h1>
          <p className="mt-2 text-[15px] text-text-2">
            {needsYou > 0
              ? `${needsYou} ${needsYou === 1 ? "thing needs" : "things need"} you today.`
              : "Everything is up to date."}
          </p>
          {sampleNote && <p className="mt-1 text-[13px] text-text-3">{sampleNote}</p>}
        </div>
        <ButtonLink href="/my-ai" variant="secondary">
          Add a tool
        </ButtonLink>
      </header>

      <div className="grid grid-cols-12 gap-gutter">
        {/* Row 1: summary left, the one decision right */}
        <div className="col-span-12 grid xl:col-span-4">
          <LiveSpendPanel totals={totals} budgetCents={budgetCents} />
        </div>
        <div className="order-first col-span-12 grid xl:order-none xl:col-span-8">
          <DecisionHero decision={data.nextDecision} />
        </div>

        {/* Row 2: stats with tiny charts */}
        <StatStrip className="col-span-12">
          <Stat
            label="Active tools"
            delta={live ? undefined : data.deltas.activeTools}
            value={<NumberTicker value={totals.activeTools} />}
            chart={live ? undefined : <Sparkbars values={[3, 3, 4, 4, 5, 5, 6]} />}
          />
          <Stat
            label="Renewing in 30 days"
            delta={live ? undefined : data.deltas.renewals}
            value={<NumberTicker value={totals.renewalsNext30} />}
            chart={live ? undefined : <Sparkbars values={[1, 0, 2, 1, 1, 0, 2]} />}
          />
          <Stat
            label="Tested by Wallio"
            delta={live ? undefined : data.deltas.tested}
            value={
              <>
                <NumberTicker value={totals.testedTools} />
                <span className="text-text-3"> of {totals.activeTools}</span>
              </>
            }
            chart={live ? undefined : <Sparkbars values={[0, 0, 0, 1, 1, 2, 3]} tone="lime" />}
          />
          <Stat
            label="Possible savings"
            delta={live ? undefined : data.deltas.savings}
            tone="positive"
            value={
              data.nextDecision?.estimatedAnnualSavingsCents != null ? (
                <>
                  <Money
                    cents={data.nextDecision.estimatedAnnualSavingsCents}
                    dropCents
                  />
                  <span className="text-[16px] text-lime/60">/yr</span>
                </>
              ) : (
                <span className="text-text-3">—</span>
              )
            }
          />
        </StatStrip>

        {/* Row 3: inbox + last result left, the centerpiece chart + Ask right */}
        <div className="col-span-12 flex flex-col gap-gutter xl:col-span-4">
          <InboxPanel items={data.inbox} />
          <div className="flex-1">
            <LastComparisonPanel comparison={data.lastComparison} />
          </div>
        </div>
        <div className="col-span-12 xl:col-span-8">
          <SpendChartPanel history={data.spendHistory} sample={live} />
        </div>

        {/* Row 4: three insights */}
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
          <RenewalsPanel
            subscriptions={data.subscriptions}
            today={data.today}
          />
        </div>
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
          <CategoryPanel
            categories={data.categories}
            totalCents={totals.monthlyCents}
          />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <ConfidencePanel tools={data.evidenceByTool} />
        </div>

        {/* Row 5: the full stack */}
        <div className="col-span-12">
          <StackPanel subscriptions={data.subscriptions} today={data.today} />
        </div>
      </div>
    </div>
  );
}
