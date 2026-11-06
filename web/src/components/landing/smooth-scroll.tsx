"use client";

import { useEffect } from "react";
import { useReducedMotionConfig } from "motion/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth, eased scrolling, set up the way the reference sets it up: Lenis with its own
 * defaults (lerp 0.1, wheel and touch at 1), stepped every animation frame. It moves the
 * real page scroll, so sticky panels and scroll-linked motion keep working. Off with
 * reduced motion.
 */
export function SmoothScroll() {
  const reduce = useReducedMotionConfig();
  useEffect(() => {
    if (reduce) return;
    const lenis = new Lenis({ lerp: 0.1, anchors: true });
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
