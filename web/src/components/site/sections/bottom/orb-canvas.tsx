"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * The AI orb: a lavender glass sphere with a white ribbon of light flowing around inside it,
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
const vec3 MIST = vec3(0.86, 0.81, 1.0);      // the same hue, near white

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }

// The ribbon: a twisting band through the sphere's volume, sampled at a point inside it.
float ribbon(vec3 q, float t) {
  float f = 0.2 * sin(q.x * 2.3 + q.z * 1.4 + t * 0.7) - 0.16 + 0.08 * sin(q.x * 4.1 - t * 0.9);
  float w = 0.21 + 0.08 * sin(q.x * 2.7 + t * 0.5) * sin(q.z * 1.9 - t * 0.3);
  float d = (q.y - f) / max(w, 0.02);
  // Soft falloff with a brighter middle: a broad band of light, not a line.
  return exp(-d * d * 0.8) * (0.7 + 0.3 * exp(-d * d * 4.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));
  float R = 0.56;
  vec2 p = uv / R;
  float r = length(p);

  // Soft light just outside the glass.
  if (r > 1.0) {
    float halo = exp(-(r - 1.0) * 4.0) * 0.32;
    gl_FragColor = vec4(LAV * halo, halo);
    return;
  }

  float z = sqrt(max(0.0, 1.0 - r * r));
  vec3 n = vec3(p, z);

  // Body: deeper at the lower right, lighter toward the top left, like lit glass.
  float light = clamp(0.55 + 0.45 * dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
  vec3 col = mix(DEEP, LAV, light);

  // The ribbon, sampled on the front and the back of the sphere so it reads as volume.
  mat3 turn = rotX(0.25) * rotY(uTime * 0.32);
  float front = ribbon(turn * vec3(p, z * 0.75), uTime);
  float back = ribbon(turn * vec3(p, -z * 0.75), uTime) * 0.35;
  float rib = front + back;
  col = mix(col, MIST, clamp(rib * 0.85, 0.0, 1.0));
  col += vec3(1.0) * pow(clamp(front, 0.0, 1.0), 2.2) * 0.7;

  // Haze at the top left.
  vec2 hz = p - vec2(-0.32, 0.38);
  col += MIST * exp(-dot(hz, hz) * 5.5) * 0.28;

  // A thin bright rim, and a little darkening just inside it.
  float rim = smoothstep(0.88, 0.995, r);
  col = mix(col, DEEP * 0.8, smoothstep(0.7, 0.93, r) * 0.25);
  col += MIST * rim * 0.42;

  float a = smoothstep(1.0, 0.985, r);
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
