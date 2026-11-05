"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { CaretLeft, Copy, QrCode, ArrowSquareOut } from "@phosphor-icons/react";
import { Badge, Container, Heading, P } from "../ui";
import { cn } from "@/lib/utils";

/** Public track record: text at left, a share-settings panel running off the right edge. */
export function VerifiedSection() {
  const reduce = useReducedMotionConfig();
  const fade = reduce
    ? {}
    : { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <section className="relative mt-[3.25rem] h-[45.0625rem] max-md:h-auto max-md:py-16">
      <Container className="flex h-full items-center max-md:flex-col max-md:items-start max-md:gap-10">
        <motion.div {...fade} className="flex w-[30.5rem] flex-col items-start max-md:w-full">
          <Badge tone="verified" />
          <Heading className="mt-[1.375rem] leading-[1.1]">
            {P}
            <br />
            {P}
          </Heading>
          <p className="mt-[1.25rem] text-[0.9036rem] text-[#a0a0a8]">{P}</p>
        </motion.div>
      </Container>

      <motion.div
        {...(reduce ? {} : { ...fade, transition: { duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const } })}
        className="absolute top-[6.44rem] left-[43.06vw] h-[32.19rem] w-[67.06rem] max-md:relative max-md:top-0 max-md:left-4 max-md:h-[26rem] max-md:w-[40rem]"
      >
        <div className="pointer-events-none absolute -inset-[0.625rem] rounded-[1.1rem] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_26%,#010102),rgba(0,0,0,0)_55%)]" />
        <div className="pointer-events-none absolute inset-x-[5%] -top-[1rem] h-[2.2rem] bg-[radial-gradient(closest-side,var(--gx-accent),transparent)] opacity-70 blur-[6px]" />
        <div className="absolute inset-0 overflow-hidden rounded-[1.506rem] bg-[#010102] [mask-image:linear-gradient(#000_55%,transparent_92%)]">
          <SharePanel />
        </div>
      </motion.div>
    </section>
  );
}

function Toggle({ on = false, dim = false }: { on?: boolean; dim?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative h-[1.05rem] w-[1.9rem] shrink-0 rounded-full",
        on ? "bg-[var(--gx-accent)] shadow-[0_0_12px_color-mix(in_srgb,#58f6b1_60%,transparent)]" : "bg-white/15",
        dim && "opacity-60",
      )}
    >
      <span className={cn("absolute top-1/2 size-[0.75rem] -translate-y-1/2 rounded-full bg-white", on ? "right-[0.15rem]" : "left-[0.15rem]")} />
    </span>
  );
}

function SharePanel() {
  return (
    <div className="grid grid-cols-[29rem_1fr] gap-[2rem] px-[1.25rem] pt-[4.6rem] max-md:grid-cols-[22rem_1fr]">
      <div className="flex flex-col">
        <span className="text-[1.25rem] text-[var(--gx-text)]">{P}</span>
        <span className="mt-[0.2rem] text-[0.66rem] text-[var(--gx-dim)]">{P} {P} {P}</span>
        <div className="mt-[0.9rem] flex h-[6.6rem] items-center justify-between rounded-[0.8rem] border border-white/[0.08] bg-white/[0.02] px-[1.1rem]">
          <span className="flex flex-col gap-[0.2rem]">
            <span className="text-[0.75rem] text-[var(--gx-text)]">{P}</span>
            <span className="text-[0.66rem] text-[var(--gx-dim)]">{P} {P}</span>
          </span>
          <Toggle on />
        </div>
        <span className="mt-[1.6rem] text-[1.25rem] text-[var(--gx-text)]">{P}</span>
        <div className="mt-[0.7rem] flex items-center gap-[1.3rem]">
          <span className="flex h-[2.6rem] w-[19rem] items-center rounded-[0.7rem] border border-white/[0.08] bg-white/[0.02] px-[0.8rem] text-[0.7rem] text-[var(--gx-muted)]">{P}</span>
          {[Copy, QrCode, ArrowSquareOut].map((I, i) => (
            <span key={i} className="grid size-[1.8rem] place-items-center rounded-[0.45rem] border border-white/[0.08] text-white/60">
              <I className="size-[0.8rem]" />
            </span>
          ))}
        </div>
        <span className="mt-[1.6rem] text-[1.25rem] text-[var(--gx-text)]">{P}</span>
        <span className="mt-[0.2rem] text-[0.66rem] text-[var(--gx-dim)]">{P} {P}</span>
        {[0, 1, 2].map((i) => (
          <span key={i} className="mt-[0.9rem] flex items-center justify-between text-[0.75rem] text-[var(--gx-muted)]">
            {P}
            <Toggle dim />
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-[1rem] pt-[3.2rem]">
        <div className="flex gap-[0.6rem]">
          {[0, 1].map((i) => (
            <span key={i} className="flex h-[6.1rem] w-[11.5rem] flex-col items-center justify-center rounded-[0.8rem] border border-white/[0.08] bg-white/[0.02]">
              <span className="text-[1.15rem] leading-none text-[var(--gx-text)]">{P}</span>
              <span className="mt-[0.4rem] text-[0.75rem] text-[var(--gx-muted)]">{P}</span>
            </span>
          ))}
        </div>
        <div className="relative h-[12rem] rounded-[0.8rem] border border-white/[0.06] bg-white/[0.015]">
          <CaretLeft className="absolute top-[0.9rem] left-[0.6rem] size-[0.7rem] text-white/50" />
          <span className="absolute top-[0.8rem] right-[0.8rem] text-[0.55rem] text-white/60">{P}</span>
          <svg viewBox="0 0 300 120" className="absolute inset-x-[0.8rem] bottom-[0.8rem] h-[8rem]" fill="none" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 100 L40 92 L80 96 L120 70 L160 78 L200 50 L240 58 L300 30" stroke="color-mix(in srgb, #58f6b1 70%, transparent)" strokeWidth="1.5" />
            <path d="M0 100 L40 92 L80 96 L120 70 L160 78 L200 50 L240 58 L300 30 V120 H0Z" fill="color-mix(in srgb, #58f6b1 10%, transparent)" />
          </svg>
        </div>
      </div>
    </div>
  );
}
