"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * The page's light, drawn like the reference's: a fixed 2D canvas behind everything with
 * three soft radial circles orbiting the middle of the screen. The first and last are mint
 * glows, the middle one a black shade that swings in and out, so the light keeps shifting.
 * It runs on time, not scroll, at a tenth of real speed, and fades in over three seconds.
 * The canvas is kept small (about 960 x 540 worth of pixels) since it is all soft gradients.
 */
const BACKGROUND = "#020806";
const GLOW = ["#22b07c", "#0d4a35", "#03140d"];
const SHADE = ["#000000", "#000000", "#000000"];
const STOPS = [0, 0.44, 1];
const ALPHAS = [1, 0.7, 0];

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawCircle(ctx: CanvasRenderingContext2D, id: number, colors: string[], t: number, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const l = Math.min(w, h);
  const phase = (id / 3) * Math.PI * 2;
  let u = 0.5 * l;
  // The shade swings between the near and far side instead of keeping a fixed orbit.
  if (id === 1) u = -u / 2 + u * (Math.sin(t * 2) * 0.5 + 0.5);
  const x = cx + Math.cos(phase + t) * u;
  const y = cy + Math.sin(phase + t) * u;
  const r = l;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  STOPS.forEach((s, i) => g.addColorStop(s, rgba(colors[i], ALPHAS[i])));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    const size = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      // Cap the backing store at about 960 x 540 pixels, keeping the aspect ratio.
      const scale = Math.min(1, Math.sqrt((960 * 540) / (w * h)));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    };
    size();
    window.addEventListener("resize", size);

    let t = 2.2;
    let last = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      t += reduce ? 0 : ((now - last) / 1000) * 0.1;
      last = now;
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, w, h);
      drawCircle(ctx, 0, GLOW, t, w, h);
      drawCircle(ctx, 1, SHADE, t, w, h);
      drawCircle(ctx, 2, GLOW, t, w, h);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // Fade in like the reference (3s, power2.inOut).
    canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 0 : 3000, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 size-full opacity-0" />;
}
