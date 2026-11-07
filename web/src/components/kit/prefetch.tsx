"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { prefetchAppData } from "@/lib/api/cache";
import { NAV_ITEMS } from "./nav-items";

/**
 * Warms the app once the first page is up: every section's code, and the API data they read
 * (inventory, profile, decisions, catalog, health). Opening any page after that is instant.
 */
export function Prefetch() {
  const router = useRouter();
  useEffect(() => {
    // Data first: it's what pages wait on. Route code once the browser is idle.
    prefetchAppData();
    const warm = () => NAV_ITEMS.forEach((i) => router.prefetch(i.href));
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(warm, 300);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}
