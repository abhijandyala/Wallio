import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

/** Rasterises Natural Earth land (public domain) to an equirectangular mask. */
export async function landMask(w: number, h: number): Promise<(lon: number, lat: number) => boolean> {
  const topo = (await import("world-atlas/land-50m.json")).default as unknown as Topology<{ land: GeometryCollection }>;
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
