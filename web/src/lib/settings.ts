"use client";

import { useSyncExternalStore } from "react";

/**
 * User settings. Saved in this browser until the API lands.
 * TODO(api): GET/PATCH /api/settings. Safety limits (actions, time, allowed sites) are enforced
 * by the server no matter what is stored here; the UI only shows them.
 */
export interface Settings {
  // Account
  displayName: string;
  timeZone: string;
  currency: "USD";

  // Spending
  budgetCents: number;
  warnAtPct: number;
  renewalLeadDays: number;
  annualDisplay: "monthly" | "actual";
  includeTax: boolean;

  // Agent and runs
  runCapCents: number;
  monthlyRunLimitCents: number;
  runsPerTool: number;
  approvalValidMins: number;
  blockedSites: string[];
  redactScreenshots: boolean;
  reResearchBeforeRenewal: boolean;
  reResearchDays: number;
  autoCompareBeforeRenewal: boolean;

  // Profile behaviour
  allowGuesses: boolean;
  localPreference: "any" | "local" | "cloud";
  platforms: string[];

  // Connections
  githubConnected: boolean;

  // Notifications
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifyApproval: boolean;
  notifyRunFinished: boolean;
  notifyRenewal: boolean;
  notifyPriceChanges: "big" | "all" | "off";
  notifyNewMatches: "digest" | "now" | "off";
  digest: "daily" | "weekly" | "off";
  digestDay: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  digestTime: string; // "09:00"
  quietHours: boolean;
  quietFrom: string;
  quietTo: string;
  mutedProviders: string[];

  // Privacy and data
  keepScreenshotsDays: number;
  keepReportsDays: number;
  shareForImprovement: boolean;
  analytics: boolean;
  referralTools: "show" | "hide";
  deletionScheduledFor: string | null; // ISO date

  // Display
  reduceMotion: "system" | "always";
  myAiView: "cards" | "table";

  // Demo only
  simulate: "none" | "partial" | "failed" | "timed_out" | "reconnecting" | "cleanup_failed";
}

const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
};

export const DEFAULT_SETTINGS: Settings = {
  // Empty until the person sets a name in Settings; Home then just says "Welcome back".
  displayName: "",
  timeZone: "America/New_York",
  currency: "USD",
  budgetCents: 12000,
  warnAtPct: 80,
  renewalLeadDays: 14,
  annualDisplay: "monthly",
  includeTax: false,
  runCapCents: 50,
  monthlyRunLimitCents: 500,
  runsPerTool: 3,
  approvalValidMins: 60,
  blockedSites: [],
  redactScreenshots: true,
  reResearchBeforeRenewal: true,
  reResearchDays: 7,
  autoCompareBeforeRenewal: false,
  allowGuesses: true,
  localPreference: "any",
  platforms: ["macOS", "Web"],
  githubConnected: true,
  notifyInApp: true,
  notifyEmail: false,
  notifyApproval: true,
  notifyRunFinished: true,
  notifyRenewal: true,
  notifyPriceChanges: "big",
  notifyNewMatches: "digest",
  digest: "weekly",
  digestDay: "mon",
  digestTime: "09:00",
  quietHours: false,
  quietFrom: "22:00",
  quietTo: "08:00",
  mutedProviders: [],
  keepScreenshotsDays: 7,
  keepReportsDays: 90,
  shareForImprovement: false,
  analytics: false,
  referralTools: "show",
  deletionScheduledFor: null,
  reduceMotion: "system",
  myAiView: "cards",
  simulate: "none",
};

const KEY = "wallio.settings.v1";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

function read(): Settings {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : { ...DEFAULT_SETTINGS, timeZone: localZone() };
  } catch {
    cache = { ...DEFAULT_SETTINGS, timeZone: localZone() };
  }
  return cache!;
}

function write(next: Settings) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage blocked: settings still apply for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateSettings(patch: Partial<Settings>) {
  write({ ...read(), ...patch });
}

export function resetSettings() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  cache = null;
  listeners.forEach((l) => l());
}

/** Read settings anywhere. Server render and first paint use the defaults. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS);
}
