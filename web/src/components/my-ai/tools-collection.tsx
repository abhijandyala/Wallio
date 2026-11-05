"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import type { Subscription } from "@/lib/types";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { daysUntil, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddToolCard } from "./tool-card";

export type ToolsView = "cards" | "table";

const STATUS: Record<Subscription["status"], string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

// Phones: tool, price, renews. From md up: all five columns.
const ROW_COLS =
  "grid-cols-[minmax(0,1fr)_auto_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_84px]";

// Timing. One curve for everything so boxes, frame and page height move as one.
const EASE = [0.32, 0.72, 0, 1] as const;
const MOVE = 0.5;
const STAGGER = 0.018;
const FADE_DELAY = 0.3;
const FADE = 0.22;

// Box looks, as rgba so every value interpolates cleanly.
const LINE = "rgba(255,255,255,0.08)";
const LAV = "rgba(173,150,241,0.4)";
const CLEAR = "rgba(255,255,255,0)";
const SURFACE = "rgba(12,12,16,1)";
const SURFACE_CLEAR = "rgba(12,12,16,0)";

type Rect = { x: number; y: number; w: number; h: number };
type Snapshot = { rects: Map<string, Rect>; height: number };

const isSoon = (s: Subscription, today: string) => {
  if (!s.renewsOn) return false;
  const d = daysUntil(s.renewsOn, today);
  return d >= 0 && d <= 14;
};

function boxLook(view: ToolsView, soon: boolean, first: boolean) {
  if (view === "cards") {
    const c = soon ? LAV : LINE;
    return {
      borderRadius: 20,
      backgroundColor: SURFACE,
      borderTopColor: c,
      borderRightColor: c,
      borderBottomColor: c,
      borderLeftColor: c,
    };
  }
  return {
    borderRadius: 0,
    backgroundColor: SURFACE_CLEAR,
    borderTopColor: first ? CLEAR : LINE,
    borderRightColor: CLEAR,
    borderBottomColor: CLEAR,
    borderLeftColor: CLEAR,
  };
}

/*
 * Cards <-> table, as a true morph.
 *
 * At rest the real elements draw themselves (cards or rows). When the view changes:
 *   1. The new layout renders, but before paint its boxes go transparent and its content is hidden.
 *   2. A ghost box per tool starts exactly where that tool was and animates its real
 *      top/left/width/height, radius, fill and borders to the new spot. No scale transforms,
 *      so 1px borders stay 1px and corners never smear.
 *   3. The table frame and page height move on the same curve. Content fades in as boxes land.
 *   4. The ghosts hand back to the real elements, which look identical, so the swap is invisible.
 * Toggling mid-morph continues from wherever the ghosts are.
 */
export function ToolsCollection({
  subs,
  view,
  today,
  onOpen,
  onAdd,
}: {
  subs: Subscription[];
  view: ToolsView;
  today: string;
  onOpen: (s: Subscription) => void;
  onAdd: () => void;
}) {
  const reduce = useReducedMotion();
  const cards = view === "cards";

  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLElement>());
  const ghosts = useRef(new Map<string, HTMLElement>());
  const settled = useRef<Snapshot | null>(null);
  const lastView = useRef(view);
  const running = useRef<{ stop: () => void }[]>([]);
  const token = useRef(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const layer = layerRef.current;
    const frame = frameRef.current;
    if (!wrap || !layer || !frame) return;

    const measure = (): Snapshot => {
      const origin = wrap.getBoundingClientRect();
      const rects = new Map<string, Rect>();
      slots.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        rects.set(id, {
          x: r.left - origin.left,
          y: r.top - origin.top,
          w: r.width,
          h: r.height,
        });
      });
      return { rects, height: layer.offsetHeight };
    };

    const morphing = running.current.length > 0;
    const from = lastView.current;
    if (from === view) {
      if (!morphing) settled.current = measure();
      return;
    }
    lastView.current = view;

    const before = settled.current;
    const to = measure();
    if (reduce || (!before && !morphing)) {
      settled.current = to;
      return;
    }

    // 1. Hide the real boxes and content before this frame paints.
    wrap.dataset.morph = "";
    const fades = Array.from(
      layer.querySelectorAll<HTMLElement>("[data-morph-fade]"),
    );
    fades.forEach((el) => (el.style.opacity = "0"));

    if (morphing) {
      // Continue from wherever the ghosts are right now.
      running.current.forEach((c) => c.stop());
    } else if (before) {
      wrap.style.height = `${before.height}px`;
      frame.style.opacity = from === "table" ? "1" : "0";
      subs.forEach((s, i) => {
        const g = ghosts.current.get(s.id);
        const r = before.rects.get(s.id);
        if (!g || !r) return;
        Object.assign(g.style, {
          display: "block",
          left: `${r.x}px`,
          top: `${r.y}px`,
          width: `${r.w}px`,
          height: `${r.h}px`,
        });
        const look = boxLook(from, isSoon(s, today), i === 0);
        Object.assign(g.style, { ...look, borderRadius: `${look.borderRadius}px` });
      });
    }

    // 2–3. Move everything on one curve.
    const run = ++token.current;
    const n = subs.length;
    const total = MOVE + STAGGER * Math.max(n - 1, 0);
    const controls = [
      animate(wrap, { height: to.height }, { duration: total, ease: EASE }),
      animate(
        frame,
        { opacity: view === "table" ? 1 : 0 },
        view === "table"
          ? { duration: 0.32, delay: 0.1, ease: EASE }
          : { duration: 0.24, ease: EASE },
      ),
      ...subs.flatMap((s, i) => {
        const g = ghosts.current.get(s.id);
        const r = to.rects.get(s.id);
        if (!g || !r) return [];
        return [
          animate(
            g,
            {
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              ...boxLook(view, isSoon(s, today), i === 0),
            },
            { duration: MOVE, ease: EASE, delay: i * STAGGER },
          ),
        ];
      }),
      ...(fades.length
        ? [
            animate(
              fades,
              { opacity: [0, 1] },
              { duration: FADE, delay: FADE_DELAY, ease: "easeOut" },
            ),
          ]
        : []),
    ];
    running.current = controls;

    // 4. Hand back to the real elements.
    Promise.all(controls.map((c) => c.finished)).then(() => {
      if (run !== token.current) return;
      running.current = [];
      ghosts.current.forEach((g) => (g.style.display = "none"));
      frame.style.opacity = "0";
      wrap.style.height = "";
      delete wrap.dataset.morph;
      settled.current = measure();
    });
  });

  // Keep the resting snapshot fresh when the page resizes.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      if (running.current.length || !layerRef.current) return;
      const origin = wrap.getBoundingClientRect();
      const rects = new Map<string, Rect>();
      slots.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        rects.set(id, {
          x: r.left - origin.left,
          y: r.top - origin.top,
          w: r.width,
          h: r.height,
        });
      });
      settled.current = { rects, height: layerRef.current.offsetHeight };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="group/tools relative">
      {/* Ghost layer: only visible while morphing. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          ref={frameRef}
          className="absolute inset-0 rounded-[20px] border border-line bg-surface-1"
          style={{ opacity: 0 }}
        />
        {subs.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              if (el) ghosts.current.set(s.id, el);
              else ghosts.current.delete(s.id);
            }}
            className="absolute border border-solid"
            style={{ display: "none", opacity: s.status !== "active" ? 0.6 : 1 }}
          />
        ))}
      </div>

      {/* The real layout. Its box styling switches off while the ghosts are moving. */}
      <div
        ref={layerRef}
        className={cn(
          "relative",
          cards
            ? "grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4"
            : "flex flex-col rounded-[20px] border border-line bg-surface-1 group-data-[morph]/tools:border-transparent group-data-[morph]/tools:bg-transparent",
        )}
      >
        {!cards && (
          <div
            data-morph-fade
            className={cn(
              "hidden h-11 items-center gap-x-4 border-b border-line px-6 text-[13px] text-text-3 md:grid",
              ROW_COLS,
            )}
          >
            <span>Tool</span>
            <span>Plan</span>
            <span className="text-right">Per month</span>
            <span className="text-right">Renews</span>
            <span className="text-right">Status</span>
          </div>
        )}

        {subs.map((s, i) => (
          <ToolItem
            key={s.id}
            ref={(el) => {
              if (el) slots.current.set(s.id, el);
              else slots.current.delete(s.id);
            }}
            sub={s}
            cards={cards}
            today={today}
            first={i === 0}
            onOpen={() => onOpen(s)}
          />
        ))}

        {cards && (
          <div data-morph-fade className={addSpan(subs.length)}>
            <AddToolCard onAdd={onAdd} span={4 - (subs.length % 4)} />
          </div>
        )}
      </div>
    </div>
  );
}

const addSpan = (n: number) =>
  ({ 0: "xl:col-span-4", 1: "xl:col-span-3", 2: "xl:col-span-2", 3: "" })[
    n % 4
  ] ?? "";

function ToolItem({
  ref,
  sub,
  cards,
  today,
  first,
  onOpen,
}: {
  ref: (el: HTMLButtonElement | null) => void;
  sub: Subscription;
  cards: boolean;
  today: string;
  first: boolean;
  onOpen: () => void;
}) {
  const days = sub.renewsOn ? daysUntil(sub.renewsOn, today) : null;
  const soon = isSoon(sub, today);
  const paused = sub.status !== "active";

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      className={cn(
        "relative block w-full border text-left",
        // Resting looks. These must match boxLook() exactly so the hand-off is invisible.
        cards
          ? cn(
              "h-[148px] rounded-[20px] bg-surface-1 sm:h-[188px]",
              soon ? "border-lavender/40" : "border-line",
            )
          : cn("h-16 border-transparent", !first && "border-t-line"),
        "group-data-[morph]/tools:border-transparent group-data-[morph]/tools:bg-transparent",
        paused && "opacity-60",
      )}
    >
      <span data-morph-fade className="absolute inset-0">
        {cards ? (
          <CardContent sub={sub} soon={soon} days={days} paused={paused} />
        ) : (
          <RowContent sub={sub} soon={soon} />
        )}
      </span>
    </button>
  );
}

function CardContent({
  sub,
  soon,
  days,
  paused,
}: {
  sub: Subscription;
  soon: boolean;
  days: number | null;
  paused: boolean;
}) {
  return (
    <span className="flex h-full flex-col justify-between p-5">
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <ToolMark name={sub.toolName} size="lg" />
          <span className="min-w-0">
            <span className="block text-[16px] font-medium text-text-1">
              {sub.toolName}
            </span>
            <span className="block text-[13px] text-text-3">
              {sub.category}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "text-[13px] whitespace-nowrap",
            soon && !paused ? "text-lavender" : "text-text-3",
          )}
        >
          {paused
            ? "Paused"
            : sub.renewsOn
              ? soon
                ? `Renews in ${days} days`
                : `Renews ${formatShortDate(sub.renewsOn)}`
              : "No renewal date"}
        </span>
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="display text-[28px] leading-[32px] font-medium text-text-1">
          {sub.monthlyCents === null ? (
            <span className="text-[18px] tracking-normal text-text-3">
              Price unknown
            </span>
          ) : (
            <>
              <Money cents={sub.monthlyCents} />
              <span className="ml-1 text-[14px] font-normal tracking-normal text-text-3">
                /mo
              </span>
            </>
          )}
        </span>
        <span className="text-right text-[13px] text-text-3">
          {sub.plan}
          {sub.cadence === "annual" && sub.renewalCents !== null && (
            <>
              {" · "}
              <Money cents={sub.renewalCents} dropCents />
              /yr
            </>
          )}
        </span>
      </span>
    </span>
  );
}

function RowContent({ sub, soon }: { sub: Subscription; soon: boolean }) {
  return (
    <span
      className={cn(
        "grid h-full items-center gap-x-4 px-6 text-[14px]",
        ROW_COLS,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <ToolMark name={sub.toolName} />
        <span className="min-w-0">
          <span className="block truncate text-text-1">{sub.toolName}</span>
          <span className="block truncate text-[12px] text-text-3">
            {sub.category}
          </span>
        </span>
      </span>
      <span className="hidden truncate text-text-2 md:block">
        {sub.plan}
        {sub.cadence === "annual" && (
          <span className="text-text-3">, yearly</span>
        )}
      </span>
      <span className="text-right">
        <Money
          cents={sub.monthlyCents}
          className={sub.monthlyCents === null ? "text-text-3" : "text-text-1"}
        />
      </span>
      <span
        className={cn(
          "tnum text-right whitespace-nowrap",
          soon ? "text-lavender" : "text-text-2",
        )}
      >
        {sub.renewsOn ? (
          formatShortDate(sub.renewsOn)
        ) : (
          <span className="text-text-3">Unknown</span>
        )}
      </span>
      <span className="hidden text-right text-text-2 md:block">
        {STATUS[sub.status]}
      </span>
    </span>
  );
}
