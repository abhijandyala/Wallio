"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { Body, Btn, Container, Heading, MockFrame, RimGlow, Shot } from "../ui";
import { RECEIPTS } from "../content";
import { AiPanelArt, BarsArt, Circuit, DeviceArt, StackArt } from "./bottom/bento-art";
import { cn } from "@/lib/utils";
import { Edge } from "./top/edge";

/** Journal: centred intro, a large product frame, then a 2x2 bento of feature cards. */
export function JournalSection() {
  const reduce = useReducedMotionConfig();
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 1, delay, ease: [0.25, 0.1, 0.25, 1] as const },
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
        <RimGlow edge="0.625rem" />
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
          <BentoCard reveal={reveal(0)} className="w-[31.75rem]" look={LOOKS[0]}>
            <Circuit className="absolute top-[3rem] left-0 w-full opacity-70" />
            <div className="absolute top-[3.2rem] left-1/2 -translate-x-1/2">
              <DeviceArt />
            </div>
            <CardText i={0} className="mt-auto" />
          </BentoCard>
          <BentoCard reveal={reveal(0.08)} className="flex-1" look={LOOKS[1]}>
            <CardText i={1} />
            <div className="absolute top-[7.4rem] right-[5rem] max-md:right-6">
              <AiPanelArt />
            </div>
            <span className="absolute top-[6.7rem] right-[11rem] size-[0.3rem] rounded-full bg-white/90 shadow-[0_0_8px_white]" />
            <span className="absolute right-[11rem] bottom-[1.1rem] size-[0.3rem] rounded-full bg-white/90 shadow-[0_0_8px_white]" />
          </BentoCard>
        </div>
        <div className="flex gap-[1rem] max-md:flex-col">
          <BentoCard reveal={reveal(0)} className="flex-1" look={LOOKS[2]}>
            <div className="absolute top-[2.2rem] left-1/2 -translate-x-1/2">
              <BarsArt />
            </div>
            <CardText i={2} className="mt-auto" />
          </BentoCard>
          <BentoCard reveal={reveal(0.08)} className="flex-1" look={LOOKS[3]}>
            <div className="absolute top-[3.6rem] left-1/2 -translate-x-1/2">
              <StackArt />
            </div>
            <CardText i={3} className="mt-auto" />
          </BentoCard>
        </div>
      </Container>
    </section>
  );
}

/**
 * How each card is lit, measured from the reference's card artwork. Points are percentages of
 * the card (they may sit outside it); sizes are rem.
 * - glow: the bright corner light (a wide accent ellipse plus two smaller ones added on top)
 * - lift: a soft grey light in the opposite corner
 * - tint: a wide green tint, blended as colour only, over the middle
 * - dots: a halftone dot grid that fades out from its centre, in one corner
 */
type Look = {
  glow: [number, number];
  lift: [number, number];
  tint: [number, number];
  dots?: { at: [number, number]; size: [number, number]; opacity: number };
};

const LOOKS: Look[] = [
  { glow: [138, 102], lift: [23, -15], tint: [57, 53], dots: { at: [2, -10], size: [32.9, 21], opacity: 0.5 } },
  { glow: [12.7, 116], lift: [84, -36], tint: [74, 53] },
  { glow: [105, 10], lift: [-5, 132], tint: [64, 53], dots: { at: [11, 109], size: [34.6, 25], opacity: 0.2 } },
  { glow: [-1.5, 10], lift: [92, 132], tint: [55, 53], dots: { at: [96, 119], size: [31.4, 24.8], opacity: 0.5 } },
];

/** A blurred ellipse centred on a point of the card. */
function Light({ at, w, h, blur, className }: { at: [number, number]; w: number; h: number; blur: number; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute -translate-1/2 rounded-[50%]", className)}
      style={{ left: `${at[0]}%`, top: `${at[1]}%`, width: `${w}rem`, height: `${h}rem`, filter: `blur(${blur}rem)` }}
    />
  );
}

function BentoCard({
  className,
  look,
  reveal,
  children,
}: {
  className?: string;
  look: Look;
  reveal: object;
  children: React.ReactNode;
}) {
  return (
    <motion.article
      {...reveal}
      className={cn(
        "relative isolate flex h-[20.8125rem] flex-col overflow-hidden rounded-[1.65rem] bg-[radial-gradient(90%_85%_at_66%_3%,#08120f_19%,#010101_73%)] p-[1.6065rem] max-md:h-[22rem] max-md:w-full",
        className,
      )}
    >
      <Light at={look.lift} w={30.6} h={18.3} blur={8.2} className="bg-[#2c2c2c]" />
      <Light at={look.tint} w={31} h={31} blur={8.2} className="bg-[#0b4a36] mix-blend-color" />
      <Light at={look.glow} w={30.6} h={18.3} blur={8.25} className="bg-[#2fd39a]" />
      <Light at={look.glow} w={15.4} h={14.3} blur={9} className="bg-[#58f6b1] mix-blend-plus-lighter" />
      <Light at={look.glow} w={15.4} h={14.3} blur={7.9} className="bg-[#58f6b1] mix-blend-plus-lighter" />
      {look.dots && (
        <span
          aria-hidden="true"
          className="gx-halftone pointer-events-none absolute -translate-1/2 [mask-image:radial-gradient(closest-side,#000,transparent)]"
          style={{
            left: `${look.dots.at[0]}%`,
            top: `${look.dots.at[1]}%`,
            width: `${look.dots.size[0]}rem`,
            height: `${look.dots.size[1]}rem`,
            opacity: look.dots.opacity,
          }}
        />
      )}
      {/* Hairline: light grey at the top right, turning green toward the bottom left. */}
      <Edge from="to bottom left, rgba(164,164,164,0.5) 24%" to="rgba(26,106,76,0.5)" stop="63%" />
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
