"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * Gooey white dots for the Explore panel. The reference plays a short video per item; ours
 * draws the same idea live: a few fixed dots on a hex layout, with travelling dots sliding
 * along the lines between them and melting into whatever they touch (an SVG blur-and-
 * threshold filter). Each item has its own layout, and switching items dips the drawing
 * out and back in over 0.13s, like their video swap.
 */

type Pt = [number, number];
type Pattern = { nodes: Pt[]; edges: { a: number; b: number; phase: number }[]; spin: number; speed: number };

const C = 326; // centre of the 652 box
const R = 194; // ring radius, as measured
const polar = (r: number, deg: number): Pt => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];

// Track: a centre and a ring of six; three dots shuttle out along alternate spokes.
const ring6 = [0, 60, 120, 180, 240, 300].map((d) => polar(R, d - 90));
const TRACK: Pattern = {
  nodes: [[C, C], ...ring6],
  edges: [
    { a: 0, b: 1, phase: 0 },
    { a: 0, b: 3, phase: 0.33 },
    { a: 0, b: 5, phase: 0.66 },
  ],
  spin: 0,
  speed: 0.32,
};

// Compare: a tight hex field of 19 dots with many short diagonal hops.
const hex: Pt[] = [];
const S = 92;
for (let q = -2; q <= 2; q++) {
  for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
    hex.push([C + S * (q + r / 2), C + S * r * 0.866]);
  }
}
const near = (i: number, dx: number, dy: number) =>
  hex.findIndex(([x, y]) => Math.abs(x - (hex[i][0] + dx)) < 1 && Math.abs(y - (hex[i][1] + dy)) < 1);
const diag: Pattern["edges"] = [];
hex.forEach((_, i) => {
  const j = near(i, S / 2, -S * 0.866);
  if (j >= 0 && i % 2 === 0) diag.push({ a: i, b: j, phase: (i * 0.137) % 1 });
});
const COMPARE: Pattern = { nodes: hex, edges: diag, spin: 0, speed: 0.38 };

// Decide: the ring again, every dot reaching for its neighbour while the ring turns.
const DECIDE: Pattern = {
  nodes: [[C, C], ...ring6],
  edges: [1, 2, 3, 4, 5, 6].map((a) => ({ a, b: a === 6 ? 1 : a + 1, phase: 0 })),
  spin: 0.06,
  speed: 0.28,
};

const PATTERNS = [TRACK, COMPARE, DECIDE];
const DOT = 28.5;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function Blobs({ active, className }: { active: number; className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const group = useRef<SVGGElement>(null);
  const pips = useRef<SVGGElement>(null);
  const shown = useRef(active);
  const reduce = useReducedMotionConfig();

  // Build the circles for the current pattern.
  const build = (i: number) => {
    const g = group.current;
    const p = pips.current;
    if (!g || !p) return;
    const pat = PATTERNS[i];
    const ns = "http://www.w3.org/2000/svg";
    g.replaceChildren();
    p.replaceChildren();
    pat.nodes.forEach(([x, y]) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(x));
      c.setAttribute("cy", String(y));
      c.setAttribute("r", String(i === 1 ? DOT * 0.8 : DOT));
      g.appendChild(c);
      const d = document.createElementNS(ns, "circle");
      d.setAttribute("cx", String(x));
      d.setAttribute("cy", String(y));
      d.setAttribute("r", "1.6");
      p.appendChild(d);
    });
    pat.edges.forEach(() => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("r", String(i === 1 ? DOT * 0.8 : DOT));
      c.dataset.travel = "1";
      g.appendChild(c);
    });
  };

  useEffect(() => {
    build(shown.current);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = reduce ? 1.3 : (now - t0) / 1000;
      const pat = PATTERNS[shown.current];
      const g = group.current;
      if (g) {
        const spin = pat.spin * t * 360;
        g.setAttribute("transform", `rotate(${spin} ${C} ${C})`);
        pips.current?.setAttribute("transform", `rotate(${spin} ${C} ${C})`);
        const travellers = g.querySelectorAll<SVGCircleElement>("[data-travel]");
        pat.edges.forEach((e, k) => {
          // Out and back: ease to the far dot, rest, ease home, rest.
          const u = (t * pat.speed + e.phase) % 1;
          const m = u < 0.4 ? ease(u / 0.4) : u < 0.5 ? 1 : u < 0.9 ? 1 - ease((u - 0.5) / 0.4) : 0;
          const [ax, ay] = pat.nodes[e.a];
          const [bx, by] = pat.nodes[e.b];
          const c = travellers[k];
          if (c) {
            c.setAttribute("cx", String(ax + (bx - ax) * m));
            c.setAttribute("cy", String(ay + (by - ay) * m));
          }
        });
      }
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  // Swap patterns with a quick dip, like the reference's video swap.
  useEffect(() => {
    if (active === shown.current) return;
    const el = svg.current;
    if (!el) return;
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 0 : 130, fill: "forwards" });
    out.onfinish = () => {
      shown.current = active;
      build(active);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 0 : 130, fill: "forwards" });
    };
  }, [active, reduce]);

  return (
    <svg ref={svg} viewBox="0 0 652 652" className={className} aria-hidden="true">
      <defs>
        <filter id="wl-goo" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
          <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
        </filter>
      </defs>
      <g filter="url(#wl-goo)" fill="#effff8">
        <g ref={group} />
      </g>
      <g ref={pips} fill="#128a5e" opacity="0.7" />
    </svg>
  );
}
