"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%&*@#+=?!";
const TINTS = ["var(--w-lime)", "var(--w-lavender)", "var(--w-text-3)"];

type Cell = { ch: string; color: string; opacity: number };

/**
 * Decode effect: characters appear at random positions as flickering glyphs
 * (lime / lavender), then lock into the real text. Re-runs whenever `text` changes.
 * Mono font so the line never shifts while it resolves.
 */
export function ScrambleText({
  text,
  duration = 700,
  className,
  animateOnMount = true,
  instant = false,
}: {
  text: string;
  duration?: number;
  className?: string;
  /** false = render the text as-is first, and only decode when `text` changes. */
  animateOnMount?: boolean;
  /** Skip the decode and show `text` immediately (e.g. returning to a label set in a proportional font). */
  instant?: boolean;
}) {
  const reduce = useReducedMotionConfig();
  const [cells, setCells] = useState<Cell[]>(() =>
    animateOnMount ? blank(text) : final(text),
  );
  const raf = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (!animateOnMount) return;
    }
    if (reduce || instant) {
      raf.current = requestAnimationFrame(() => setCells(final(text)));
      return () => cancelAnimationFrame(raf.current);
    }
    // Per character: when it starts flickering, and when it locks to the real letter.
    const plan = [...text].map((ch) => {
      const appear = Math.random() * duration * 0.55;
      const lock = Math.min(
        duration,
        appear + duration * (0.2 + Math.random() * 0.3),
      );
      return { ch, appear, lock };
    });
    let start = 0;
    let lastFlicker = 0;
    let glyphs = plan.map(() => randomCell());

    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      if (now - lastFlicker > 45) {
        glyphs = plan.map(() => randomCell());
        lastFlicker = now;
      }
      setCells(
        plan.map((p, i) => {
          if (p.ch === " ") return { ch: " ", color: "inherit", opacity: 1 };
          if (t < p.appear) return { ch: " ", color: "inherit", opacity: 0 };
          if (t < p.lock) {
            const rise = Math.min(1, (t - p.appear) / 120);
            return { ...glyphs[i], opacity: 0.35 + 0.65 * rise };
          }
          return { ch: p.ch, color: "inherit", opacity: 1 };
        }),
      );
      if (t < duration) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [text, duration, reduce, animateOnMount, instant]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">
        {(instant || reduce ? final(text) : cells).map((c, i) => (
          <span key={i} style={{ color: c.color, opacity: c.opacity }}>
            {c.ch === " " ? " " : c.ch}
          </span>
        ))}
      </span>
    </span>
  );
}

function randomCell(): Cell {
  return {
    ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    color: TINTS[Math.floor(Math.random() * TINTS.length)],
    opacity: 1,
  };
}
function blank(text: string): Cell[] {
  return [...text].map(() => ({ ch: " ", color: "inherit", opacity: 0 }));
}
function final(text: string): Cell[] {
  return [...text].map((ch) => ({ ch, color: "inherit", opacity: 1 }));
}
