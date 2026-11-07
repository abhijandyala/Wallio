"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "./client";
import type { Health } from "./contract";

/**
 * One shared copy of what the app reads from the Wallio API, so moving between pages is
 * instant: a page shows what's already loaded and refreshes it in the background
 * (stale-while-revalidate). Writes put the server's answer back here, or mark it stale.
 *
 * The app shell prefetches everything once the first page is up (see Prefetch).
 */

/** Health gives up after 6 s, so a hung API reads as offline instead of "checking" forever. */
const health = () =>
  Promise.race([
    api.health(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The Wallio API didn't answer in time.")), 6000)),
  ]);

const FETCHERS = {
  health,
  catalog: api.catalog,
  profile: api.profile,
  inventory: api.inventory,
  decisions: api.decisions,
};
export type ApiKey = keyof typeof FETCHERS;
type Data<K extends ApiKey> = Awaited<ReturnType<(typeof FETCHERS)[K]>>;

/** How long a copy counts as fresh. Older copies still show, and refresh behind them. */
const MAX_AGE: Record<ApiKey, number> = {
  health: 30_000,
  catalog: 10 * 60_000, // the same for everyone, rarely changes
  profile: 60_000,
  inventory: 30_000,
  decisions: 10_000,
};

interface Entry {
  data?: unknown;
  at: number;
  error?: unknown;
  promise?: Promise<unknown>;
}
const entries = new Map<ApiKey, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};

/**
 * The first visit has no guest cookie yet, and parallel calls would each start their own
 * guest workspace. So the first workspace call goes alone; the rest wait for its cookie.
 */
let session: Promise<unknown> | null = null;

function fetchNow<K extends ApiKey>(key: K): Promise<Data<K>> {
  const run = () => FETCHERS[key]() as Promise<Data<K>>;
  if (key === "health" || key === "catalog") return run();
  if (!session) {
    const first = run();
    session = first.catch(() => undefined);
    return first;
  }
  return session.then(run);
}

/** Load a key, deduplicating calls in flight. `force` skips the freshness check. */
export function load<K extends ApiKey>(key: K, opts: { force?: boolean } = {}): Promise<Data<K>> {
  const e = entries.get(key);
  if (e?.promise) return e.promise as Promise<Data<K>>;
  if (!opts.force && e?.data !== undefined && Date.now() - e.at < MAX_AGE[key]) {
    return Promise.resolve(e.data as Data<K>);
  }
  const promise = fetchNow(key).then(
    (data) => {
      entries.set(key, { data, at: Date.now() });
      emit();
      return data;
    },
    (error) => {
      const prev = entries.get(key);
      entries.set(key, { data: prev?.data, at: prev?.at ?? 0, error });
      emit();
      throw error;
    },
  );
  entries.set(key, { ...(e ?? { at: 0 }), promise });
  emit();
  return promise;
}

/** Put the server's own answer in place (after a write that returns it). */
export function prime<K extends ApiKey>(key: K, data: Data<K>) {
  entries.set(key, { data, at: Date.now() });
  emit();
}

/** Mark keys stale after a write; pages showing them refresh in the background. */
export function invalidate(...keys: ApiKey[]) {
  for (const key of keys) {
    const e = entries.get(key);
    if (e) e.at = 0;
    load(key, { force: true }).catch(() => {});
  }
}

/** Everything the app pages read, fetched ahead of time. Errors are left for the pages. */
export function prefetchAppData() {
  for (const key of ["profile", "inventory", "decisions", "catalog", "health"] as const) {
    load(key).catch(() => {});
  }
}

export interface Cached<T> {
  data: T | undefined;
  error: unknown;
  /** True while a request is in flight (first load or a background refresh). */
  loading: boolean;
}

/** Read a key and keep it fresh. Shows the cached copy at once if there is one. */
export function useApi<K extends ApiKey>(key: K): Cached<Data<K>> {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
  useEffect(() => {
    load(key).catch(() => {});
  }, [key]);
  const e = entries.get(key);
  return { data: e?.data as Data<K> | undefined, error: e?.error, loading: !!e?.promise };
}

export type ApiStatus =
  | { state: "checking" }
  | { state: "online"; runMode: Health["runMode"] }
  | { state: "offline" };

/** Is the Wallio API reachable, and is it playing demo runs or running live ones? */
export function useApiStatus(): ApiStatus {
  const h = useApi("health");
  if (h.data) return h.data.ok ? { state: "online", runMode: h.data.runMode } : { state: "offline" };
  if (h.error && !h.loading) return { state: "offline" };
  return { state: "checking" };
}
