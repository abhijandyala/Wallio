"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotionConfig } from "motion/react";

type Kind = "money" | "integer";

// Values that already counted up this session. Revisiting a page shows them settled, no re-count.
const seen = new Set<string>();

const formatters: Record<Kind, (n: number) => string> = {
  // value is cents
  money: (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n / 100),
  integer: (n) => Math.round(n).toLocaleString("en-US"),
};

/** Counts up once on first view. Server renders the final value, so there is no layout shift. */
export function NumberTicker({
  value,
  kind = "integer",
  duration = 0.9,
}: {
  value: number;
  kind?: Kind;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const key = `${kind}:${value}`;
    if (!inView || reduce || !ref.current || seen.has(key)) return;
    seen.add(key);
    const node = ref.current;
    const format = formatters[kind];
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(kind === "money" ? Math.round(v) : v);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration, kind]);

  return (
    <span ref={ref} className="tnum">
      {formatters[kind](value)}
    </span>
  );
}
