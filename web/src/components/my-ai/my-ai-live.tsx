"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, explainFailure } from "@/lib/api/client";
import type { ApiSubscription, CatalogTool, InventorySummary, ProfileVersion } from "@/lib/api/contract";
import {
  categoryLabel,
  ProfileInputError,
  toProfileInput,
  toSubscriptionInput,
  toUiProfile,
  toUiSubscription,
} from "@/lib/api/my-ai-map";
import type { Subscription } from "@/lib/types";
import { PageHeader } from "@/components/kit/page-header";
import { Button } from "@/components/ui/button";
import { homeSample } from "@/mocks/home";
import { profileSample } from "@/mocks/my-ai";
import { MyAiView, type MyAiLive as Live } from "./my-ai-view";

type Loaded = {
  subscriptions: ApiSubscription[];
  tools: Map<string, CatalogTool>;
  catalog: CatalogTool[];
  summary: InventorySummary;
  profile: ProfileVersion;
};

/** API errors as a sentence; profile input problems keep their own message. */
const plain = (e: unknown) => new Error(e instanceof ProfileInputError ? e.message : explainFailure(e));

/**
 * My AI on the Wallio API: GET /api/inventory, /api/profile and /api/catalog to load;
 * POST and PATCH /api/inventory for tools; POST /api/profile/versions for every profile edit.
 * If the API can't be reached, the sample screen shows, labelled as such.
 */
export function MyAiLive() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const profile = useRef<ProfileVersion | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([api.inventory(), api.profile(), api.catalog()]).then(
      ([inv, prof, catalog]) => {
        if (!alive) return;
        const tools = new Map<string, CatalogTool>([...catalog, ...inv.tools].map((t) => [t.id, t]));
        profile.current = prof;
        setSummary(inv.summary);
        setBudget(prof.budget.maxMonthlyMinor);
        setFailed(null);
        setData({ subscriptions: inv.subscriptions, tools, catalog, summary: inv.summary, profile: prof });
      },
      (e) => alive && setFailed(explainFailure(e)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const initial = useMemo(
    () => (data ? data.subscriptions.map((s) => toUiSubscription(s, data.tools)) : []),
    [data],
  );
  const uiProfile = useMemo(() => (data ? toUiProfile(data.profile) : null), [data]);

  if (failed && !data) {
    return (
      <div className="flex flex-col gap-gutter">
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface-1 px-5 py-3">
          <span className="text-text-1">{failed}</span>
          <span className="text-text-3">Showing sample data meanwhile. Changes here aren&apos;t saved.</span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
        <MyAiView initial={homeSample.subscriptions} profile={profileSample} today={homeSample.today} />
      </div>
    );
  }

  if (!data || !uiProfile || !summary || budget === null) {
    return (
      <div className="flex flex-col gap-section">
        <PageHeader title="My AI" subtitle="Loading from the Wallio API…" />
      </div>
    );
  }

  /** After any write, take the server's fresh totals. */
  const refreshSummary = async () => {
    try {
      setSummary((await api.inventory()).summary);
    } catch {
      // Keep the last totals; the next load will correct them.
    }
  };

  const live: Live = {
    catalog: data.catalog.map((t) => ({ id: t.id, name: t.name, category: categoryLabel(t.category) })),
    totalCents: summary.knownMonthlyEquivalentMinor,
    unknownCount: summary.unknownPriceCount,
    budgetCents: budget,
    saveTool: async (s: Subscription, isNew: boolean) => {
      try {
        const input = toSubscriptionInput(s);
        const saved = isNew
          ? await api.addSubscription(input)
          : await api.updateSubscription(s.id, { ...input, status: s.status });
        await refreshSummary();
        return toUiSubscription(saved, data.tools);
      } catch (e) {
        throw plain(e);
      }
    },
    setStatus: async (id, status) => {
      try {
        const saved = await api.updateSubscription(id, { status });
        await refreshSummary();
        return toUiSubscription(saved, data.tools);
      } catch (e) {
        throw plain(e);
      }
    },
    saveProfile: async (fields, workflows) => {
      try {
        const base = profile.current ?? data.profile;
        const next = await api.saveProfile(toProfileInput(base, fields, workflows));
        profile.current = next;
        setBudget(next.budget.maxMonthlyMinor);
        return next.version;
      } catch (e) {
        throw plain(e);
      }
    },
  };

  return <MyAiView initial={initial} profile={uiProfile} today={new Date().toISOString().slice(0, 10)} live={live} />;
}
