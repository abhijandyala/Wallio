"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * The hero's liquid ball, after the reference's: about 41,000 particles filling a ball, each
 * drawn as a tiny digit in one of four mint shades. The reference runs a real fluid
 * simulation on WebGPU; this is a WebGL stand-in that moves the particles with layered flow
 * so the ball slowly churns and loses its round edge. Near the cursor the digits light up in
 * aurora, fading out over a soft radius, and stay where they are. Works in world units of
 * CSS pixels.
 *
 * Placement: the canvas covers the hero and the giant text below it. The ball's centre sits
 * 760px down the canvas and 33px right of centre, and sinks about a fifth as fast as the page
 * scrolls, as measured on the reference.
 */

const VERT = /* glsl */ `
attribute vec3 aBase; // a point in the unit ball
attribute vec3 aInfo; // digit 0..9, shade 0..3, random 0..1
uniform float uTime, uR, uPixel, uDist;
uniform vec3 uCenter;
uniform vec2 uMouse;
uniform float uForce;
uniform vec3 uShades[4];
uniform vec3 uGlow, uGlowHi;
varying vec3 vColor;
varying float vDigit;

void main() {
  vec3 q = aBase;
  float t = uTime;
  // Layered flow: three slow sine fields at different scales, so the ball churns and its
  // outline goes ragged without ever falling apart.
  vec3 flow = vec3(
    sin(q.y * 2.3 + t * 0.7) + 0.6 * sin(q.z * 4.1 - t * 0.9 + q.x * 1.7),
    sin(q.z * 2.1 + t * 0.6) + 0.6 * sin(q.x * 3.7 + t * 0.8 - q.y * 1.3),
    sin(q.x * 2.5 - t * 0.55) + 0.6 * sin(q.y * 3.9 + t * 0.7 + q.z * 1.1)
  );
  vec3 p = aBase * uR + flow * uR * 0.07;
  // A slow swirl that turns the inside faster than the outside.
  float ang = t * 0.12 + (1.0 - length(q)) * 0.6 * sin(t * 0.3);
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  // Two bubbles roll slowly through the fluid; particles inside are swept out to their
  // walls, so the ball opens hollows and thin sheets the way the reference's fluid does.
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec3 bc = uR * 0.66 * vec3(sin(t * (0.21 + fk * 0.07) + fk * 2.0), cos(t * (0.17 + fk * 0.05) + fk), sin(t * (0.26 - fk * 0.04) + 1.0 + fk * 3.0));
    float rb = uR * (0.52 - fk * 0.14);
    vec3 off = p - bc;
    float dd = length(off);
    if (dd < rb) p = bc + off / max(dd, 1e-3) * mix(dd, rb, 0.88);
  }
  // Surface points shiver a little more than the core.
  p += (aInfo.z - 0.5) * smoothstep(0.75, 1.0, length(q)) * uR * 0.03 * vec3(sin(t * 2.0 + aInfo.z * 40.0), cos(t * 1.7 + aInfo.z * 30.0), 0.0);

  // The cursor lights the digits around it in aurora: brightest at the centre, fading out.
  float d = length((p.xy + uCenter.xy) - uMouse);
  float glow = uForce * (1.0 - smoothstep(0.0, uR * 0.5, d));

  vec3 world = p + uCenter;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  int shade = int(aInfo.y);
  vec3 col = uShades[0];
  if (shade == 1) col = uShades[1];
  else if (shade == 2) col = uShades[2];
  else if (shade == 3) col = uShades[3];
  // Lit from the upper left and front, so the ball reads round; the far side sinks.
  vec3 n = normalize(p + 1e-3);
  float lit = clamp(dot(n, normalize(vec3(-0.65, 0.45, 0.6))) * 0.5 + 0.5, 0.0, 1.0);
  col *= 0.6 + 0.8 * lit;
  vec3 lightCol = mix(uGlow, uGlowHi, smoothstep(0.35, 0.9, glow));
  vColor = mix(col, lightCol, clamp(glow * 1.3, 0.0, 0.9));
  vDigit = aInfo.x;
  gl_PointSize = 5.4 * uPixel * (uDist / -mv.z) * (1.0 + 0.12 * glow);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uDigits;
varying vec3 vColor;
varying float vDigit;
void main() {
  vec2 uv = vec2((gl_PointCoord.x + vDigit) / 10.0, 1.0 - gl_PointCoord.y);
  float a = texture2D(uDigits, uv).r;
  if (a < 0.4) discard;
  gl_FragColor = vec4(min(vColor, vec3(0.995)), 1.0);
}
`;

/** Ten white digits in a row on black, one 64px cell each. */
function digitAtlas() {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 640, 64);
  ctx.fillStyle = "#fff";
  ctx.font = "700 56px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 10; i++) ctx.fillText(String(i), i * 64 + 32, 35);
  return c;
}

export function DigitBall({ className }: { className?: string }) {
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
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);

      // Particles fill the ball evenly by volume.
      const count = phone ? 16000 : 40960;
      const base = new Float32Array(count * 3);
      const info = new Float32Array(count * 3);
      let seed = 3;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < count; i++) {
        const r = Math.cbrt(rand());
        const th = rand() * Math.PI * 2;
        const ph = Math.acos(2 * rand() - 1);
        base.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
        info.set([Math.floor(rand() * 10), Math.floor(rand() * 4), rand()], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
      geo.setAttribute("aInfo", new THREE.BufferAttribute(info, 3));

      const atlas = new THREE.CanvasTexture(digitAtlas());
      atlas.minFilter = THREE.LinearFilter;
      atlas.generateMipmaps = false;
      const shades = ["#1f6b50", "#46b58c", "#9af0cd", "#e2fdf0"].map((h) => new THREE.Color(h));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uR: { value: 378 },
          uPixel: { value: dpr },
          uDist: { value: 1 },
          uCenter: { value: new THREE.Vector3() },
          uMouse: { value: new THREE.Vector2(9999, 9999) },
          uForce: { value: 0 },
          uShades: { value: shades },
          uGlow: { value: new THREE.Color("#84d8cf") },
          uGlowHi: { value: new THREE.Color("#b4ece5") },
          uDigits: { value: atlas },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: false,
        depthTest: true,
        depthWrite: true,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      scene.add(points);

      // Layout in CSS pixels: the camera sees exactly the canvas at depth 0.
      let W = 1;
      let H = 1;
      let scale = 1;
      const resize = () => {
        W = el.clientWidth;
        H = el.clientHeight;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        const dist = H / 2 / Math.tan((15 * Math.PI) / 180);
        camera.position.set(0, 0, dist);
        camera.near = dist * 0.3;
        camera.far = dist * 3;
        camera.updateProjectionMatrix();
        mat.uniforms.uDist.value = dist;
        // Measured on a 1512px wide page; keep the same proportions at other widths.
        scale = phone ? W / 900 : W / 1512;
        mat.uniforms.uR.value = 378 * scale;
      };
      resize();
      window.addEventListener("resize", resize);

      // The cursor, in world units, eased so the push trails like liquid.
      const target = { x: 9999, y: 9999, on: 0 };
      const mouse = { x: 9999, y: 9999, f: 0 };
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        target.x = e.clientX - r.left - W / 2;
        target.y = H / 2 - (e.clientY - r.top);
        target.on = e.clientY >= r.top && e.clientY <= r.bottom ? 1 : 0;
        if (mouse.x > 9000) {
          mouse.x = target.x;
          mouse.y = target.y;
        }
      };
      const leave = () => (target.on = 0);
      if (!reduce) {
        window.addEventListener("pointermove", move, { passive: true });
        document.addEventListener("pointerleave", leave);
      }

      let raf = 0;
      let visible = true;
      let last = performance.now();
      let time = 8;
      const draw = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!reduce) time += dt;
        mouse.x += (target.x - mouse.x) * 0.08;
        mouse.y += (target.y - mouse.y) * 0.08;
        mouse.f += (target.on - mouse.f) * 0.05;
        // The ball sinks a fifth as fast as the page scrolls, so it lingers as it leaves.
        const cy = (phone ? 1230 : 760) * scale + 0.196 * window.scrollY;
        mat.uniforms.uCenter.value.set(33 * scale, H / 2 - cy, 0);
        mat.uniforms.uTime.value = time;
        mat.uniforms.uMouse.value.set(mouse.x, mouse.y);
        mat.uniforms.uForce.value = mouse.f;
        renderer.render(scene, camera);
        if (!reduce && visible) raf = requestAnimationFrame(draw);
      };
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        cancelAnimationFrame(raf);
        if (visible) {
          last = performance.now();
          raf = requestAnimationFrame(draw);
        }
      });
      io.observe(el);
      raf = requestAnimationFrame(draw);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", move);
        document.removeEventListener("pointerleave", leave);
        geo.dispose();
        mat.dispose();
        atlas.dispose();
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
