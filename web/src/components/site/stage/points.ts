import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/kit/logo-mark";

/**
 * Every particle has four homes and the shader blends between them:
 *  globe  a point on (or around) the earth: land, ocean, halo or dust
 *  burst  the same point thrown outward into a loose shell
 *  cloud  a low, wide cloud with a bright band
 *  shape  a point on our mark (placeholder for the reference's bust)
 * kind: 0 land, 1 ocean, 2 halo, 3 dust. rand: 0..1 per particle.
 */
export interface StagePoints {
  count: number;
  globe: Float32Array;
  burst: Float32Array;
  cloud: Float32Array;
  shape: Float32Array;
  info: Float32Array; // kind, rand
}

/** Small deterministic random, so the globe looks the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rasterises Natural Earth land (public domain) to an equirectangular mask. */
async function landMask(w: number, h: number): Promise<(lon: number, lat: number) => boolean> {
  const topo = (await import("world-atlas/land-110m.json")).default as unknown as Topology<{ land: GeometryCollection }>;
  const land = feature(topo, topo.objects.land);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  const x = (lon: number) => ((lon + 180) / 360) * w;
  const y = (lat: number) => ((90 - lat) / 180) * h;
  const features = "features" in land ? land.features : [land];
  for (const f of features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          // Rings that jump across the antimeridian would smear across the map; break them.
          const prev = ring[i - 1];
          if (i === 0 || (prev && Math.abs(prev[0] - lon) > 180)) ctx.moveTo(x(lon), y(lat));
          else ctx.lineTo(x(lon), y(lat));
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return (lon, lat) => {
    const px = Math.min(w - 1, Math.max(0, Math.floor(x(lon))));
    const py = Math.min(h - 1, Math.max(0, Math.floor(y(lat))));
    return data[(py * w + px) * 4] > 127;
  };
}

/** Filled pixels of our mark, as points in -1..1 (x) space. */
function markPoints(n: number, rand: () => number): Float32Array {
  const [vx, vy, vw, vh] = LOGO_VIEWBOX.split(" ").map(Number);
  const W = 600;
  const H = Math.round((W * vh) / vw);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(W / vw, H / vh);
  ctx.translate(-vx, -vy);
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D(LOGO_PATH));
  const data = ctx.getImageData(0, 0, W, H).data;
  const filled: number[] = [];
  for (let py = 0; py < H; py += 2) for (let px = 0; px < W; px += 2) if (data[(py * W + px) * 4 + 3] > 128) filled.push(px, py);
  const out = new Float32Array(n * 3);
  const scale = 2.3 / W;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rand() * (filled.length / 2)) * 2;
    const sx = (filled[k] + rand() * 2 - W / 2) * scale;
    const sy = -(filled[k + 1] + rand() * 2 - H / 2) * scale;
    // A little depth and curvature so it reads as a solid in 3D.
    const sz = (rand() - 0.5) * 0.22 - sx * sx * 0.12;
    out.set([sx, sy + 0.08, sz], i * 3);
  }
  return out;
}

export async function buildStagePoints(opts: { dense: boolean }): Promise<StagePoints> {
  const rand = rng(7);
  const isLand = await landMask(1440, 720);

  // Uniform points on the sphere (Fibonacci), sorted into land and ocean.
  const sphere = opts.dense ? 95000 : 45000;
  const land: number[] = [];
  const ocean: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < sphere; i++) {
    const yy = 1 - (i / (sphere - 1)) * 2;
    const r = Math.sqrt(1 - yy * yy);
    const th = golden * i;
    const px = Math.cos(th) * r;
    const pz = Math.sin(th) * r;
    const lat = (Math.asin(yy) * 180) / Math.PI;
    const lon = (Math.atan2(pz, px) * 180) / Math.PI;
    if (isLand(lon, lat)) land.push(px, yy, pz);
    else if (rand() < 0.07) ocean.push(px, yy, pz);
  }
  const halo = opts.dense ? 16000 : 7000;
  const dust = opts.dense ? 1800 : 900;
  const nLand = land.length / 3;
  const nOcean = ocean.length / 3;
  const count = nLand + nOcean + halo + dust;

  const globe = new Float32Array(count * 3);
  const info = new Float32Array(count * 2);
  globe.set(land, 0);
  globe.set(ocean, nLand * 3);
  let o = nLand + nOcean;
  for (let i = 0; i < halo; i++, o++) {
    // A ragged shell just outside the surface.
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dir = [Math.cos(t) * s, u, Math.sin(t) * s];
    const wobble = 0.05 * Math.sin(dir[0] * 5 + dir[1] * 3) + 0.04 * Math.cos(dir[2] * 7);
    const rad = 1.1 + Math.pow(rand(), 1.8) * 0.14 + wobble;
    globe.set([dir[0] * rad, dir[1] * rad, dir[2] * rad], o * 3);
  }
  for (let i = 0; i < dust; i++, o++) {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rad = 1.3 + rand() * 1.4;
    globe.set([Math.cos(t) * s * rad * 1.6, u * rad, Math.sin(t) * s * rad], o * 3);
  }
  for (let i = 0; i < count; i++) {
    const kind = i < nLand ? 0 : i < nLand + nOcean ? 1 : i < nLand + nOcean + halo ? 2 : 3;
    info.set([kind, rand()], i * 2);
  }

  // Burst: thrown outward. A third stay on a thin, bright shell; the rest scatter and sag.
  const burst = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const gx = globe[i * 3];
    const gy = globe[i * 3 + 1];
    const gz = globe[i * 3 + 2];
    const len = Math.hypot(gx, gy, gz) || 1;
    const thin = rand() < 0.34;
    const rad = thin ? 1.13 + rand() * 0.03 : 1.16 + Math.pow(rand(), 1.6) * 0.55;
    const swirl = (rand() - 0.5) * 0.25;
    burst.set(
      [(gx / len) * rad * (1 + swirl * 0.2), (gy / len) * rad * 1.04 - (thin ? 0 : rand() * 0.18), (gz / len) * rad],
      i * 3,
    );
  }

  // Cloud: a soft dome over a bright horizontal band, with a faint drift below.
  const cloud = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const pick = rand();
    let x: number, y: number, z: number;
    if (pick < 0.5) {
      // A soft dome, densest near its base.
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.92;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r * 0.6;
      y = 0.0 + Math.sqrt(Math.max(0, 0.85 - r * r)) * Math.pow(rand(), 1.4) * 0.9;
    } else if (pick < 0.86) {
      // The bright band, pulled into horizontal streaks.
      const lane = Math.floor(rand() * 7);
      x = (rand() - 0.5) * 2.3 * (0.35 + rand() * 0.65);
      y = -0.08 + lane * 0.022 + (rand() - 0.5) * 0.012;
      z = (rand() - 0.5) * 0.7;
    } else {
      // A faint drift below, wider as it falls.
      const fall = rand();
      x = (rand() - 0.5) * (0.9 + fall * 1.2) + 0.12;
      y = -0.14 - fall * 1.0;
      z = (rand() - 0.5) * 0.7;
    }
    cloud.set([x, y, z], i * 3);
  }

  const shape = markPoints(count, rand);
  return { count, globe, burst, cloud, shape, info };
}
