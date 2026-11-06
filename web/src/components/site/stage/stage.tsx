"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";
import type { Scene } from "./scenes";
import { buildStagePoints } from "./points";

/**
 * The fixed particle stage behind the page: a point-cloud earth that rises, turns,
 * bursts, settles into a cloud and gathers into our mark, then comes back as a globe
 * for the steps section. Sections drive it with data-stage markers (see scenes.ts).
 *
 * Colors are Wallio lime. Built with three.js; the continents are Natural Earth land.
 */

const VERT = /* glsl */ `
attribute vec3 aGlobe;
attribute vec3 aBurst;
attribute vec3 aCloud;
attribute vec3 aShape;
attribute vec2 aInfo;
uniform float uTime, uBurst, uCloud, uShape, uSpin, uTilt, uSize, uPixel, uMirror, uFloor, uScale, uShapeTurn;
uniform vec3 uOffset;
varying float vBright;
varying float vAlpha;

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }

void main() {
  mat3 R = rotX(uTilt) * rotY(uSpin);
  vec3 g = R * aGlobe;
  vec3 b = R * aBurst;
  float kind = aInfo.x;
  float r = aInfo.y;

  vec3 p = mix(g, b, uBurst);
  p = mix(p, aCloud, uCloud);
  p = mix(p, rotY(uShapeTurn) * aShape, uShape);
  // Each particle breathes a little.
  float loose = 0.004 + 0.02 * (uBurst + uCloud) * (1.0 - uShape);
  p += loose * vec3(sin(uTime * 1.3 + r * 41.0), cos(uTime * 1.1 + r * 29.0), sin(uTime * 0.9 + r * 17.0));
  p = p * uScale + uOffset;
  float below = 0.0;
  if (uMirror > 0.5) { below = max(0.0, p.y - uFloor); p.y = 2.0 * uFloor - p.y; }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // Light: bright land, dim ocean, a hot rim, and the far side faded.
  float globeW = (1.0 - uBurst) * (1.0 - uCloud) * (1.0 - uShape);
  vec3 n = normalize(g);
  float facing = n.z;
  float rim = pow(1.0 - clamp(abs(facing), 0.0, 1.0), 3.0);
  float base = kind < 0.5 ? 0.6 : (kind < 1.5 ? 0.22 : (kind < 2.5 ? 0.28 : 0.2));
  float surface = kind < 1.5 ? 1.0 : 0.25;
  float back = facing < 0.0 ? mix(1.0, 0.1, globeW * surface) : 1.0;
  float lit = base * back + rim * 0.95 * surface * step(0.0, facing) * globeW;
  // Burst: a thin shell keeps a bright rim; the loose points stay dim, so the middle reads see-through.
  vec3 nb = normalize(b);
  float shell = step(length(aBurst), 1.165);
  float rimB = pow(1.0 - clamp(abs(nb.z), 0.0, 1.0), 4.0);
  float burstLit = mix(0.16 + r * 0.22, 0.2 + rimB * 1.3, shell);
  float cloudLit = 0.22 + r * 0.38;
  float shapeLit = 0.5 + r * 0.55;
  float scattered = mix(burstLit, cloudLit, uCloud);
  scattered = mix(scattered, shapeLit, uShape);
  vBright = mix(lit, scattered, 1.0 - globeW);
  if (uMirror > 0.5) vBright = min(vBright, 0.85);

  float size = uSize * (kind < 0.5 ? 1.0 : 0.78) * (0.65 + r * 0.7);
  gl_PointSize = size * uPixel * (4.8 / -mv.z);
  vAlpha = uMirror > 0.5 ? 0.75 * exp(-below * 1.1) : 1.0;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uOpacity;
varying float vBright;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.32, d);
  vec3 col = mix(uColor, uHot, clamp((vBright - 0.95) * 1.2, 0.0, 0.6)) * vBright;
  gl_FragColor = vec4(col, a * vAlpha * uOpacity);
}
`;

/**
 * The water: the mirrored particles (rendered to a texture) drawn below the horizon with
 * ripples that bunch up toward the horizon like a real surface seen at an angle, a little
 * smear, glints on the crests, and a faint lit surface around the middle.
 */
const WATER_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const WATER_FRAG = /* glsl */ `
uniform sampler2D tMirror;
uniform float uTime, uHorizon, uOpacity, uAspect;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  float below = uHorizon - vUv.y;
  if (below <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float persp = 1.0 / (below * 7.0 + 0.22);
  float x = (vUv.x - 0.5) * uAspect;
  float wave = sin(persp * 9.0 - uTime * 1.5 + sin(x * 9.0 + uTime * 0.5) * 1.3)
             + 0.55 * sin(persp * 19.0 + x * 7.0 - uTime * 2.2)
             + 0.15 * sin(persp * 23.0 - x * 11.0 + uTime * 1.1);
  float near = smoothstep(0.0, 0.04, below);
  vec2 off = vec2(wave * 0.0045, wave * 0.011) * near;
  vec3 c = texture2D(tMirror, vUv + off).rgb * 0.5
         + texture2D(tMirror, vUv + off * 1.7 + vec2(0.0035, 0.0)).rgb * 0.25
         + texture2D(tMirror, vUv + off * 0.6 - vec2(0.0035, 0.0)).rgb * 0.25;
  float crest = smoothstep(0.55, 1.0, wave * 0.33 + 0.5);
  float fade = smoothstep(0.0, 0.012, below) * exp(-below * 1.9);
  float middle = exp(-x * x * 2.4);
  vec3 surface = uTint * (0.018 + 0.045 * crest) * exp(-below * 2.6) * middle;
  vec3 col = c * (0.95 + crest * 0.9) * fade + surface;
  gl_FragColor = vec4(col * uOpacity, 1.0);
}
`;

/** Where each scene wants the stage to be. t = scene progress 0..1. */
interface Target {
  opacity: number;
  burst: number;
  cloud: number;
  shape: number;
  y: number;
  x: number;
  scale: number;
  spin: number;
  tilt: number;
  bars: number;
  /** How much the globe turns on its own (0 = holds still). */
  drift: number;
  /** Water line, in globe radii below the centre. */
  floor: number;
  /** Water strength 0..1. */
  water: number;
}

// Turn that puts a longitude in front of the camera: lon = 90deg + turn.
const ASIA = 0.5; // ~118E: Asia over Australia
const START = -0.25; // ~76E: India, as the reference opens

function target(scene: Scene | null, t: number, scroll: number): Target {
  const spin = START - scroll * 0.0009;
  const off: Target = { opacity: 0, burst: 0, cloud: 0, shape: 0, y: 0, x: 0, scale: 1, spin, tilt: 0.3, bars: 0, drift: 1, floor: -1.12, water: 0 };
  const ease = (v: number) => v * v * (3 - 2 * v);
  switch (scene) {
    case "hero":
      // Opens low behind the hero copy and rises to the centre, growing.
      return { ...off, opacity: 1, y: -0.9 + ease(t) * 0.88, bars: 1 - ease(Math.min(1, t * 1.25)), scale: 1 + ease(t) * 0.1, water: 0.25 };
    case "stats":
      return { ...off, opacity: 1, y: -0.02, scale: 1.1 + t * 0.06, water: 0.35 + t * 0.25 };
    case "burst": {
      const a = ease(Math.min(1, t * 1.8));
      const b = ease(Math.max(0, (t - 0.45) / 0.55));
      // The water rises to meet the cloud and brightens with its reflection.
      return { ...off, opacity: 1, burst: a, cloud: b, y: -0.02 - b * 0.15, scale: 1.16 - b * 0.16, floor: -1.12 + b * 0.94, water: 0.6 + a * 0.4 };
    }
    case "gateway": {
      const s = ease(Math.min(1, t * 4.5));
      return { ...off, opacity: 1 - ease(Math.max(0, (t - 0.82) / 0.18)), burst: 1, cloud: 1, shape: s, y: -0.17 + s * 0.12, scale: 1, floor: -0.18 - s * 0.9, water: 1 - s };
    }
    case "steps":
      return {
        ...off,
        opacity: Math.min(1, t * 6) * (1 - ease(Math.max(0, (t - 0.9) / 0.1))),
        spin: ASIA - t * 0.35,
        tilt: 0.08,
        drift: 0,
        // Rises from below as the section arrives, then sits on its water.
        y: -0.08 - (1 - ease(Math.min(1, t * 4.5))) * 0.75,
        scale: 0.86,
        floor: -1.06,
        water: 0.95,
      };
    default:
      return off;
  }
}

/**
 * Where on the screen each scene is read. Pinned scenes start when their wrapper reaches
 * the top of the viewport, like the reference's pins; the steps globe starts earlier so it
 * rises into view under the section above.
 */
const LINE: Partial<Record<Scene, number>> = { steps: 0.65 };

/** The scene whose marked wrapper holds its reading line, and how far through it we are. */
function readScene(): { scene: Scene | null; t: number } {
  const h = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>("[data-stage]")) {
    const scene = el.dataset.stage as Scene;
    const line = (LINE[scene] ?? 0) * h;
    const r = el.getBoundingClientRect();
    if (r.top <= line && r.bottom > line) {
      return { scene, t: Math.min(1, Math.max(0, (line - r.top) / r.height)) };
    }
  }
  return { scene: null, t: 0 };
}

export function Stage() {
  const host = useRef<HTMLDivElement>(null);
  const bars = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const phone = window.innerWidth < 768;
      const pts = await buildStagePoints({ dense: !phone });
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
      const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
      camera.position.set(0, 0, 4.8);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pts.globe, 3));
      geo.setAttribute("aGlobe", new THREE.BufferAttribute(pts.globe, 3));
      geo.setAttribute("aBurst", new THREE.BufferAttribute(pts.burst, 3));
      geo.setAttribute("aCloud", new THREE.BufferAttribute(pts.cloud, 3));
      geo.setAttribute("aShape", new THREE.BufferAttribute(pts.shape, 3));
      geo.setAttribute("aInfo", new THREE.BufferAttribute(pts.info, 2));

      const uniforms = {
        uTime: { value: 0 },
        uBurst: { value: 0 },
        uCloud: { value: 0 },
        uShape: { value: 0 },
        uSpin: { value: 0 },
        uTilt: { value: 0.32 },
        uShapeTurn: { value: 0 },
        uSize: { value: phone ? 2.6 : 3.3 },
        uPixel: { value: dpr },
        uMirror: { value: 0 },
        uFloor: { value: -1.12 },
        uScale: { value: 1 },
        uOffset: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Color("#58f6b1") },
        uHot: { value: new THREE.Color("#c9ffe6") },
        uOpacity: { value: 0 },
      };
      const make = (mirror: number) =>
        new THREE.ShaderMaterial({
          uniforms: { ...uniforms, uMirror: { value: mirror } },
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
      const main = new THREE.Points(geo, make(0));
      const mirror = new THREE.Points(geo, make(1));
      main.frustumCulled = false;
      mirror.frustumCulled = false;
      scene.add(main);
      const mirrorScene = new THREE.Scene();
      mirrorScene.add(mirror);

      // Half-resolution texture for the reflection: cheaper, and the softness reads as water.
      const rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
      const waterMat = new THREE.ShaderMaterial({
        uniforms: {
          tMirror: { value: rt.texture },
          uTime: { value: 0 },
          uHorizon: { value: 0.2 },
          uOpacity: { value: 0 },
          uAspect: { value: 1 },
          uTint: { value: new THREE.Color("#58f6b1") },
        },
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const waterQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waterMat);
      waterQuad.frustumCulled = false;
      const waterScene = new THREE.Scene();
      waterScene.add(waterQuad);
      const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      renderer.autoClear = false;
      const horizon = new THREE.Vector3();

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        rt.setSize(Math.max(2, Math.round(w * dpr * 0.5)), Math.max(2, Math.round(h * dpr * 0.5)));
        waterMat.uniforms.uAspect.value = w / h;
        camera.aspect = w / h;
        // Keep the globe the same share of the screen on narrow phones.
        camera.position.z = w / h < 0.8 ? 4.8 / Math.max(0.55, (w / h) * 1.15) : 4.8;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      // Smoothed state: every value eases toward its scene target.
      const now: Target = { ...target(null, 0, 0) };
      let last = performance.now();
      const tick = (time: number) => {
        const dt = Math.min(0.05, (time - last) / 1000);
        last = time;
        const { scene: sc, t } = readScene();
        const goal = target(sc, t, window.scrollY);
        const k = 1 - Math.exp(-dt * 7);
        if (sc === null) {
          // Between scenes: fade out exactly as it is, without drifting back into a globe.
          now.opacity += (0 - now.opacity) * k;
          now.bars += (0 - now.bars) * k;
        } else if (now.opacity < 0.02) {
          // Invisible: jump straight to the next scene's shape before fading in.
          Object.assign(now, goal, { opacity: now.opacity });
          now.opacity += (goal.opacity - now.opacity) * k;
        } else {
          for (const key of Object.keys(now) as (keyof Target)[]) now[key] += (goal[key] - now[key]) * k;
        }

        const idle = reduce ? 0 : time / 1000;
        for (const m of [main.material, mirror.material]) {
          const u = m.uniforms;
          u.uTime.value = idle;
          u.uBurst.value = now.burst;
          u.uCloud.value = now.cloud;
          u.uShape.value = now.shape;
          u.uSpin.value = now.spin + idle * 0.07 * now.drift;
          u.uTilt.value = now.tilt;
          u.uShapeTurn.value = reduce ? 0 : Math.sin(idle * 0.35) * 0.35;
          u.uScale.value = now.scale;
          u.uOffset.value.set(now.x, now.y, 0);
          u.uFloor.value = now.floor * now.scale + now.y;
          u.uOpacity.value = now.opacity;
        }
        // Faded per panel: opacity on the parent would cut the panels off from what they blur.
        if (bars.current) bars.current.style.setProperty("--bars", String(now.bars * now.opacity));
        if (glow.current) glow.current.style.opacity = String(now.opacity * (1 - now.shape * 0.4));
        renderer.domElement.style.opacity = now.opacity > 0.002 ? "1" : "0";
        if (now.opacity > 0.002) {
          // Where the water line sits on screen.
          horizon.set(now.x, now.floor * now.scale + now.y, 0).project(camera);
          waterMat.uniforms.uHorizon.value = horizon.y * 0.5 + 0.5;
          waterMat.uniforms.uTime.value = idle;
          waterMat.uniforms.uOpacity.value = now.water * now.opacity;
          renderer.setRenderTarget(rt);
          renderer.setClearColor(0x000000, 0);
          renderer.clear();
          if (now.water > 0.01) renderer.render(mirrorScene, camera);
          renderer.setRenderTarget(null);
          renderer.clear();
          if (now.water > 0.01) renderer.render(waterScene, flat);
          renderer.render(scene, camera);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        geo.dispose();
        main.material.dispose();
        mirror.material.dispose();
        waterMat.dispose();
        waterQuad.geometry.dispose();
        rt.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [reduce]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      {/* Soft floor light under the globe */}
      <div
        ref={glow}
        className="absolute inset-x-0 bottom-0 h-[45vh] opacity-0"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 100%, color-mix(in srgb, #58f6b1 9%, transparent), transparent 70%)",
        }}
      />
      <div ref={host} className="absolute inset-0" />
      {/*
        Hero glass: four frosted panels over the globe (the reference's hero bars, 184px of
        1512 with 19px gaps). The globe reads soft behind them; the gaps stay sharp, and a
        bright particle stream runs down each gap.
      */}
      <div ref={bars} className="absolute inset-0 [--bars:0] [&>span]:opacity-(--bars)">
        {[23.74, 37.17, 50.66, 64.09].map((left) => (
          <span
            key={left}
            className="absolute top-0 h-full w-[12.17%]"
            style={{ left: `${left}%`, backdropFilter: "blur(0.1875rem)", WebkitBackdropFilter: "blur(0.1875rem)" }}
          />
        ))}
        {[36.54, 50, 63.46].map((left) => (
          <span
            key={left}
            className="absolute top-0 h-full w-[0.5rem] -translate-x-1/2"
            style={{
              left: `${left}%`,
              background:
                "radial-gradient(circle at 50% 50%, color-mix(in srgb, #9dffd2 92%, transparent) 0 1.1px, transparent 1.6px) center top / 100% 6px repeat-y",
              maskImage: "linear-gradient(180deg, transparent 14%, #000 34%, #000 74%, transparent 94%)",
              filter:
                "drop-shadow(0 0 4px color-mix(in srgb, #58f6b1 85%, transparent)) drop-shadow(0 0 12px color-mix(in srgb, #58f6b1 40%, transparent))",
            }}
          />
        ))}
      </div>
    </div>
  );
}
