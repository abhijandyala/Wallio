"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * Particle candlesticks in 3D: each candle is a shell of lime points on a cylinder (a body
 * with thick wicks above and below, rounded at the ends), set out on a rising diagonal in
 * perspective. Each turns slowly on its own axis and its points twinkle. three.js; pauses
 * off screen; reduced motion draws one still frame.
 */

type Candle = { x: number; bottom: number; top: number; wickUp: number; wickDown: number };

// Rising left to right, the way the reference breaks out: world units, body bottom/top.
const CANDLES: Candle[] = [
  { x: -2.75, bottom: -1.95, top: -0.05, wickUp: 0.3, wickDown: 0.55 },
  { x: -1.85, bottom: -1.55, top: -0.35, wickUp: 0.4, wickDown: 0.35 },
  { x: -0.95, bottom: -1.1, top: 0.0, wickUp: 0.25, wickDown: 0.45 },
  { x: -0.05, bottom: -0.7, top: 0.65, wickUp: 0.3, wickDown: 0.3 },
  { x: 0.85, bottom: -0.35, top: 1.2, wickUp: 0.3, wickDown: 0.35 },
  { x: 1.75, bottom: 0.15, top: 0.95, wickUp: 0.55, wickDown: 0.35 },
  { x: 2.65, bottom: 0.45, top: 1.95, wickUp: 0.35, wickDown: 0.3 },
];

const VERT = `
attribute vec3 aCenter;
attribute vec2 aInfo; // twinkle phase, brightness
uniform float uTime, uPixel, uSize;
varying float vBright;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
void main() {
  // Turn each candle on its own vertical axis.
  vec3 local = position - aCenter;
  vec3 p = aCenter + rotY(uTime * 0.35 + aCenter.x) * local;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + aInfo.x * 2.0) + aInfo.x * 40.0);
  // Points facing away read dimmer, so the cylinder has a front and a back.
  vec3 n = rotY(uTime * 0.35 + aCenter.x) * normalize(vec3(local.x, 0.0, local.z) + 1e-5);
  float facing = 0.55 + 0.45 * n.z;
  vBright = aInfo.y * tw * facing * 1.15;
  gl_PointSize = uSize * uPixel * (0.7 + aInfo.y * 0.6) * (6.0 / -mv.z);
}
`;

const FRAG = `
uniform vec3 uColor, uHot;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d);
  vec3 col = mix(uColor, uHot, clamp((vBright - 0.8) * 2.5, 0.0, 1.0)) * vBright;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
}
`;

function buildPoints(dense: boolean) {
  const pos: number[] = [];
  const center: number[] = [];
  const info: number[] = [];
  let seed = 11;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const R = 0.3;
  const W = R * 0.42;
  const per = dense ? 1 : 0.55;
  for (const c of CANDLES) {
    const cy = (c.bottom + c.top) / 2;
    // A section of the shape: from y0 to y1 at radius r, rounding at the ends.
    const add = (y0: number, y1: number, r: number, n: number) => {
      for (let i = 0; i < n * per; i++) {
        const t = rand();
        const y = y0 + (y1 - y0) * t;
        // Round the ends: radius eases in over the last bit of each section.
        const edge = Math.min(y - y0, y1 - y) / Math.max(0.0001, Math.min(r * 0.55, (y1 - y0) / 2));
        const round = Math.sqrt(Math.min(1, Math.max(0.35, edge)));
        const inner = rand() < 0.06;
        const rr = r * round * (inner ? rand() * 0.85 : 1 + (rand() - 0.5) * 0.08);
        const a = rand() * Math.PI * 2;
        pos.push(c.x + Math.cos(a) * rr, y, Math.sin(a) * rr);
        center.push(c.x, cy, 0);
        info.push(rand(), inner ? 0.4 + rand() * 0.25 : 0.7 + Math.pow(rand(), 3) * 0.9);
      }
    };
    const h = c.top - c.bottom;
    add(c.bottom, c.top, R, h * 2900);
    add(c.top - 0.04, c.top + c.wickUp, W, c.wickUp * 1900);
    add(c.bottom - c.wickDown, c.bottom + 0.04, W, c.wickDown * 1900);
  }
  return { pos: new Float32Array(pos), center: new Float32Array(center), info: new Float32Array(info) };
}

export function CandlesCanvas({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;
      const phone = window.innerWidth < 768;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      // The soft halo around each candle, as on the reference.
      renderer.domElement.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 4px rgba(88,246,177,0.45));";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0, 0, 8.8);
      const group = new THREE.Group();
      // Turned so the row recedes: nearer, larger candles at the lower left.
      group.rotation.set(0.12, -0.42, 0.04);
      group.position.x = -0.3;
      scene.add(group);

      const pts = buildPoints(!phone);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pts.pos, 3));
      geo.setAttribute("aCenter", new THREE.BufferAttribute(pts.center, 3));
      geo.setAttribute("aInfo", new THREE.BufferAttribute(pts.info, 2));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 1.5 },
          uPixel: { value: dpr },
          uSize: { value: 2.1 },
          uColor: { value: new THREE.Color("#58f6b1") },
          uHot: { value: new THREE.Color("#eafff5") },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      group.add(points);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      let raf = 0;
      let visible = true;
      const draw = (t: number) => {
        mat.uniforms.uTime.value = reduce ? 1.5 : t / 1000;
        renderer.render(scene, camera);
        if (!reduce && visible) raf = requestAnimationFrame(draw);
      };
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        cancelAnimationFrame(raf);
        if (visible) raf = requestAnimationFrame(draw);
      });
      io.observe(el);
      raf = requestAnimationFrame(draw);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener("resize", resize);
        geo.dispose();
        mat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [reduce]);

  return <div ref={host} aria-hidden="true" className={className} />;
}
