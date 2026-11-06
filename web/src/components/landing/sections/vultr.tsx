"use client";

import { useEffect, useRef } from "react";
import { Btn, Container, Eyebrow } from "../ui";
import { VULTR } from "../content";
import { landMask } from "../land";

/**
 * "Built on Vultr", in the reference's globe card: copy on the left over deep mint, and on
 * the right a huge glowing planet, half off the card, with the land printed on it as a grid
 * of small dark dots. Ours is a real map (Natural Earth, orthographic), turned so the
 * Americas face us, with an aurora pin where the API runs: Los Angeles.
 */
const LON0 = -55;
const LAT0 = 30;
const LA = { lon: -118.24, lat: 34.05 };
const rad = Math.PI / 180;

function project(lon: number, lat: number) {
  const l = (lon - LON0) * rad;
  const p = lat * rad;
  const p0 = LAT0 * rad;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  return { x: Math.cos(p) * Math.sin(l), y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l), front: cosc > 0 };
}

function unproject(x: number, y: number) {
  const rho = Math.hypot(x, y);
  if (rho > 1) return null;
  const c = Math.asin(rho);
  const p0 = LAT0 * rad;
  if (rho === 0) return { lon: LON0, lat: LAT0, rho };
  const lat = Math.asin(Math.cos(c) * Math.sin(p0) + (y * Math.sin(c) * Math.cos(p0)) / rho) / rad;
  const lon = LON0 + Math.atan2(x * Math.sin(c), rho * Math.cos(c) * Math.cos(p0) - y * Math.sin(c) * Math.sin(p0)) / rad;
  return { lon: ((lon + 540) % 360) - 180, lat, rho };
}

export function Vultr() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let cancelled = false;
    let isLand: ((lon: number, lat: number) => boolean) | null = null;

    const draw = () => {
      const box = el.parentElement!;
      const W = box.clientWidth;
      const H = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
      const ctx = el.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = W / 1360;
      const cx = W * 0.95;
      const cy = H * 0.62;
      const r = 600 * s;

      ctx.clearRect(0, 0, W, H);
      // A wide bloom around the planet, spilling mint into the card.
      const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.7);
      halo.addColorStop(0, "rgba(214,255,238,0.5)");
      halo.addColorStop(0.2, "rgba(150,248,205,0.32)");
      halo.addColorStop(0.5, "rgba(88,246,177,0.12)");
      halo.addColorStop(1, "rgba(88,246,177,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
      // The planet, glowing: one gradient that runs past the rim and fades out, so the edge
      // is a soft bloom rather than a hard line. Pale aqua-mint inside, near white at the edge.
      const R = r * 1.1;
      const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      const at = (k: number) => k / 1.1;
      body.addColorStop(0, "#dcfbef");
      body.addColorStop(at(0.55), "#c8f6e3");
      body.addColorStop(at(0.84), "#d8faed");
      body.addColorStop(at(0.95), "rgba(243,255,250,1)");
      body.addColorStop(at(1.0), "rgba(243,255,250,0.75)");
      body.addColorStop(at(1.05), "rgba(214,255,238,0.25)");
      body.addColorStop(1, "rgba(214,255,238,0)");
      ctx.fillStyle = body;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      // A faint violet tint low on the far side, the aurora's third colour.
      const tint = ctx.createRadialGradient(cx + r * 0.55, cy + r * 0.45, 0, cx + r * 0.55, cy + r * 0.45, r * 0.7);
      tint.addColorStop(0, "rgba(226,210,255,0.35)");
      tint.addColorStop(1, "rgba(226,210,255,0)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = tint;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();

      // Land as a grid of small round dots, fading out well before the rim.
      if (isLand) {
        const step = 9 * s;
        const dot = 1.55 * s;
        for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y += step) {
          for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x += step) {
            const g = unproject((x - cx) / r, -(y - cy) / r);
            if (!g || !isLand(g.lon, g.lat)) continue;
            const fade = Math.min(1, (1 - g.rho) / 0.32);
            ctx.fillStyle = `rgba(74,128,114,${0.5 * fade})`;
            ctx.beginPath();
            ctx.arc(x, y, dot, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Pin the API's home.
      const la = project(LA.lon, LA.lat);
      if (pin.current && la.front) {
        pin.current.style.left = `${cx + la.x * r}px`;
        pin.current.style.top = `${cy - la.y * r}px`;
        pin.current.style.opacity = "1";
      }
    };

    draw();
    landMask(1440, 720).then((fn) => {
      if (cancelled) return;
      isLand = fn;
      draw();
    });
    const ro = new ResizeObserver(draw);
    ro.observe(el.parentElement!);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  return (
    <section id="vultr" className="scroll-mt-24">
      <Container>
        <div className="relative h-[37.625rem] overflow-hidden rounded-[1rem] wl-gloss bg-[radial-gradient(55%_65%_at_0%_100%,rgba(201,255,230,0.5),transparent_70%),radial-gradient(45%_55%_at_52%_115%,rgba(88,246,177,0.55),transparent_70%),linear-gradient(90deg,#05271c_0%,#0b4634_38%,#1d8a66_64%,#4fd3a2_88%)] max-md:h-auto max-md:pb-[22rem]">
          <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
          <div
            ref={pin}
            aria-hidden="true"
            className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-[0.6rem] opacity-0 transition-opacity duration-500 max-md:hidden"
          >
            <span className="relative size-[0.75rem] -translate-x-1/2 rounded-full bg-[#3fb3a6] shadow-[0_0_0_0.35rem_rgba(98,198,187,0.35),0_0_1.5rem_0.4rem_rgba(98,198,187,0.55)]" />
            <span className="rounded-[0.375rem] bg-[rgba(3,20,13,0.78)] px-[0.6rem] py-[0.35rem] text-[0.75rem] leading-none tracking-[0.09rem] text-white uppercase backdrop-blur-sm">
              {VULTR.pin}
            </span>
          </div>
          <div className="relative flex h-full flex-col justify-center pl-[5rem] max-md:px-6 max-md:pt-16">
            <Eyebrow>{VULTR.eyebrow}</Eyebrow>
            <h2 className="wl-h1 mt-[1.94rem]">{VULTR.title}</h2>
            <p className="wl-body mt-[3rem] max-w-[33.25rem] text-white">{VULTR.body}</p>
            <Btn href={VULTR.cta.href} variant="mint" className="mt-[3rem] self-start">
              {VULTR.cta.label}
            </Btn>
          </div>
        </div>
      </Container>
    </section>
  );
}
