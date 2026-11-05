"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "@/lib/format";
import { ToolMark } from "./tool-mark";
import { cn } from "@/lib/utils";

/*
 * Chart kit. Hand-built (no chart library) so every mark matches the palette:
 * flat-shaded 3D blocks (dim lavender history, bright lavender "now"), lime for money kept or tested.
 * No gradients, no glows. Hover shows one small readout, never a highlight box.
 */

/** Diagonal hatching used for bars and segments. */
export const hatch = (color: string, gap = 7) =>
  `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px ${gap}px)`;

const money0 = (cents: number) => formatMoney(cents).replace(/\.00$/, "");

/* ── Block bar chart (flat-shaded 3D) ──────────────────────────────────── */

// Each bar is three flat faces: front, a lighter top, a darker right side. No gradients.
const BLOCK = {
  past: { front: "#3a3150", top: "#4b4167", side: "#2a2439" },
  now: { front: "#ad96f1", top: "#cdbefb", side: "#7e68c9" },
  edge: "#58f6b1", // lime line along the current month's front edge
};
const DEPTH = { dx: 12, dy: 7 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function BlockBarChart({
  data,
  height = 220,
}: {
  data: { label: string; cents: number }[];
  height?: number;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();

  const max = Math.max(...data.map((d) => d.cents), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => i * step,
  );
  const last = data.length - 1;

  const axisW = 44; // y labels
  const labelH = 28; // x labels
  const plotW = Math.max(0, width - axisW);
  const H = height; // baseline y (front faces sit on it)
  const usable = H - DEPTH.dy - 4; // headroom for the top face
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.max(8, slot * 0.58);
  const yOf = (cents: number) => H - (cents / top) * usable;

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{ height: H + labelH }}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={H + labelH}
          className="block overflow-visible"
          role="img"
          aria-label="Monthly AI spend"
        >
          {/* Grid + y labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={axisW}
                x2={width}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke="rgba(255,255,255,0.08)"
              />
              <text
                x={axisW - 12}
                y={yOf(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="tnum fill-text-3 text-[12px]"
              >
                {money0(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = axisW + i * slot + (slot - bw - DEPTH.dx) / 2;
            const y = yOf(d.cents);
            const lit = i === last || hover === i;
            const c = lit ? BLOCK.now : BLOCK.past;
            const { dx, dy } = DEPTH;
            return (
              <g key={d.label}>
                <motion.g
                  style={{ originY: 1 }}
                  initial={reduce ? false : { scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{
                    duration: 0.55,
                    ease: [0.16, 1, 0.3, 1],
                    delay: i * 0.04,
                  }}
                >
                  {/* Side */}
                  <polygon
                    points={`${x + bw},${y} ${x + bw + dx},${y - dy} ${x + bw + dx},${H - dy} ${x + bw},${H}`}
                    fill={c.side}
                  />
                  {/* Top */}
                  <polygon
                    points={`${x},${y} ${x + dx},${y - dy} ${x + bw + dx},${y - dy} ${x + bw},${y}`}
                    fill={c.top}
                  />
                  {/* Front */}
                  <rect x={x} y={y} width={bw} height={H - y} fill={c.front} />
                  {i === last && (
                    <rect x={x} y={y} width={bw} height={2} fill={BLOCK.edge} />
                  )}
                </motion.g>

                {/* X label */}
                <text
                  x={x + bw / 2}
                  y={H + 20}
                  textAnchor="middle"
                  className={cn(
                    "text-[12px]",
                    i === last ? "fill-text-1" : "fill-text-3",
                  )}
                >
                  {d.label}
                </text>

                {/* Hover target: the whole column */}
                <rect
                  x={axisW + i * slot}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {/* Readout */}
      {hover !== null &&
        width > 0 &&
        (() => {
          const d = data[hover];
          const prev = data[hover - 1]?.cents;
          const change = prev
            ? Math.round(((d.cents - prev) / prev) * 100)
            : null;
          const cx =
            axisW + hover * slot + (slot - DEPTH.dx) / 2 + DEPTH.dx / 2;
          return (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[10px] border border-line-strong bg-surface-3 px-3 py-2 text-[12px] whitespace-nowrap shadow-[0_8px_20px_rgba(0,0,0,0.4)]"
              style={{ left: cx, top: yOf(d.cents) - DEPTH.dy - 10 }}
            >
              <span className="text-text-3">{d.label}</span>
              <span className="tnum mx-2 text-text-1">
                {formatMoney(d.cents)}
              </span>
              {change !== null && (
                <span
                  className={cn(
                    "tnum",
                    change > 0 ? "text-lavender" : "text-lime",
                  )}
                >
                  {change > 0 ? "+" : ""}
                  {change}%
                </span>
              )}
            </div>
          );
        })()}
    </div>
  );
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/* ── Sparkline (tiny bars for stats) ───────────────────────────────────── */

export function Sparkbars({
  values,
  tone = "lavender",
}: {
  values: number[];
  tone?: "lavender" | "lime";
}) {
  const max = Math.max(...values, 1);
  return (
    <span className="flex h-7 items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "w-[5px] rounded-[2px]",
            i === values.length - 1
              ? tone === "lime"
                ? "bg-lime"
                : "bg-lavender"
              : "bg-white/15",
          )}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

/* ── Segment bar (breakdown) ───────────────────────────────────────────── */

const SEGMENT_FILLS = [
  "var(--w-lavender)",
  hatch("rgba(173,150,241,0.8)", 6),
  "var(--w-lime)",
  hatch("rgba(130,130,142,0.7)", 6),
];

export function SegmentBar({
  parts,
}: {
  parts: { name: string; cents: number }[];
}) {
  const total = parts.reduce((n, p) => n + p.cents, 0) || 1;
  return (
    <div
      className="flex h-4 w-full gap-[3px]"
      role="img"
      aria-label="Spend by category"
    >
      {parts.map((p, i) =>
        p.cents > 0 ? (
          <span
            key={p.name}
            className="h-full rounded-[4px]"
            style={{
              width: `${(p.cents / total) * 100}%`,
              background: SEGMENT_FILLS[i % SEGMENT_FILLS.length],
            }}
          />
        ) : null,
      )}
    </div>
  );
}

export function SegmentSwatch({ index }: { index: number }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-[3px]"
      style={{ background: SEGMENT_FILLS[index % SEGMENT_FILLS.length] }}
      aria-hidden="true"
    />
  );
}

/* ── Evidence dot matrix ───────────────────────────────────────────────── */

export function EvidenceDots({
  tools,
}: {
  tools: {
    toolName: string;
    tested: number;
    researched: number;
    unknown: number;
  }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = Math.max(
    ...tools.map((t) => t.tested + t.researched + t.unknown),
    1,
  );
  return (
    <div
      className="flex items-end justify-between gap-2"
      onMouseLeave={() => setHover(null)}
    >
      {tools.map((t, i) => {
        const dots = [
          ...Array(t.tested).fill("tested"),
          ...Array(t.researched).fill("researched"),
          ...Array(t.unknown).fill("unknown"),
        ] as const;
        return (
          <div
            key={t.toolName}
            className="relative flex flex-1 flex-col items-center gap-3"
            onMouseEnter={() => setHover(i)}
          >
            {hover === i && (
              <span className="pointer-events-none absolute -top-9 z-10 rounded-[10px] border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[12px] whitespace-nowrap">
                <span className="text-lime">{t.tested} tested</span>
                <span className="text-text-3"> · </span>
                <span className="text-lavender">{t.researched} read</span>
              </span>
            )}
            <span
              className="flex flex-col-reverse gap-[5px]"
              style={{ height: rows * 15 }}
            >
              {dots.map((kind, j) => (
                <span
                  key={j}
                  className={cn(
                    "size-[10px] rounded-[3px]",
                    kind === "tested" && "bg-lime",
                    kind === "researched" && "bg-lavender/70",
                    kind === "unknown" && "border border-white/20",
                  )}
                />
              ))}
            </span>
            <ToolMark name={t.toolName} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Renewal timeline ──────────────────────────────────────────────────── */

export function RenewalTimeline({
  today,
  days = 30,
  items,
}: {
  today: string;
  days?: number;
  items: { toolName: string; date: string; cents: number | null }[];
}) {
  const start = new Date(today + "T12:00:00").getTime();
  const pos = (iso: string) =>
    ((new Date(iso + "T12:00:00").getTime() - start) / 86_400_000 / days) * 100;
  const weekLabels = [0, 7, 14, 21, 28].map((d) => {
    const dt = new Date(start + d * 86_400_000);
    return {
      left: (d / days) * 100,
      label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });
  const soonest = items.reduce<number>(
    (m, it) => Math.min(m, pos(it.date)),
    101,
  );

  return (
    <div className="relative pt-14 pb-7">
      {/* Track */}
      <div className="relative h-1.5 rounded-[3px] bg-surface-3">
        <span
          className="absolute inset-y-0 left-0 rounded-[3px] bg-lavender/40"
          style={{ width: `${soonest}%` }}
        />
        <span
          className="absolute top-1/2 left-0 size-3 -translate-y-1/2 rounded-[4px] bg-text-1"
          title="Today"
        />
      </div>

      {/* Renewals */}
      {items.map((it) => {
        const left = pos(it.date);
        const first = left === soonest;
        return (
          <div
            key={it.toolName}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5"
            style={{ left: `${left}%` }}
          >
            <span
              className={cn(
                "rounded-md p-0.5",
                first ? "bg-lavender" : "bg-transparent",
              )}
            >
              <ToolMark name={it.toolName} />
            </span>
            <span
              className={cn(
                "h-3 w-px",
                first ? "bg-lavender" : "bg-line-strong",
              )}
            />
          </div>
        );
      })}

      {/* Week labels */}
      {weekLabels.map((w, i) => (
        <span
          key={w.label}
          className={cn(
            "tnum absolute bottom-0 text-[12px] whitespace-nowrap text-text-3",
            i === 0
              ? "translate-x-0"
              : i === weekLabels.length - 1
                ? "-translate-x-full"
                : "-translate-x-1/2",
          )}
          style={{ left: `${w.left}%` }}
        >
          {i === 0 ? "Today" : w.label}
        </span>
      ))}
    </div>
  );
}

/* ── Pass bar (comparison result) ──────────────────────────────────────── */

const PASS = {
  best: { front: "#58f6b1", top: "#a6fbd5", side: "#2fae79" },
  other: BLOCK.now,
  empty: { front: "#1c1c23", top: "#25252e", side: "#141419" },
};
const D = 4; // block depth in px

/** Small 3D block: front face plus a lighter top and darker right side, matching BlockBarChart. */
function Block({
  face,
}: {
  face: { front: string; top: string; side: string };
}) {
  return (
    <span
      className="relative block h-full flex-1"
      style={{ background: face.front }}
    >
      <span
        className="absolute bottom-full left-0"
        style={{
          width: `calc(100% + ${D}px)`,
          height: D,
          background: face.top,
          clipPath: `polygon(0 100%, ${D}px 0, 100% 0, calc(100% - ${D}px) 100%)`,
        }}
      />
      <span
        className="absolute left-full"
        style={{
          top: -D,
          width: D,
          height: `calc(100% + ${D}px)`,
          background: face.side,
          clipPath: `polygon(0 ${D}px, 100% 0, 100% calc(100% - ${D}px), 0 100%)`,
        }}
      />
    </span>
  );
}

export function PassBar({
  passed,
  attempts,
  best,
}: {
  passed: number;
  attempts: number;
  best: boolean;
}) {
  return (
    <span
      className="flex h-3.5 flex-1 gap-2 pt-px pr-1"
      role="img"
      aria-label={`${passed} of ${attempts} passed`}
    >
      {Array.from({ length: attempts }, (_, i) => (
        <Block
          key={i}
          face={i < passed ? (best ? PASS.best : PASS.other) : PASS.empty}
        />
      ))}
    </span>
  );
}
