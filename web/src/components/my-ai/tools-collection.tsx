"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, useReducedMotionConfig } from "motion/react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { Subscription, Workflow } from "@/lib/types";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { daysUntil, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import { AddToolCard } from "./tool-card";

export type ToolsView = "cards" | "table";
export type ToolsSort = "default" | "price" | "renewal";

const STATUS: Record<Subscription["status"], string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

// Phones: tool, price, renews. md: + used for, status. xl: + plan, price checked.
const ROW_COLS =
  "grid-cols-[minmax(0,1fr)_auto_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_72px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)_72px]";

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

/** Inside the user's renewal reminder window (Settings → Spending). */
const isSoon = (s: Subscription, today: string, lead: number) => {
  if (!s.renewsOn) return false;
  const d = daysUntil(s.renewsOn, today);
  return d >= 0 && d <= lead;
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
  sort,
  onSort,
  workflows,
  today,
  onOpen,
  onAdd,
}: {
  subs: Subscription[];
  view: ToolsView;
  sort: ToolsSort;
  onSort: (s: ToolsSort) => void;
  /** The user's workflows, for the "used for" line. */
  workflows: Workflow[];
  today: string;
  onOpen: (s: Subscription) => void;
  onAdd: () => void;
}) {
  const reduce = useReducedMotionConfig();
  const { renewalLeadDays: lead } = useSettings();
  const cards = view === "cards";

  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLElement>());
  const ghosts = useRef(new Map<string, HTMLElement>());
  const settled = useRef<Snapshot | null>(null);
  // A morph runs whenever the layout changes shape: the view, or the order (sorting).
  const layoutKey = `${view}:${subs.map((s) => s.id).join(",")}`;
  const lastKey = useRef(layoutKey);
  const lastView = useRef(view);
  const lastFirst = useRef(subs[0]?.id);
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
    const fromFirst = lastFirst.current;
    if (lastKey.current === layoutKey) {
      if (!morphing) settled.current = measure();
      return;
    }
    const prevIds = lastKey.current.split(":")[1].split(",");
    const nextIds = subs.map((s) => s.id);
    const sameSet =
      prevIds.length === nextIds.length && nextIds.every((id) => prevIds.includes(id));
    lastKey.current = layoutKey;
    lastView.current = view;
    lastFirst.current = subs[0]?.id;
    // Adding or removing a tool just re-lays out; only view and order changes morph.
    if (!sameSet) {
      if (!morphing) settled.current = measure();
      return;
    }

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
      subs.forEach((s) => {
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
        const look = boxLook(from, isSoon(s, today, lead), s.id === fromFirst);
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
              ...boxLook(view, isSoon(s, today, lead), i === 0),
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
            <span>Used for</span>
            <span className="hidden xl:block">Plan</span>
            <SortHead label="Per month" active={sort === "price"} onClick={() => onSort(sort === "price" ? "default" : "price")} dir="down" />
            <SortHead label="Renews" active={sort === "renewal"} onClick={() => onSort(sort === "renewal" ? "default" : "renewal")} dir="up" />
            <span className="hidden text-right xl:block">Price checked</span>
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
            usedFor={usage(s, workflows, subs)}
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
  usedFor,
  cards,
  today,
  first,
  onOpen,
}: {
  ref: (el: HTMLButtonElement | null) => void;
  sub: Subscription;
  usedFor: Usage;
  cards: boolean;
  today: string;
  first: boolean;
  onOpen: () => void;
}) {
  const days = sub.renewsOn ? daysUntil(sub.renewsOn, today) : null;
  const { renewalLeadDays } = useSettings();
  const soon = isSoon(sub, today, renewalLeadDays);
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
          <CardContent sub={sub} usedFor={usedFor} soon={soon} days={days} paused={paused} />
        ) : (
          <RowContent sub={sub} usedFor={usedFor} soon={soon} />
        )}
      </span>
    </button>
  );
}

function CardContent({
  sub,
  usedFor,
  soon,
  days,
  paused,
}: {
  sub: Subscription;
  usedFor: Usage;
  soon: boolean;
  days: number | null;
  paused: boolean;
}) {
  // Settings → Spending → "Show yearly plans as".
  const { annualDisplay } = useSettings();
  const yearly = annualDisplay === "actual" && sub.cadence === "annual" && sub.renewalCents !== null;
  return (
    <span className="flex h-full flex-col justify-between p-5">
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <ToolMark name={sub.toolName} size="lg" />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-medium text-text-1">
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
      <UsageLine usage={usedFor} className="block text-[13px]" />
      <span className="flex items-end justify-between gap-3">
        <span className="display text-[28px] leading-[32px] font-medium text-text-1">
          {sub.monthlyCents === null ? (
            <span className="text-[18px] tracking-normal text-text-3">
              Price unknown
            </span>
          ) : yearly ? (
            <>
              <Money cents={sub.renewalCents} />
              <span className="ml-1 text-[14px] font-normal tracking-normal text-text-3">
                /yr
              </span>
            </>
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
              {yearly ? (
                <>
                  <Money cents={sub.monthlyCents} dropCents />
                  /mo
                </>
              ) : (
                <>
                  <Money cents={sub.renewalCents} dropCents />
                  /yr
                </>
              )}
            </>
          )}
        </span>
      </span>
    </span>
  );
}

function RowContent({
  sub,
  usedFor,
  soon,
}: {
  sub: Subscription;
  usedFor: Usage;
  soon: boolean;
}) {
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
      <UsageLine usage={usedFor} className="hidden md:block" />
      <span className="hidden truncate text-text-2 xl:block">
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
      <span
        className={cn(
          "tnum hidden text-right xl:block",
          sub.lastCheckedOn ? "text-text-2" : "text-text-3",
        )}
      >
        {sub.lastCheckedOn ? formatShortDate(sub.lastCheckedOn) : "Never"}
      </span>
      <span className="hidden text-right text-text-2 md:block">
        {STATUS[sub.status]}
      </span>
    </span>
  );
}

/* ── Usage: which workflows a tool serves, and what it overlaps with ── */

type Usage = { names: string[]; overlaps: string[] };

// Which workflows use a tool is the user's own input; overlap is judged by the backend.
const usage = (s: Subscription, workflows: Workflow[], stack: Subscription[]): Usage => ({
  names: [...workflows]
    .sort((a, b) => a.priority - b.priority)
    .filter((w) => w.tools?.includes(s.toolName))
    .map((w) => w.name),
  // Only overlaps with tools still in the stack.
  overlaps: (s.overlapsWith ?? []).filter((n) => stack.some((x) => x.toolName === n)),
});

const shortName = (n: string) => n.replace(/^GitHub /, "");

function UsageLine({ usage, className }: { usage: Usage; className?: string }) {
  if (usage.names.length === 0)
    return <span className={cn("truncate text-text-3", className)}>Not in a workflow</span>;
  return (
    <span className={cn("truncate text-text-2", className)}>
      {usage.names.join(", ")}
      {usage.overlaps.length > 0 && (
        <span className="text-lavender">
          {" · overlaps "}
          {usage.overlaps.map(shortName).join(", ")}
        </span>
      )}
    </span>
  );
}

function SortHead({
  label,
  active,
  onClick,
  dir,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dir: "up" | "down";
}) {
  const Icon = dir === "up" ? CaretUp : CaretDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-end gap-1 rounded-md text-right transition-colors hover:text-text-1",
        active ? "text-text-1" : "text-text-3",
      )}
    >
      {label}
      <Icon size={10} weight="bold" className={active ? "opacity-100" : "opacity-0"} />
    </button>
  );
}
