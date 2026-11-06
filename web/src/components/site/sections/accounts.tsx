"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotionConfig } from "motion/react";
import { Plus, ShieldCheck, Star } from "@phosphor-icons/react";
import { Btn, Heading } from "../ui";
import { CONTAINMENT, MODES } from "../content";
import { cn } from "@/lib/utils";
import { Edge } from "./top/edge";

/**
 * Three plan cards (the middle one featured) and the challenge panel under them.
 * Hovering a card lifts it and dims the others, like the reference.
 */
export function AccountsSection() {
  const reduce = useReducedMotionConfig();
  const grid = useRef<HTMLDivElement>(null);
  const shown = useShownBelow(grid, 0.85);
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, margin: "-10% 0px" },
          transition: { duration: 1, delay, ease: [0.25, 0.1, 0.25, 1] as const },
        };

  return (
    <section className="relative pb-[4.8rem] max-md:pb-16">
      <motion.div {...reveal()} className="mx-auto flex w-[37.875rem] flex-col items-center text-center max-md:w-[calc(100%-2rem)]">
        <Heading size="h2" className="mt-[1.19rem] leading-[1.25]">{MODES.title}</Heading>
      </motion.div>

      <div ref={grid} className="group/cards mx-auto mt-[2.4rem] grid w-[74.75rem] grid-cols-3 gap-[1.2rem] py-[1.2rem] max-md:w-[calc(100%-2rem)] max-md:grid-cols-1">
        {MODES.cards.map((card) => (
          // Each card pops up as the row reaches the lower part of the screen: the featured one
          // first, the other two a beat later. Scrolling back above the row resets them.
          <motion.div
            key={card.title}
            initial={false}
            animate={reduce || shown ? { opacity: 1, y: 0 } : { opacity: 0, y: "3rem" }}
            transition={{ duration: 0.68, delay: shown && card.tag === null ? 0.29 : 0, ease: [0.215, 0.61, 0.355, 1] }}
          >
            <AccountCard featured={card.tag !== null} card={card} />
          </motion.div>
        ))}
      </div>

      <motion.div {...reveal(0.1)}>
        <ChallengePanel />
      </motion.div>
    </section>
  );
}

/**
 * True once an element's top has passed a line partway down the screen, and false again only
 * when it drops back below that line (scrolling up past it), the way the reference triggers.
 */
function useShownBelow(ref: React.RefObject<HTMLElement | null>, line: number) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setShown(true);
        else if (e.boundingClientRect.top > 0) setShown(false);
      },
      { rootMargin: `0px 0px -${Math.round((1 - line) * 100)}% 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, line]);
  return shown;
}

/* ── Plan card ────────────────────────────────────────────────────────── */

function AccountCard({ featured, card }: { featured: boolean; card: (typeof MODES.cards)[number] }) {
  return (
    <article
      className={cn(
        "group/card relative h-[28.44rem] overflow-hidden rounded-[1.325rem] bg-[image:var(--gx-panel)] pt-[3.06rem] pr-[1.607rem] pb-[3.52rem] pl-[1.607rem] transition-opacity duration-300",
        "group-hover/cards:opacity-50 hover:opacity-100!",
        "max-md:h-auto max-md:pb-8",
      )}
    >
      {/* Hairline edge, brighter at the top */}
      <Edge from="color-mix(in srgb, #58f6b1 25%, transparent)" />
      {/* Lime wash from the top on hover (always on for the featured card) */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_18%,transparent),transparent_50%)] transition-opacity duration-300",
          featured ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
        )}
      />
      {/* Light line on the top edge */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0 left-1/2 h-[0.44rem] w-[19.25rem] -translate-x-1/2 bg-[radial-gradient(50%_100%_at_50%_0%,#58f6b1,transparent)] transition-opacity duration-300",
          featured ? "opacity-100" : "opacity-0 group-hover/card:opacity-100",
        )}
      />

      <div className="relative flex h-[2.1875rem] items-center justify-between gap-3">
        <Heading as="h3" size="card" className="max-md:text-[1.6rem]">{card.title}</Heading>
        {featured && (
          <span className="inline-flex h-[2.1875rem] items-center gap-[0.4rem] rounded-[0.5rem] border border-white/[0.07] bg-white/[0.02] px-[0.683rem] text-[0.6024rem] text-[var(--gx-text)]">
            <Star weight="fill" className="size-[0.75rem] text-[var(--gx-accent)]" />
            {card.tag}
          </span>
        )}
      </div>
      <p className="relative mt-[1.06rem] min-h-[3.375rem] text-[0.803rem] leading-[1.4] text-[#686868]">{card.body}</p>
      <div className="relative mt-[1.375rem] flex flex-col gap-[0.5rem]">
        <Btn variant="glow" icon wide href={MODES.primary.href}>
          {MODES.primary.label}
        </Btn>
        <Btn
          variant="ghost"
          wide
          href={MODES.secondary.href}
          className="bg-[linear-gradient(268deg,color-mix(in_srgb,#58f6b1_16%,#010102)_4.91%,transparent_57.89%)]"
        >
          {MODES.secondary.label}
        </Btn>
      </div>
      <ul className="relative mt-[1.44rem] flex flex-col gap-[0.68rem]">
        {card.bullets.map((b) => (
          <li key={b} className="relative pl-[1rem] text-[0.803rem] leading-none text-[#686868]">
            <span className="absolute top-1/2 left-[0.2rem] size-[0.25rem] -translate-y-1/2 rounded-full bg-[var(--gx-accent)]" />
            {b}
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ── Challenge panel ──────────────────────────────────────────────────── */

type TierState = "on" | "dim" | "active" | "off";
const TIERS: TierState[] = ["on", "active", "dim", "off"];

function ChallengePanel() {
  return (
    <div id="containment" className="relative mx-auto w-[74.69rem] scroll-mt-24 max-md:w-[calc(100%-2rem)]">
      {/* Light rising from under the panel, over a dot texture */}
      <span
        aria-hidden="true"
        className="gx-dots pointer-events-none absolute top-[19.75rem] left-1/2 size-[22.9rem] -translate-x-1/2 rounded-full opacity-50 [mask-image:radial-gradient(closest-side,#000,transparent)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[22.9rem] left-1/2 h-[16.7rem] w-[29.5rem] max-md:w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,#58f6b1_70%,transparent),transparent)] opacity-60 blur-[10px]"
      />

      <div className="relative grid h-[31.25rem] grid-cols-2 items-center gap-[4.016rem] overflow-hidden rounded-[1.325rem] bg-[image:var(--gx-panel)] px-[2.41rem] max-md:h-auto max-md:grid-cols-1 max-md:gap-10 max-md:px-5 max-md:py-8">
        <Edge from="color-mix(in srgb, #58f6b1 25%, transparent)" />

        {/* Tiers */}
        <div className="relative">
          <Heading as="h3" size="sm" className="max-md:text-[1.1rem]">{CONTAINMENT.tiersTitle}</Heading>
          <ul className="mt-[1.19rem] flex flex-col gap-[0.69rem]">
            {TIERS.map((t, i) => (
              <TierRow key={i} state={t} tier={CONTAINMENT.tiers[i]} />
            ))}
          </ul>
        </div>

        {/* Challenge */}
        <div className="relative">
          <div className="flex items-center gap-[0.8rem]">
            <Heading as="h3" size="challenge" className="max-md:text-[1.6rem]">{CONTAINMENT.title}</Heading>
            <span className="inline-flex h-[2.1875rem] items-center gap-[0.4rem] rounded-[0.5rem] border border-white/[0.07] bg-white/[0.02] px-[1rem] text-[0.703rem] whitespace-nowrap text-[var(--gx-text)]">
              <ShieldCheck weight="fill" className="size-[1.1rem] text-[var(--gx-accent)]" />
              {CONTAINMENT.tag}
            </span>
          </div>
          <p className="mt-[0.75rem] w-[23.3rem] text-[0.6024rem] leading-[1.5] text-[#a0a0a0] max-md:w-auto max-md:text-[0.85rem]">
            {CONTAINMENT.body}
          </p>
          <div className="mt-[1.25rem] grid grid-cols-4 gap-[0.6rem] max-md:grid-cols-2">
            {CONTAINMENT.stats.map((st) => (
              <div
                key={st.label}
                className="flex h-[4.31rem] flex-col items-center justify-center gap-[0.2rem] rounded-[0.803rem] border border-white/[0.07] bg-[radial-gradient(307.01%_88.35%_at_65.73%_3.01%,color-mix(in_srgb,#58f6b1_5%,#050507)_19.23%,color-mix(in_srgb,#58f6b1_10%,#0c0c10)_72.6%)] px-[0.88rem]"
              >
                <span className="text-[1.205rem] leading-none whitespace-nowrap text-[var(--gx-text)]">{st.value}</span>
                <span className="text-[0.6024rem] whitespace-nowrap text-[#686868]">{st.label}</span>
              </div>
            ))}
          </div>
          <Btn variant="glow" icon wide href={CONTAINMENT.cta.href} className="mt-[1.19rem]">
            {CONTAINMENT.cta.label}
          </Btn>
          <div className="mt-[0.625rem] flex items-center gap-[0.6rem]">
            <Btn variant="light" href={CONTAINMENT.primary.href}>{CONTAINMENT.primary.label}</Btn>
            <Btn variant="ghost" href={CONTAINMENT.secondary.href}>{CONTAINMENT.secondary.label}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierRow({ state, tier }: { state: TierState; tier: (typeof CONTAINMENT.tiers)[number] }) {
  const active = state === "active";
  return (
    <li
      className={cn(
        "grid h-[3.69rem] grid-cols-[auto_1fr_auto_4.69rem] items-center gap-[0.6rem] rounded-[0.78rem] border border-white/[0.07] px-[1rem] py-[0.68rem]",
        active
          ? "bg-[radial-gradient(307.01%_88.35%_at_65.73%_3.01%,color-mix(in_srgb,#58f6b1_5%,#050507)_19.23%,color-mix(in_srgb,#58f6b1_10%,#0c0c10)_72.6%)]"
          : "bg-[#111114]",
      )}
    >
      <span
        className={cn(
          "inline-flex h-[1.75rem] items-center rounded-[0.5rem] px-[0.7rem] text-[0.683rem] whitespace-nowrap",
          (state === "on" || active) && "border-[0.5px] border-[color-mix(in_srgb,#58f6b1_50%,#010102)] bg-[var(--gx-accent)] text-[#010102]",
          state === "dim" && "border-[0.5px] border-[color-mix(in_srgb,#58f6b1_25%,#010102)] bg-[color-mix(in_srgb,#58f6b1_30%,#010102)] text-[var(--gx-text)]",
          state === "off" && "bg-[#515151] text-[rgba(244,244,246,0.5)]",
        )}
      >
        {tier.chip}
      </span>
      <span className={cn("truncate text-[0.763rem]", active ? "text-white" : "text-[#686868]")}>{tier.value}</span>
      <span className="inline-flex h-[2.1875rem] items-center gap-[0.3rem] rounded-[0.5rem] bg-[#404040] px-[1rem] text-[0.723rem] whitespace-nowrap text-[var(--gx-text)]">
        <Plus className="size-[0.7rem] text-white" weight="bold" />
        {tier.note}
      </span>
      <span className={cn("truncate text-right text-[0.803rem]", active ? "text-[var(--gx-accent)]" : "text-[var(--gx-text)]")}>
        {tier.amount}
      </span>
    </li>
  );
}
