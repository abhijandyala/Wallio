"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";

/** True on phone widths, where the scroll-linked desktop choreography is switched off. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
