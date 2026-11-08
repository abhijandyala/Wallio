"use client";

import type { HomeSummary } from "@/lib/types";
import { useSettings } from "@/lib/settings";
import { SpendPanel } from "./spend-panel";

/** The name from Settings -> Account. */
/** ", Name" after "Welcome back", or nothing when no name is set. */
export function DisplayName() {
  const name = useSettings().displayName.trim();
  return <>{name ? `, ${name}` : ""}</>;
}

/** Monthly spend against the budget: the profile's when live, else Settings -> Spending. */
export function LiveSpendPanel({ totals, budgetCents }: { totals: HomeSummary["totals"]; budgetCents?: number }) {
  const local = useSettings().budgetCents;
  return <SpendPanel totals={totals} budgetCents={budgetCents ?? local} />;
}
