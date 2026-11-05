"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, GithubLogo, List, Question, X } from "@phosphor-icons/react";
import { Wordmark } from "@/components/kit/wordmark";
import { Btn } from "../ui";
import { LINKS, NAV } from "../content";
import { cn } from "@/lib/utils";

/**
 * Fixed header. The glass pill stays; the logo and the actions slide out once the page
 * scrolls past ~100px, like the reference (0.4s ease, 19px drift).
 */
const ITEMS = NAV.items;

export function NavSection() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLElement>(null);
  const glow = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A soft lime light follows the pointer inside the pill.
  const onMove = (e: React.PointerEvent) => {
    const r = pill.current?.getBoundingClientRect();
    if (!r || !glow.current) return;
    glow.current.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
    glow.current.style.opacity = "1";
  };
  const onLeave = () => {
    if (glow.current) glow.current.style.opacity = "0";
  };

  const side = "transition-[transform,opacity] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]";

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[4.75rem]">
      {/* Desktop */}
      <div className="relative mx-auto hidden h-full w-[85.0625rem] items-start md:flex">
        <div
          className={cn(
            "absolute top-[1.375rem] left-0 flex h-[2rem] items-center",
            side,
            scrolled ? "-translate-x-[1.2rem] -translate-y-[0.44rem] opacity-0" : "opacity-100",
          )}
        >
          <Wordmark className="[&_span]:text-[1.15rem] [&_svg]:h-[1rem]" />
        </div>

        <nav
          ref={pill}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          className="gx-glass absolute top-[1rem] left-1/2 flex h-[2.6875rem] -translate-x-1/2 items-center overflow-hidden rounded-[0.5rem] px-[0.4rem]"
        >
          <span
            ref={glow}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 size-[15.2rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,#58f6b1_22%,transparent),transparent)] opacity-0 transition-opacity duration-300"
          />
          {ITEMS.map((it, i) => (
            <a
              key={i}
              href={it.href}
              className="relative flex h-[2.5625rem] items-center gap-[0.35rem] px-[0.884rem] text-[0.803rem] whitespace-nowrap text-[#c4c4c4] transition-colors hover:text-white"
            >
              {it.label}
              {it.caret && <CaretDown className="size-[0.75rem]" />}
            </a>
          ))}
        </nav>

        <div
          className={cn(
            "absolute top-[1.25rem] right-0 flex items-center gap-[0.65rem]",
            side,
            scrolled ? "translate-x-[1.2rem] -translate-y-[0.44rem] opacity-0" : "opacity-100",
          )}
        >
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noreferrer"
            className="flex h-[1.94rem] items-center gap-[0.3rem] rounded-[0.5rem] px-[0.48rem] text-[0.75rem] text-[var(--gx-text)] hover:bg-white/[0.04]"
            aria-label="Wallio on GitHub"
          >
            <GithubLogo className="size-[1.1rem]" />
            <CaretDown className="size-[0.7rem]" />
          </a>
          <a
            href="#judges"
            className="grid size-[1.625rem] place-items-center rounded-[0.5rem] text-[var(--gx-text)] opacity-80 hover:opacity-100"
            aria-label="For judges"
          >
            <Question className="size-[1.1rem]" weight="fill" />
          </a>
          <Btn variant="ghost" href={NAV.secondary.href}>{NAV.secondary.label}</Btn>
          <Btn variant="glow" href={NAV.primary.href}>{NAV.primary.label}</Btn>
        </div>
      </div>

      {/* Phones */}
      <div className="flex h-16 items-center justify-between px-4 md:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Menu"
          className="gx-glass grid size-10 place-items-center rounded-[10px]"
        >
          {open ? <X size={18} /> : <List size={18} />}
        </button>
      </div>
      {open && (
        <div className="gx-glass mx-4 flex flex-col gap-1 rounded-[16px] p-3 md:hidden">
          {ITEMS.map((it, i) => (
            <a key={i} href={it.href} onClick={() => setOpen(false)} className="flex h-11 items-center px-3 text-[15px] text-[#c4c4c4]">
              {it.label}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Btn variant="ghost" href={NAV.secondary.href} className="h-11 text-[14px]">{NAV.secondary.label}</Btn>
            <Btn variant="glow" href={NAV.primary.href} className="h-11 text-[14px]">{NAV.primary.label}</Btn>
          </div>
        </div>
      )}
    </header>
  );
}
