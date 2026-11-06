"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * The AI orb: a lavender glass sphere with a curl of white light turning around inside it,
 * a thin bright rim and a soft haze at the top left. One WebGL fragment shader; it pauses
 * when off screen, and reduced motion draws a single still frame.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

const vec3 LAV = vec3(0.678, 0.588, 0.945);   // #AD96F1, our lavender
const vec3 DEEP = vec3(0.47, 0.36, 0.90);     // the same hue, deeper
const vec3 MIST = vec3(0.86, 0.81, 0.995);    // the same hue, near white (not 1.0: one GPU compiler mishandles it)

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));
  float R = 0.6;
  vec2 p = uv / R;
  float r = length(p);

  // Soft light just outside the glass.
  if (r > 1.0) {
    float halo = exp(-(r - 1.0) * 4.0) * 0.32;
    gl_FragColor = vec4(clamp(LAV * halo, 0.0, 1.0), clamp(halo, 0.0, 1.0));
    return;
  }

  float z = sqrt(max(0.0, 1.0 - r * r));
  vec3 n = vec3(p, z);

  // Body: lit from above, so the top glows a brighter violet and the bottom sinks deeper.
  float light = clamp(0.5 + 0.5 * dot(n, normalize(vec3(-0.2, 0.75, 0.6))), 0.0, 1.0);
  vec3 col = mix(DEEP * 0.62, LAV * 0.92, light * light);

  // The light inside: a wavy sheet of light seen edge on, lying across the lower middle of
  // the glass. Its wave rolls slowly and the thick, bright part travels along it, so it reads
  // as liquid light turning inside the orb. Below it the glass is lit; above it stays deeper.
  float t = uTime;
  float x = p.x;
  float h = -0.08 + 0.13 * sin(x * 2.1 + t * 0.7) + 0.05 * sin(x * 4.3 - t * 1.1) - 0.06 * x;
  float swell = 0.5 + 0.5 * sin(x * 1.7 - t * 0.9 + 1.2);
  float th = mix(0.018, 0.12, swell * swell) * (1.0 - 0.55 * smoothstep(0.2, 0.95, abs(x)));
  float dy = p.y - h;
  float sheet = exp(-(dy * dy) / (th * th)) * smoothstep(1.0, 0.55, abs(x) + 0.15 * abs(dy));
  float spread = exp(-(dy * dy) / (0.09 + th * 1.5)) * smoothstep(1.0, 0.3, abs(x));
  float under = smoothstep(0.05, -0.45, dy) * (1.0 - smoothstep(0.6, 1.0, r));
  col = mix(col, LAV * 1.05, under * 0.45);
  col = mix(col, DEEP * 0.85, smoothstep(0.05, 0.7, dy) * 0.35);
  col += LAV * spread * 0.5;
  col = mix(col, MIST, clamp(sheet * 1.1, 0.0, 1.0));
  col += vec3(0.995) * pow(sheet, 2.2) * 0.6 * (0.6 + 0.4 * swell);

  // Haze at the top left.
  vec2 hz = p - vec2(-0.3, 0.42);
  col += MIST * exp(-dot(hz, hz) * 6.0) * 0.22;

  // A thin bright rim, and a little darkening just inside it.
  float rim = smoothstep(0.88, 0.995, r);
  col = mix(col, DEEP * 0.8, smoothstep(0.72, 0.94, r) * 0.22);
  col += MIST * rim * 0.4;

  // Clamp before writing: some GPUs wrap values over 1 instead of clamping them.
  col = clamp(col, 0.0, 1.0);
  float a = 1.0 - smoothstep(0.985, 1.0, r);
  gl_FragColor = vec4(col * a, a);
}
`;

export function OrbCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: true, alpha: true });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    size();
    window.addEventListener("resize", size);

    let raf = 0;
    let visible = true;
    const draw = (t: number) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, reduce ? 2.0 : t / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", size);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
