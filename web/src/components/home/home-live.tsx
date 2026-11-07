"use client";

import { useEffect, useState } from "react";
import { api, explainFailure } from "@/lib/api/client";
import type { CatalogTool, DecisionsOverview, InventoryResponse, ProfileVersion, Recommendation } from "@/lib/api/contract";
import { toUiSubscription } from "@/lib/api/my-ai-map";
import type { DecisionCard, HomeSummary, InboxItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { homeSample } from "@/mocks/home";
import { HomeSkeleton } from "./home-states";
import { HomeView } from "./home-view";

type Loaded = { inv: InventoryResponse; profile: ProfileVersion; decisions: DecisionsOverview | null; catalog: CatalogTool[] };

const SAMPLE_NOTE = "Spend history, the last comparison and evidence by tool are sample data for now.";
const DAY = 86_400_000;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Yearly saving from the first spending scenario, when it's a saving at all. */
function yearlySaving(rec: Recommendation): number | null {
  const delta = rec.spending.scenarios[0]?.monthlyEquivalentDeltaMinor;
  return typeof delta === "number" && delta < 0 ? -delta * 12 : null;
}

/** The newest open recommendation as Home's one decision. */
function toDecision(rec: Recommendation): DecisionCard {
  const why = rec.statements.find((s) => s.role === "supporting")?.text ?? rec.goal;
  return {
    id: rec.id,
    trigger: "comparison_ready",
    title: rec.headline,
    summary: why,
    action: "compare",
    claims: [],
    estimatedAnnualSavingsCents: yearlySaving(rec),
    dueOn: null,
    primaryCta: "Review it",
    secondaryCta: "",
    href: "/decisions",
  };
}

/**
 * Home on the Wallio API: totals and renewals from GET /api/inventory (the server's summary),
 * the budget from the profile, the decision and inbox from GET /api/decisions. Panels the API
 * has no data for yet keep the sample, and the page says which.
 */
export function HomeLive() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([api.inventory(), api.profile(), api.decisions().catch(() => null), api.catalog()]).then(
      ([inv, profile, decisions, catalog]) => {
        if (!alive) return;
        setFailed(null);
        setData({ inv, profile, decisions, catalog });
      },
      (e) => alive && setFailed(explainFailure(e)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (failed && !data) {
    return (
      <HomeView
        data={homeSample}
        banner={
          <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface-1 px-5 py-3">
            <span className="text-text-1">{failed}</span>
            <span className="text-text-3">Showing sample data meanwhile.</span>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        }
      />
    );
  }
  if (!data) return <HomeSkeleton />;

  return <HomeView data={toHome(data)} budgetCents={data.profile.budget.maxMonthlyMinor} live sampleNote={SAMPLE_NOTE} />;
}

function toHome({ inv, decisions, catalog }: Loaded): HomeSummary {
  const today = new Date().toISOString().slice(0, 10);
  const tools = new Map([...catalog, ...inv.tools].map((t) => [t.id, t]));
  const subscriptions = inv.subscriptions.filter((s) => s.status !== "archived").map((s) => toUiSubscription(s, tools));
  const active = subscriptions.filter((s) => s.status === "active");
  const now = Date.now();
  const renewalsNext30 = inv.summary.upcomingRenewals.filter((r) => {
    const d = (new Date(r.renewalDate).getTime() - now) / DAY;
    return d >= -1 && d <= 30;
  }).length;

  // Spend by category, from the same rows the total is made of. Unknown prices count, not sum.
  const byCategory = new Map<string, { name: string; cents: number; tools: number }>();
  for (const s of active) {
    const c = byCategory.get(s.category) ?? { name: s.category, cents: 0, tools: 0 };
    c.cents += s.monthlyCents ?? 0;
    c.tools += 1;
    byCategory.set(s.category, c);
  }

  const recs = decisions?.recommendations ?? [];
  const tested = new Set(recs.flatMap((r) => r.candidates.filter((c) => c.testResult).map((c) => c.toolId)));
  const pending = (decisions?.approvals ?? []).filter((a) => a.status === "pending");
  const inbox: InboxItem[] = [
    ...pending.map((a) => ({
      id: a.id,
      kind: "approval" as const,
      title: `Approve the trial request to ${new URL(a.targetUrl).host}`,
      meta: "Needs you",
      needsYou: true,
      href: "/decisions",
    })),
    ...recs.map((r) => ({
      id: r.id,
      kind: "comparison_ready" as const,
      title: r.headline,
      meta: shortDate(r.createdAt),
      needsYou: true,
      href: "/decisions",
    })),
    ...(decisions?.deferred ?? []).map((d) => ({
      id: `deferred_${d.recommendationId}`,
      kind: "update" as const,
      title: d.headline,
      meta: `Back ${shortDate(d.until)}`,
      needsYou: false,
      href: "/decisions",
    })),
  ];

  return {
    ...homeSample,
    today,
    monthlyBudgetCents: homeSample.monthlyBudgetCents,
    totals: {
      monthlyCents: inv.summary.knownMonthlyEquivalentMinor ?? 0,
      unknownPriceCount: inv.summary.unknownPriceCount,
      activeTools: active.length,
      renewalsNext30,
      testedTools: active.filter((s) => s.toolId && tested.has(s.toolId)).length,
      overlapNote: null,
    },
    nextDecision: recs[0] ? toDecision(recs[0]) : null,
    categories: [...byCategory.values()].sort((a, b) => b.cents - a.cents),
    subscriptions,
    inbox,
  };
}
