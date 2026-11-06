"use client";

import { Eyebrow } from "../ui";
import { LIMITS } from "../content";
import { cn } from "@/lib/utils";

/**
 * The numbers, in the reference's bento: a tall pale card on the left (lavender to cream to
 * mint) and three deep mint cards on the right, one wide over two. Each card hides a faint
 * dot grid that lights up around the cursor, like the reference's card effect.
 */
export function Limits() {
  const [tall, wide, a, b] = LIMITS.cards;
  return (
    <section id="limits" className="mt-[7.5rem] scroll-mt-24 pt-[7.5rem] max-md:pt-16">
      <div className="mx-auto flex max-w-[40rem] flex-col items-center text-center max-md:px-4">
        <Eyebrow>{LIMITS.eyebrow}</Eyebrow>
        <h2 className="wl-h1 mt-[1.94rem]">{LIMITS.title}</h2>
        <p className="wl-body mt-[3rem] max-w-[33.125rem]">{LIMITS.body}</p>
      </div>
      <div className="mx-auto mt-[5rem] grid w-[80rem] grid-cols-3 grid-rows-[18.125rem_18.125rem] gap-[1.25rem] max-md:w-[calc(100%-2rem)] max-md:grid-cols-1 max-md:grid-rows-none">
        <Card card={tall} pale className="row-span-2 max-md:row-span-1" />
        <Card card={wide} className="col-span-2 max-md:col-span-1" />
        <Card card={a} />
        <Card card={b} />
      </div>
    </section>
  );
}

function Card({ card, pale, className }: { card: (typeof LIMITS.cards)[number]; pale?: boolean; className?: string }) {
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      onPointerMove={move}
      className={cn(
        "group relative flex min-h-[18.125rem] flex-col justify-between overflow-hidden rounded-[1rem] p-[2.25rem]",
        pale
          ? "bg-[radial-gradient(41288.31%_255.77%_at_-42.4%_-22.13%,var(--wl-lav)_0%,var(--wl-cream)_44.72%,var(--wl-100)_85.38%,var(--wl-mint)_100%)] text-[var(--wl-900)]"
          : "bg-[var(--wl-800)]",
        className,
      )}
    >
      {/* Dot grid, faint everywhere and lit around the pointer */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-[size:1.5rem_1.5rem] opacity-30 transition-opacity duration-300 group-hover:opacity-100",
          pale
            ? "bg-[radial-gradient(rgba(13,74,53,0.35)_0.07rem,transparent_0.09rem)]"
            : "bg-[radial-gradient(rgba(201,255,230,0.3)_0.07rem,transparent_0.09rem)]",
          "[mask-image:radial-gradient(14rem_circle_at_var(--mx,50%)_var(--my,50%),#000,transparent)]",
        )}
      />
      <p className={cn("wl-caps relative", pale ? "text-[var(--wl-900)]" : "text-[var(--wl-100)]")}>
        {card.label[0]}
        <br />
        {card.label[1]}
      </p>
      <div
        className={cn(
          "relative mt-8 text-[5.67rem] leading-none font-semibold tracking-[-0.25rem] max-md:text-[4rem]",
          pale ? "text-[var(--wl-900)]" : "text-[var(--wl-lav-100)]",
        )}
      >
        {card.value}
      </div>
    </div>
  );
}
