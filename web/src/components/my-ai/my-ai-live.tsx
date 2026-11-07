"use client";

import { useMemo } from "react";
import { api, explainFailure } from "@/lib/api/client";
import { load, prime, useApi } from "@/lib/api/cache";
import type { CatalogTool } from "@/lib/api/contract";
import {
  categoryLabel,
  ProfileInputError,
  toProfileInput,
  toSubscriptionInput,
  toUiProfile,
  toUiSubscription,
} from "@/lib/api/my-ai-map";
import type { Subscription } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { homeSample } from "@/mocks/home";
import { profileSample } from "@/mocks/my-ai";
import { MyAiView, type MyAiLive as Live } from "./my-ai-view";
import { MyAiSkeleton } from "./my-ai-skeleton";

/** API errors as a sentence; profile input problems keep their own message. */
const plain = (e: unknown) => new Error(e instanceof ProfileInputError ? e.message : explainFailure(e));

/**
 * My AI on the Wallio API: GET /api/inventory, /api/profile and /api/catalog to load;
 * POST and PATCH /api/inventory for tools; POST /api/profile/versions for every profile edit.
 * If the API can't be reached, the sample screen shows, labelled as such.
 */
export function MyAiLive() {
  // Shared with the other pages and prefetched by the app shell, so this is usually instant.
  const inv = useApi("inventory");
  const prof = useApi("profile");
  const cat = useApi("catalog");
  const failure = inv.error ?? prof.error ?? cat.error;

  const tools = useMemo(
    () => new Map<string, CatalogTool>([...(cat.data ?? []), ...(inv.data?.tools ?? [])].map((t) => [t.id, t])),
    [cat.data, inv.data],
  );
  const initial = useMemo(
    () => (inv.data ? inv.data.subscriptions.map((s) => toUiSubscription(s, tools)) : []),
    [inv.data, tools],
  );
  // The profile the screen was first drawn from; later saves build on the latest version.
  const uiProfile = useMemo(() => (prof.data ? toUiProfile(prof.data) : null), [prof.data]);

  const ready = inv.data && prof.data && cat.data && uiProfile;
  if (failure && !ready && !inv.loading && !prof.loading && !cat.loading) {
    return (
      <div className="flex flex-col gap-gutter">
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface-1 px-5 py-3">
          <span className="text-text-1">{explainFailure(failure)}</span>
          <span className="text-text-3">Showing sample data meanwhile. Changes here aren&apos;t saved.</span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => (["inventory", "profile", "catalog"] as const).forEach((k) => load(k, { force: true }).catch(() => {}))}
          >
            Try again
          </Button>
        </div>
        <MyAiView initial={homeSample.subscriptions} profile={profileSample} today={homeSample.today} />
      </div>
    );
  }
  if (!inv.data || !prof.data || !cat.data || !uiProfile) return <MyAiSkeleton />;

  const summary = inv.data.summary;
  const profile = prof.data;

  /** After any write, take the server's fresh inventory (and its totals) into the shared copy. */
  const refreshSummary = async () => {
    try {
      await load("inventory", { force: true });
    } catch {
      // Keep the last totals; the next load will correct them.
    }
  };

  const live: Live = {
    catalog: cat.data.map((t) => ({ id: t.id, name: t.name, category: categoryLabel(t.category) })),
    totalCents: summary.knownMonthlyEquivalentMinor,
    unknownCount: summary.unknownPriceCount,
    budgetCents: profile.budget.maxMonthlyMinor,
    saveTool: async (s: Subscription, isNew: boolean) => {
      try {
        const input = toSubscriptionInput(s);
        const saved = isNew
          ? await api.addSubscription(input)
          : await api.updateSubscription(s.id, { ...input, status: s.status });
        await refreshSummary();
        return toUiSubscription(saved, tools);
      } catch (e) {
        throw plain(e);
      }
    },
    setStatus: async (id, status) => {
      try {
        const saved = await api.updateSubscription(id, { status });
        await refreshSummary();
        return toUiSubscription(saved, tools);
      } catch (e) {
        throw plain(e);
      }
    },
    saveProfile: async (fields, workflows) => {
      try {
        const next = await api.saveProfile(toProfileInput(profile, fields, workflows));
        prime("profile", next);
        return next.version;
      } catch (e) {
        throw plain(e);
      }
    },
  };

  return <MyAiView initial={initial} profile={uiProfile} today={new Date().toISOString().slice(0, 10)} live={live} />;
}
