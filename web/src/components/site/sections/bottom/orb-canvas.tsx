"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * A glassy lavender orb with a bright swirl turning slowly inside it. Plain 2D canvas.
 * Reduced motion draws one still frame.
 */
export function OrbCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let running = true;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    size();

    const draw = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.27;
      ctx.clearRect(0, 0, w, h);

      // Outer bloom
      const bloom = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9);
      bloom.addColorStop(0, "rgba(173,150,241,0.35)");
      bloom.addColorStop(1, "rgba(173,150,241,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);

      // Sphere body: light from the top left, deeper at the rim
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R * 1.05);
      body.addColorStop(0, "#e9e2ff");
      body.addColorStop(0.35, "#b9a6f5");
      body.addColorStop(0.75, "#8d74de");
      body.addColorStop(1, "#5d48a8");
      ctx.fillStyle = body;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // The swirl: a bright crescent that slowly turns
      const a = t * 0.00035;
      ctx.translate(cx, cy + R * 0.05);
      ctx.rotate(Math.sin(a) * 0.35);
      ctx.filter = `blur(${Math.max(1, R * 0.05)}px)`;
      const sw = ctx.createLinearGradient(-R, 0, R, 0);
      sw.addColorStop(0, "rgba(255,255,255,0)");
      sw.addColorStop(0.45, "rgba(255,255,255,0.95)");
      sw.addColorStop(1, "rgba(255,255,255,0.15)");
      ctx.fillStyle = sw;
      ctx.beginPath();
      ctx.moveTo(-R * 0.95, -R * 0.05);
      ctx.bezierCurveTo(-R * 0.4, R * (0.55 + 0.08 * Math.sin(a * 3)), R * 0.35, R * 0.4, R * 0.9, -R * 0.25);
      ctx.bezierCurveTo(R * 0.3, R * 0.15, -R * 0.35, R * 0.18, -R * 0.95, -R * 0.05);
      ctx.fill();
      ctx.filter = "none";
      ctx.restore();

      // Rim light and gloss
      const rim = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
      rim.addColorStop(0, "rgba(255,255,255,0)");
      rim.addColorStop(1, "rgba(255,255,255,0.35)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      if (running && !reduce) raf = requestAnimationFrame(draw);
    };
    draw(0);
    const ro = new ResizeObserver(() => {
      size();
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
