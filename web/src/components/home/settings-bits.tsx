"use client";

import type { HomeSummary } from "@/lib/types";
import { useSettings } from "@/lib/settings";
import { SpendPanel } from "./spend-panel";

/** The name from Settings -> Account. */
export function DisplayName() {
  return <>{useSettings().displayName}</>;
}

/** Monthly spend against the budget from Settings -> Spending. */
export function LiveSpendPanel({ totals }: { totals: HomeSummary["totals"] }) {
  const { budgetCents } = useSettings();
  return <SpendPanel totals={totals} budgetCents={budgetCents} />;
}
