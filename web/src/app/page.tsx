import { homeSample } from "@/mocks/home";
import { ButtonLink } from "@/components/kit/button-link";
import { Stat, StatStrip } from "@/components/kit/stat";
import { Money } from "@/components/kit/money";
import { NumberTicker } from "@/components/kit/number-ticker";
import { Sparkbars } from "@/components/kit/charts";
import { DecisionHero } from "@/components/home/decision-hero";
import { SpendPanel } from "@/components/home/spend-panel";
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

export default function HomePage() {
  // TODO(api): replace with the home summary endpoint once agreed with the backend.
  const data = homeSample;
  const { totals } = data;
  const needsYou = data.inbox.filter((i) => i.needsYou).length;

  if (data.subscriptions.length === 0)
    return <HomeEmpty name={data.userFirstName} />;

  return (
    <div className="flex flex-col gap-section">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[40px] leading-[44px] font-medium text-text-1 sm:text-[52px] sm:leading-[56px]">
            Welcome back, {data.userFirstName}
          </h1>
          <p className="mt-2 text-[15px] text-text-2">
            {needsYou > 0
              ? `${needsYou} things need you today.`
              : "Everything is up to date."}
          </p>
        </div>
        <ButtonLink href="/my-ai" variant="secondary">
          Add a tool
        </ButtonLink>
      </header>

      <div className="grid grid-cols-12 gap-gutter">
        {/* Row 1: summary left, the one decision right */}
        <div className="col-span-12 grid xl:col-span-4">
          <SpendPanel totals={totals} budgetCents={data.monthlyBudgetCents} />
        </div>
        <div className="order-first col-span-12 grid xl:order-none xl:col-span-8">
          <DecisionHero decision={data.nextDecision} />
        </div>

        {/* Row 2: stats with tiny charts */}
        <StatStrip className="col-span-12">
          <Stat
            label="Active tools"
            delta={data.deltas.activeTools}
            value={<NumberTicker value={totals.activeTools} />}
            chart={<Sparkbars values={[3, 3, 4, 4, 5, 5, 6]} />}
          />
          <Stat
            label="Renewing in 30 days"
            delta={data.deltas.renewals}
            value={<NumberTicker value={totals.renewalsNext30} />}
            chart={<Sparkbars values={[1, 0, 2, 1, 1, 0, 2]} />}
          />
          <Stat
            label="Tested by Wallio"
            delta={data.deltas.tested}
            value={
              <>
                <NumberTicker value={totals.testedTools} />
                <span className="text-text-3"> of {totals.activeTools}</span>
              </>
            }
            chart={<Sparkbars values={[0, 0, 0, 1, 1, 2, 3]} tone="lime" />}
          />
          <Stat
            label="Possible savings"
            delta={data.deltas.savings}
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
          <SpendChartPanel history={data.spendHistory} />
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
