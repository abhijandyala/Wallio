"use client";

import { useEffect } from "react";
import { useReducedMotionConfig } from "motion/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth, eased scrolling for the landing page, tuned like the reference
 * (lerp 0.1, wheel and touch 0.75). Native scroll underneath, so sticky sections,
 * scroll-linked motion and the particle stage all keep working. Off with reduced motion.
 */
export function SmoothScroll() {
  const reduce = useReducedMotionConfig();
  useEffect(() => {
    if (reduce) return;
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.75, touchMultiplier: 0.75 });
    let raf = 0;
    const tick = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduce]);
  return null;
}
