"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { Body, Btn, Container, Heading, MockFrame, Shot } from "../ui";
import { RECEIPTS } from "../content";
import { AiPanelArt, BarsArt, Circuit, DeviceArt, StackArt } from "./bottom/bento-art";
import { cn } from "@/lib/utils";

/** Journal: centred intro, a large product frame, then a 2x2 bento of feature cards. */
export function JournalSection() {
  const reduce = useReducedMotionConfig();
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="relative mt-[2.375rem] pb-[3.25rem]">
      <motion.div {...reveal()} className="mx-auto flex w-[33.75rem] flex-col items-center text-center max-md:w-[calc(100%-2rem)]">
        <Heading>
          {RECEIPTS.title[0]}
          <br />
          {RECEIPTS.title[1]}
        </Heading>
        <p className="mt-[1.4rem] w-[25rem] text-[0.9036rem] leading-[1.45] text-[var(--gx-dim)] max-md:w-full">
          {RECEIPTS.body}
        </p>
        <div className="mt-[1.4rem] flex gap-[0.5rem]">
          <Btn variant="light" href={RECEIPTS.primary.href} className="gap-[0.5rem] pl-[0.6rem]">
            <span className="grid size-[1.25rem] place-items-center rounded-full bg-[#05070d]">
              <span className="size-[0.4rem] rounded-full bg-[var(--gx-violet)]" />
            </span>
            {RECEIPTS.primary.label}
          </Btn>
          <Btn variant="violetGhost" href={RECEIPTS.secondary.href}>
            {RECEIPTS.secondary.label}
          </Btn>
        </div>
      </motion.div>

      <motion.div {...reveal(0.1)} className="relative mx-auto mt-[2.875rem] h-[29.6875rem] w-[76rem] max-md:aspect-[1216/475] max-md:h-auto max-md:w-[calc(100%-2rem)]">
        <div className="pointer-events-none absolute -inset-x-[0.625rem] -top-[0.625rem] bottom-0 rounded-t-[2rem] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_22%,transparent),rgba(0,0,0,0))]" />
        <div className="pointer-events-none absolute inset-x-0 -top-[1.05rem] h-[2.44rem] bg-[radial-gradient(closest-side,var(--gx-accent),transparent)] opacity-75 blur-[6px]" />
        <div className="absolute inset-0">
          <MockFrame className="size-full [mask-image:linear-gradient(#000_70%,transparent)]">
            <Shot src={RECEIPTS.image.src} alt={RECEIPTS.image.alt} />
          </MockFrame>
        </div>
      </motion.div>

      <Container className="mt-[8rem] flex flex-col gap-[1rem] max-md:mt-16">
        <div className="flex gap-[1rem] max-md:flex-col">
          <BentoCard reveal={reveal(0)} className="w-[31.75rem]" glow="top">
            <Circuit className="absolute top-[3rem] left-0 w-full opacity-70" />
            <div className="absolute top-[3.2rem] left-1/2 -translate-x-1/2">
              <DeviceArt />
            </div>
            <span className="gx-dots absolute top-0 left-0 h-[6rem] w-[9rem] [mask-image:radial-gradient(closest-side,#000,transparent)]" />
            <CardText i={0} className="mt-auto" />
          </BentoCard>
          <BentoCard reveal={reveal(0.08)} className="flex-1" glow="bottom-left">
            <CardText i={1} />
            <div className="absolute top-[7.4rem] right-[5rem] max-md:right-6">
              <AiPanelArt />
            </div>
            <span className="absolute top-[6.7rem] right-[11rem] size-[0.3rem] rounded-full bg-white/90 shadow-[0_0_8px_white]" />
            <span className="absolute right-[11rem] bottom-[1.1rem] size-[0.3rem] rounded-full bg-white/90 shadow-[0_0_8px_white]" />
          </BentoCard>
        </div>
        <div className="flex gap-[1rem] max-md:flex-col">
          <BentoCard reveal={reveal(0)} className="flex-1" glow="top-right">
            <div className="absolute top-[2.2rem] left-1/2 -translate-x-1/2">
              <BarsArt />
            </div>
            <span className="gx-dots absolute bottom-0 left-0 h-[7rem] w-[12rem] [mask-image:radial-gradient(closest-side,#000,transparent)]" />
            <CardText i={2} className="mt-auto" />
          </BentoCard>
          <BentoCard reveal={reveal(0.08)} className="flex-1" glow="top-left">
            <div className="absolute top-[2rem] left-1/2 -translate-x-1/2">
              <StackArt />
            </div>
            <span className="gx-dots absolute right-0 bottom-0 h-[7rem] w-[12rem] [mask-image:radial-gradient(closest-side,#000,transparent)]" />
            <CardText i={3} className="mt-auto" />
          </BentoCard>
        </div>
      </Container>
    </section>
  );
}

type Glow = "top" | "bottom-left" | "top-right" | "top-left";

const GLOW: Record<Glow, string> = {
  top: "bg-[radial-gradient(60%_55%_at_50%_0%,color-mix(in_srgb,#58f6b1_22%,transparent),transparent)]",
  "bottom-left": "bg-[radial-gradient(55%_95%_at_22%_88%,color-mix(in_srgb,#58f6b1_72%,transparent),transparent_70%)]",
  "top-right": "bg-[radial-gradient(55%_90%_at_92%_8%,color-mix(in_srgb,#58f6b1_62%,transparent),transparent_70%)]",
  "top-left": "bg-[radial-gradient(55%_90%_at_6%_6%,color-mix(in_srgb,#58f6b1_30%,transparent),transparent_70%)]",
};

function BentoCard({
  className,
  glow,
  reveal,
  children,
}: {
  className?: string;
  glow: Glow;
  reveal: object;
  children: React.ReactNode;
}) {
  return (
    <motion.article
      {...reveal}
      className={cn(
        "relative flex h-[20.8125rem] flex-col overflow-hidden rounded-[1.3254rem] border border-white/[0.04] bg-white/[0.02] p-[1.6065rem] max-md:h-[22rem] max-md:w-full",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("pointer-events-none absolute inset-0", GLOW[glow])} />
      {children}
    </motion.article>
  );
}

function CardText({ i, className }: { i: number; className?: string }) {
  const card = RECEIPTS.cards[i];
  return (
    <div className={cn("relative max-w-[24rem]", className)}>
      <Heading as="h3" size="sub">{card.title}</Heading>
      <Body className="mt-[0.5rem] text-[0.8033rem] text-[var(--gx-muted)]">{card.body}</Body>
    </div>
  );
}
