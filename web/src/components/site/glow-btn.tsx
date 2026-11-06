"use client";

import { useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The main action button, built the way the reference builds its glow button: a light
 * fill, a gradient edge, a near and a far blurred ring, and a bright light inside that
 * follows the pointer. Lime instead of their green; radius 8 instead of a pill.
 */
const EDGE = "linear-gradient(103.7deg, rgba(88,246,177,0.1) 38.66%, rgba(88,246,177,0.14) 68.55%, #58f6b1 85.01%, #ffffff 92.12%)";
const NEAR = "linear-gradient(97.68deg, rgba(183,251,220,0) 38.1%, rgba(183,251,220,0.22) 82.47%, #6dffc4 93.3%)";
const FAR = "linear-gradient(91.88deg, rgba(88,246,177,0.2) 46.45%, #2fd39a 98.59%)";
const border = (g: string) => `linear-gradient(#0000,#0000) padding-box, ${g} border-box`;

export function GlowBtn({
  href,
  wide,
  icon,
  className,
  children,
}: {
  href: string;
  wide?: boolean;
  icon?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const light = useRef<HTMLSpanElement>(null);
  const move = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    light.current?.style.setProperty("--lx", `${e.clientX - r.left}px`);
  };
  const leave = () => light.current?.style.removeProperty("--lx");

  return (
    <Link
      href={href}
      onPointerMove={move}
      onPointerLeave={leave}
      className={cn(
        "group/glow relative isolate inline-flex h-[2.1875rem] items-center justify-center gap-[0.4rem] px-[1.285rem] text-[0.803rem] whitespace-nowrap text-[#05070d]",
        wide && "w-full",
        className,
      )}
    >
      {/* Rings: a near one lightly blurred, a far one widely blurred. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[calc(100%+0.48rem)] w-[calc(100%+0.48rem)] -translate-1/2 rounded-[0.75rem]"
      >
        <span
          className="absolute -top-[2px] -left-[2px] box-content size-full rounded-[0.75rem] border-2 border-transparent blur-[0.1rem]"
          style={{ background: border(NEAR) }}
        />
        <span
          className="absolute -top-[3px] -left-[3px] box-content size-full rounded-[0.75rem] border-[3px] border-transparent blur-[0.75rem]"
          style={{ background: border(FAR) }}
        />
        <span className="absolute inset-0 rounded-[0.75rem] border border-transparent" style={{ background: border(EDGE) }} />
      </span>
      {/* Fill */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[0.5rem] border border-white/60 bg-[#d1d1d1]" />
      {/* The light inside, resting toward the right and following the pointer. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[0.5rem]">
        <span
          ref={light}
          className="absolute top-1/2 h-0 w-[11.2rem] transition-[left] duration-300 ease-out [--lx:78%]"
          style={{ left: "var(--lx)", transform: "translate(-50%, -50%)" }}
        >
          <span
            className="absolute top-1/2 left-1/2 h-[5.7rem] w-[11.2rem] -translate-1/2 blur-[0.25rem]"
            style={{
              background:
                "radial-gradient(43.3% 44.23% at 50% 49.51%, #ffffff 29%, #eafff6 48.5%, #c9f6e2 60.71%, rgba(214,255,240,0))",
            }}
          />
          <span
            className="absolute top-1/2 left-1/2 size-[6.66rem] -translate-1/2"
            style={{
              background:
                "radial-gradient(50% 50%, #ffffff 3.5%, #9dffd2 26.5%, #6dffc4 37.5%, rgba(88,246,177,0.5) 49%, rgba(88,246,177,0) 92.5%)",
            }}
          />
        </span>
      </span>
      {icon && <span className="relative z-[1] size-[0.55rem] rotate-45 rounded-[1px] border-[1.5px] border-current" aria-hidden="true" />}
      <span className="relative z-[1]">{children}</span>
    </Link>
  );
}
