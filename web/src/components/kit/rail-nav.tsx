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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

/** Bar and card heights. Each card tucks under the one below it so they read as a stack. */
export const BAR_HEIGHT = { wide: 56, narrow: 44 };
const CARD = {
  wide: { h: 92, overlap: 16 },
  narrow: { h: 62, overlap: 8 },
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
 * Navigation: a slim bar along the bottom edge with the Wallio wordmark.
 * Hover it (or click/tap it) and every section slides up as a full-width card,
 * stacked bottom to top.
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
  const barH = wide ? BAR_HEIGHT.wide : BAR_HEIGHT.narrow;
  const card = wide ? CARD.wide : CARD.narrow;
  const railRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByClick = useRef(false);
  // After picking a card, ignore hover for a moment so the menu doesn't pop back open
  // while the pointer is still near the bar.
  const hoverLockUntil = useRef(0);
  const [hovered, setHovered] = useState<number | null>(null);

  const isActive = (href: string) =>
    pathname.startsWith(href.split("?")[0]!);
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
        className="fixed inset-x-0 bottom-0 z-50"
        style={{ height: barH }}
        onMouseEnter={() => {
          if (performance.now() < hoverLockUntil.current) return;
          schedule(true, OPEN_DELAY);
        }}
        onMouseLeave={() => {
          openedByClick.current = false;
          schedule(false, CLOSE_DELAY);
        }}
      >
        {/* The cards. They start tucked behind the bar and slide up. */}
        <nav
          aria-label="Primary"
          id="rail-menu"
          className="absolute inset-x-0 bottom-0"
        >
          <AnimatePresence>
            {open &&
              NAV_ITEMS.map((item, i) => {
                const I = ICONS[item.icon];
                const active = isActive(item.href);
                const bottom = barH - card.overlap + i * (card.h - card.overlap);
                return (
                  <motion.div
                    key={item.href}
                    className="absolute inset-x-0"
                    style={{
                      bottom,
                      height: card.h,
                      zIndex: 20 - i,
                      willChange: "transform",
                    }}
                    initial={reduce ? { opacity: 0 } : { y: bottom + card.h }}
                    animate={
                      reduce
                        ? { opacity: 1, transition: { duration: 0.12 } }
                        : {
                            y: 0,
                            transition: {
                              duration: 0.42,
                              ease: [0.16, 1, 0.3, 1],
                              delay: i * 0.03,
                            },
                          }
                    }
                    // Closing: one smooth ease-in, the top card leaves first.
                    exit={
                      reduce
                        ? { opacity: 0, transition: { duration: 0.1 } }
                        : {
                            y: bottom + card.h,
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
                      style={{
                        ...(active ? {} : { backgroundColor: TONES[i] }),
                        // The bottom strip is hidden under the card below; centre the content in what shows.
                        paddingBottom: card.overlap,
                      }}
                      className={cn(
                        "group flex h-full w-full items-center gap-4 rounded-t-[18px] shadow-[0_-6px_18px_rgba(0,0,0,0.35)]",
                        wide ? "px-8" : "px-5",
                        active ? "bg-aurora text-ink" : "text-text-1",
                      )}
                    >
                      {/* The icon, with anything waiting shown on its corner where the eye lands. */}
                      <span
                        className="relative"
                        aria-label={
                          "count" in item && item.count > 0
                            ? `${item.count} waiting`
                            : undefined
                        }
                      >
                        <I
                          size={wide ? 20 : 17}
                          weight={active ? "fill" : "regular"}
                          aria-hidden="true"
                        />
                        <NotifyBadge
                          count={"count" in item ? item.count : 0}
                          tone={active ? "ink" : "lime"}
                          size={wide ? "lg" : "md"}
                          pulse={!active}
                          className={cn(
                            "absolute",
                            wide ? "-top-3.5 -right-5" : "-top-3 -right-4",
                          )}
                        />
                      </span>
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
                          "min-w-0 truncate whitespace-nowrap",
                          hovered === i
                            ? cn(
                                "font-mono tracking-[0.08em]",
                                wide ? "text-[15px]" : "text-[11px]",
                                active ? "text-ink/80" : "text-text-2",
                              )
                            : cn(
                                "font-medium tracking-[0.01em]",
                                wide ? "text-[22px]" : "text-[17px]",
                              ),
                        )}
                      />
                      {/* Spelled out at the end of the card too, in lime. */}
                      <span className="ml-auto flex shrink-0 items-center">
                        {"count" in item && item.count > 0 && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "font-medium tracking-[0.04em] whitespace-nowrap",
                              wide ? "text-[13px]" : "text-[11px]",
                              active ? "text-ink/70" : "text-lime",
                            )}
                          >
                            {item.count} waiting
                          </span>
                        )}
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
          // Glossy deep mint: a soft mint light at each end, a lit inner edge, a faint glow
          // up into the page, and a thin aurora line along the top edge.
          className="group/rail relative z-30 flex h-full w-full items-center justify-between bg-[#04100a] bg-[radial-gradient(20%_150%_at_0%_50%,rgba(88,246,177,0.13),transparent_70%),radial-gradient(24%_150%_at_100%_50%,rgba(88,246,177,0.15),transparent_70%),linear-gradient(90deg,#081c13_0%,#030c08_50%,#081c13_100%)] px-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_-8px_28px_-14px_rgba(34,176,124,0.45)]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(201,255,230,0.4)_22%,rgba(255,255,255,0.35)_50%,rgba(226,210,255,0.4)_78%,transparent_100%)] opacity-60 transition-opacity duration-300 group-hover/rail:opacity-100"
          />
          {/* Room for the logo, which is its own link (below), laid over the bar. */}
          <span aria-hidden="true" className={wide ? "w-[22px]" : "w-[18px]"} />
          <span
            className={cn(
              // The wordmark in the aurora: green at the W, white, violet at the o.
              "font-brand bg-[linear-gradient(90deg,#c9ffe6_0%,#ffffff_50%,#e2d2ff_100%)] bg-clip-text font-bold whitespace-nowrap text-transparent",
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

        {/* The W goes back to the main (landing) page, as a logo usually does. */}
        <Tooltip>
          <TooltipTrigger
            render={<Link href="/" />}
            aria-label="Back to the main page"
            onClick={() => {
              cancel();
              setOpen(false);
            }}
            className="group/logo absolute bottom-0 left-0 z-40 flex items-center pr-3 pl-6"
            style={{ height: barH }}
          >
            <LogoMark
              className={cn(
                "w-auto text-text-1 transition-[color,filter] duration-200 group-hover/logo:text-[#c9ffe6] group-hover/logo:drop-shadow-[0_0_8px_rgba(88,246,177,0.7)]",
                wide ? "h-[14px]" : "h-[11px]",
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={10} className="bg-surface-3 text-[12px] text-text-1 [&_svg]:hidden [&>*:last-child]:hidden">
            Back to the main page
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}
