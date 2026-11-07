"use client";

import { useEffect, useState } from "react";
import { api, explainFailure } from "./client";
import type { InventoryResponse, ProfileVersion } from "./contract";
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
  const [profile, setProfile] = useState<ProfileVersion | null>(null);
  const [inv, setInv] = useState<InventoryResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([api.profile(), api.inventory()]).then(
      ([p, i]) => {
        if (!alive) return;
        setProfile(p);
        setInv(i);
        setLoadedAt(Date.now());
      },
      () => alive && setOffline(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (offline) return { state: "offline" };
  if (!profile || !inv) return { state: "loading" };

  const names = new Map(inv.tools.map((t) => [t.id, t.name]));
  const subs = new Map(inv.subscriptions.map((s) => [s.id, s]));
  const upcoming = [...inv.summary.upcomingRenewals].sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))[0];
  const sub = upcoming ? subs.get(upcoming.subscriptionId) : undefined;

  return {
    state: "live",
    budgetCents: profile.budget.maxMonthlyMinor,
    spentCents: inv.summary.knownMonthlyEquivalentMinor ?? 0,
    next:
      upcoming && sub
        ? {
            toolName: names.get(sub.toolId) ?? sub.toolId,
            days: Math.max(0, Math.ceil((new Date(upcoming.renewalDate).getTime() - loadedAt) / DAY)),
          }
        : null,
    version: profile.version,
    save: async (cents) => {
      try {
        setProfile(await api.saveProfile(withBudget(profile, cents)));
        return null;
      } catch (e) {
        return explainFailure(e);
      }
    },
  };
}
