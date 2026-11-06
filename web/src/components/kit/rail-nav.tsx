"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import {
  House,
  Wallet,
  Compass,
  Scales,
  CheckSquareOffset,
  GearSix,
  Bell,
  type Icon,
} from "@phosphor-icons/react";
import { LogoMark } from "./logo-mark";
import { ScrambleText } from "./scramble-text";
import { NotifyBadge } from "./notify-badge";
import { NAV_ITEMS, type NavIcon } from "./nav-items";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, Icon> = {
  home: House,
  wallet: Wallet,
  discover: Compass,
  compare: Scales,
  decisions: CheckSquareOffset,
  settings: GearSix,
};

/** Rail and card widths. Cards overlap the next one slightly so they read as a stack. */
export const RAIL_WIDTH = { wide: 56, narrow: 44 };
const CARD = {
  wide: { w: 132, overlap: 16 },
  narrow: { w: 54, overlap: 8 },
};

// Graded darks, lightest on top of the stack, so every card edge reads. Current page is aurora.
const TONES = [
  "#1a3a2e",
  "#16332a",
  "#132d25",
  "#102720",
  "#0e221c",
  "#0c1d18",
];

const OPEN_DELAY = 120;
const CLOSE_DELAY = 200;

function useIsWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 640px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => true,
  );
}

/**
 * Navigation: a slim rail on the left edge with the vertical Wallio wordmark.
 * Hover it (or click/tap it) and every section slides out as a full-height card,
 * layered left to right, each labelled sideways.
 */
export function RailNav() {
  const pathname = usePathname();
  // The menu remembers which page it was opened on. Clicking a card navigates; the menu
  // stays up over the old page and closes by itself once the new page has rendered,
  // so the old page never flashes back into view mid-switch.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const setOpen = (next: boolean) =>
    setOpenOn(next ? window.location.pathname : null);
  const reduce = useReducedMotionConfig();
  const wide = useIsWide();
  const railW = wide ? RAIL_WIDTH.wide : RAIL_WIDTH.narrow;
  const card = wide ? CARD.wide : CARD.narrow;
  const railRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByClick = useRef(false);
  // After picking a card, ignore hover for a moment so the menu doesn't pop back open
  // while the pointer is still near the rail.
  const hoverLockUntil = useRef(0);
  const [hovered, setHovered] = useState<number | null>(null);

  const isActive = (href: string) =>
    pathname.startsWith(href);
  const waiting = NAV_ITEMS.reduce(
    (n, i) => n + ("count" in i ? i.count : 0),
    0,
  );

  const schedule = (next: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next) setHovered(null);
      setOpen(next);
    }, ms);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        railRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const t = openedByClick.current
      ? setTimeout(() => activeRef.current?.focus(), 80)
      : undefined;
    return () => {
      window.removeEventListener("keydown", onKey);
      if (t) clearTimeout(t);
    };
  }, [open]);

  useEffect(() => cancel, []);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-bg/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <div
        className="fixed inset-y-0 left-0 z-50"
        onMouseEnter={() => {
          if (performance.now() < hoverLockUntil.current) return;
          schedule(true, OPEN_DELAY);
        }}
        onMouseLeave={() => {
          openedByClick.current = false;
          schedule(false, CLOSE_DELAY);
        }}
      >
        {/* The cards. They start tucked behind the rail and slide out to the right. */}
        <nav
          aria-label="Primary"
          id="rail-menu"
          className="absolute inset-y-0 left-0"
        >
          <AnimatePresence>
            {open &&
              NAV_ITEMS.map((item, i) => {
                const I = ICONS[item.icon];
                const active = isActive(item.href);
                const left = railW - card.overlap + i * (card.w - card.overlap);
                return (
                  <motion.div
                    key={item.href}
                    className="absolute inset-y-0"
                    style={{
                      left,
                      width: card.w,
                      zIndex: 20 - i,
                      willChange: "transform",
                    }}
                    initial={reduce ? { opacity: 0 } : { x: -(left + card.w) }}
                    animate={
                      reduce
                        ? { opacity: 1, transition: { duration: 0.12 } }
                        : {
                            x: 0,
                            transition: {
                              duration: 0.42,
                              ease: [0.16, 1, 0.3, 1],
                              delay: i * 0.03,
                            },
                          }
                    }
                    // Closing: one smooth ease-in, rightmost card leaves first.
                    exit={
                      reduce
                        ? { opacity: 0, transition: { duration: 0.1 } }
                        : {
                            x: -(left + card.w),
                            transition: {
                              duration: 0.26,
                              ease: [0.5, 0, 0.75, 0],
                              delay: (NAV_ITEMS.length - 1 - i) * 0.02,
                            },
                          }
                    }
                  >
                    <Link
                      ref={active ? activeRef : undefined}
                      href={item.href}
                      onClick={() => {
                        // Same page: just close. Another page: navigation closes it.
                        cancel();
                        hoverLockUntil.current = performance.now() + 1200;
                        if (active) setOpen(false);
                      }}
                      onMouseEnter={() => setHovered(i)}
                      onFocus={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      aria-current={active ? "page" : undefined}
                      aria-description={item.hint}
                      style={active ? undefined : { backgroundColor: TONES[i] }}
                      className={cn(
                        "flex h-full w-full flex-col items-center justify-between group rounded-r-[18px] shadow-[6px_0_18px_rgba(0,0,0,0.35)]",
                        wide ? "py-6 pl-4" : "py-4 pl-2",
                        active ? "bg-aurora text-ink" : "text-text-1",
                      )}
                    >
                      <I
                        size={wide ? 20 : 17}
                        weight={active ? "fill" : "regular"}
                        aria-hidden="true"
                      />
                      {/* Label. On hover it decodes into what this section does, in place. */}
                      <ScrambleText
                        text={
                          hovered === i ? item.hint.toUpperCase() : item.label
                        }
                        key={hovered === i ? "hint" : "label"}
                        animateOnMount={hovered === i}
                        duration={650}
                        instant={hovered !== i}
                        className={cn(
                          "rotate-180 whitespace-nowrap [writing-mode:vertical-rl]",
                          hovered === i
                            ? cn(
                                "font-mono tracking-[0.08em]",
                                wide ? "text-[15px]" : "text-[11px]",
                                active ? "text-ink/80" : "text-text-2",
                              )
                            : cn(
                                "font-medium tracking-[0.01em]",
                                wide ? "text-[20px]" : "text-[15px]",
                              ),
                        )}
                      />
                      <span
                        className="grid h-5 place-items-center"
                        aria-label={
                          "count" in item && item.count > 0
                            ? `${item.count} waiting`
                            : undefined
                        }
                      >
                        <NotifyBadge
                          count={"count" in item ? item.count : 0}
                          tone={active ? "ink" : "lime"}
                        />
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </nav>

        {/* The rail */}
        <button
          ref={railRef}
          type="button"
          onClick={() => {
            cancel();
            openedByClick.current = !open;
            setHovered(null);
            setOpen(!open);
          }}
          aria-expanded={open}
          aria-controls="rail-menu"
          aria-label={
            open
              ? "Close menu"
              : waiting > 0
                ? `Open menu, ${waiting} waiting`
                : "Open menu"
          }
          // Glossy deep mint: a soft mint light at the top and bottom, a lit inner edge, a
          // faint glow into the page, and a thin aurora line down the right edge.
          className="group/rail relative z-30 flex h-full flex-col items-center justify-between bg-[#04100a] bg-[radial-gradient(150%_20%_at_50%_0%,rgba(88,246,177,0.13),transparent_70%),radial-gradient(150%_24%_at_50%_100%,rgba(88,246,177,0.15),transparent_70%),linear-gradient(180deg,#081c13_0%,#030c08_50%,#081c13_100%)] py-6 shadow-[inset_1px_0_0_rgba(255,255,255,0.03),8px_0_28px_-14px_rgba(34,176,124,0.45)]"
          style={{ width: railW }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[linear-gradient(180deg,transparent_0%,rgba(201,255,230,0.4)_22%,rgba(255,255,255,0.35)_50%,rgba(226,210,255,0.4)_78%,transparent_100%)] opacity-60 transition-opacity duration-300 group-hover/rail:opacity-100"
          />
          <LogoMark
            className={cn("relative w-auto text-text-1", wide ? "h-[14px]" : "h-[11px]")}
          />
          <span
            className={cn(
              // The wordmark in the aurora: green at the W, white, violet at the o.
              "relative font-brand rotate-180 bg-[linear-gradient(180deg,#c9ffe6_0%,#ffffff_50%,#e2d2ff_100%)] bg-clip-text font-bold whitespace-nowrap text-transparent [writing-mode:vertical-rl]",
              wide ? "text-[22px]" : "text-[18px]",
            )}
          >
            Wallio
          </span>
          {/* Waiting items: a bell with a lime count on its corner. */}
          <span className="relative grid h-6 w-6 place-items-center" aria-hidden="true">
            {waiting > 0 && !open && (
              <>
                <Bell size={wide ? 18 : 16} className="text-text-2" />
                <NotifyBadge count={waiting} className="absolute -top-2 -right-2.5 scale-90" />
              </>
            )}
          </span>
        </button>
      </div>
    </>
  );
}
