"use client";

import { MotionConfig } from "motion/react";
import { useSettings } from "@/lib/settings";

/** Applies the "Reduce motion" setting to every animation. "system" follows the OS. */
export function MotionPrefs({ children }: { children: React.ReactNode }) {
  const { reduceMotion } = useSettings();
  return (
    <MotionConfig reducedMotion={reduceMotion === "always" ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}
