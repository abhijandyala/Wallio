"use client";

import { api, explainFailure } from "./client";
import { prime, useApi } from "./cache";
import { withBudget } from "./my-ai-map";

export type LiveBudget =
  | { state: "loading" }
  | { state: "offline" }
  | {
      state: "live";
      budgetCents: number;
      /** The server's known monthly total. */
      spentCents: number;
      next: { toolName: string; days: number } | null;
      version: number;
      /** Saves the budget as a new profile version. Resolves to an error sentence, or null. */
      save: (cents: number) => Promise<string | null>;
    };

const DAY = 86_400_000;

/**
 * The monthly budget from the Wallio API: read from the latest profile version, saved by
 * posting a new one (POST /api/profile/versions). "offline" means use the local setting.
 */
export function useLiveBudget(): LiveBudget {
  const profile = useApi("profile");
  const inv = useApi("inventory");

  if (!profile.data || !inv.data) {
    const failed = (profile.error || inv.error) && !profile.loading && !inv.loading;
    return failed ? { state: "offline" } : { state: "loading" };
  }

  const p = profile.data;
  const i = inv.data;
  const names = new Map(i.tools.map((t) => [t.id, t.name]));
  const subs = new Map(i.subscriptions.map((s) => [s.id, s]));
  const upcoming = [...i.summary.upcomingRenewals].sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))[0];
  const sub = upcoming ? subs.get(upcoming.subscriptionId) : undefined;
  // Days counted from when the server computed the summary, so rendering stays pure.
  const now = new Date(i.summary.computedAt).getTime();

  return {
    state: "live",
    budgetCents: p.budget.maxMonthlyMinor,
    spentCents: i.summary.knownMonthlyEquivalentMinor ?? 0,
    next:
      upcoming && sub
        ? {
            toolName: names.get(sub.toolId) ?? sub.toolId,
            days: Math.max(0, Math.ceil((new Date(upcoming.renewalDate).getTime() - now) / DAY)),
          }
        : null,
    version: p.version,
    save: async (cents) => {
      try {
        prime("profile", await api.saveProfile(withBudget(p, cents)));
        return null;
      } catch (e) {
        return explainFailure(e);
      }
    },
  };
}
