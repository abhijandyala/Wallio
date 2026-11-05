"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/** One candle: centre x (0..1), body top/bottom and wick top/bottom (0..1, top = 0). */
type Candle = { x: number; bt: number; bb: number; wt: number; wb: number };

// Rising left to right, like a chart breaking out.
const CANDLES: Candle[] = [
  { x: 0.12, wt: 0.42, bt: 0.47, bb: 0.86, wb: 0.92 },
  { x: 0.25, wt: 0.46, bt: 0.5, bb: 0.8, wb: 0.88 },
  { x: 0.37, wt: 0.38, bt: 0.43, bb: 0.68, wb: 0.78 },
  { x: 0.5, wt: 0.3, bt: 0.36, bb: 0.6, wb: 0.66 },
  { x: 0.62, wt: 0.22, bt: 0.27, bb: 0.6, wb: 0.66 },
  { x: 0.73, wt: 0.2, bt: 0.26, bb: 0.45, wb: 0.51 },
  { x: 0.84, wt: 0.07, bt: 0.12, bb: 0.36, wb: 0.42 },
];

interface Dot {
  x: number;
  y: number;
  r: number;
  a: number;
  s: number;
  p: number;
}

/** Lime point-cloud candlesticks that shimmer. 2D canvas; reduced motion draws one frame. */
export function CandlesCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let dots: Dot[] = [];
    let raf = 0;
    let running = true;

    // Deterministic noise so the cloud looks the same on every load.
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    const build = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      const W = canvas.width;
      const H = canvas.height;
      const bodyW = W * 0.045;
      seed = 7;
      dots = [];
      for (const c of CANDLES) {
        const cx = c.x * W;
        // body: dense cloud with a soft, slightly ragged edge
        const n = Math.round(((c.bb - c.bt) * H * bodyW) / (4.5 * dpr * dpr)) + 220;
        for (let i = 0; i < n; i++) {
          const u = rnd();
          const edge = Math.pow(rnd(), 0.6);
          const side = rnd() < 0.5 ? -1 : 1;
          dots.push({
            x: cx + side * edge * bodyW * 0.5 * (0.85 + 0.3 * rnd()),
            y: (c.bt + (c.bb - c.bt) * u) * H,
            r: (0.45 + rnd() * 0.8) * dpr,
            a: 0.35 + rnd() * 0.65,
            s: 0.5 + rnd() * 2,
            p: rnd() * Math.PI * 2,
          });
        }
        // wicks
        for (const [a, b] of [
          [c.wt, c.bt],
          [c.bb, c.wb],
        ]) {
          const m = Math.round(((b - a) * H) / (2.2 * dpr)) + 6;
          for (let i = 0; i < m; i++) {
            dots.push({
              x: cx + (rnd() - 0.5) * bodyW * 0.12,
              y: (a + (b - a) * rnd()) * H,
              r: (0.5 + rnd() * 0.6) * dpr,
              a: 0.3 + rnd() * 0.6,
              s: 0.5 + rnd() * 2,
              p: rnd() * Math.PI * 2,
            });
          }
        }
      }
    };
    build();

    const draw = (t: number) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      // A soft body glow behind each candle, so the point cloud reads as a lit solid.
      ctx.filter = `blur(${Math.round(W * 0.012)}px)`;
      ctx.fillStyle = "rgba(88,246,177,0.22)";
      for (const c of CANDLES) ctx.fillRect(c.x * W - W * 0.02, c.bt * H, W * 0.04, (c.bb - c.bt) * H);
      ctx.filter = "none";
      for (const d of dots) {
        const flicker = reduce ? 1 : 0.55 + 0.45 * Math.sin(t * 0.002 * d.s + d.p);
        ctx.globalAlpha = d.a * flicker;
        ctx.fillStyle = d.a > 0.85 ? "#e8fff4" : "#58f6b1";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (running && !reduce) raf = requestAnimationFrame(draw);
    };
    draw(0);
    const ro = new ResizeObserver(() => {
      build();
      if (reduce) draw(0);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      running = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (running && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
