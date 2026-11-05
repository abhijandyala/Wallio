"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { Btn, Container } from "../ui";
import { CLOSING } from "../content";
import { CandlesCanvas } from "./bottom/candles-canvas";

/** Closing call to action: a dark lit box with a large heading and particle candlesticks. */
export function InstantSection() {
  const reduce = useReducedMotionConfig();
  const fade = reduce
    ? {}
    : { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <section className="relative mt-[3.1875rem]">
      <Container>
        <div className="relative h-[42.5625rem] overflow-hidden rounded-[1.3254rem] bg-[#010102] max-md:h-auto max-md:min-h-[36rem]">
          {/* Light: a bright corner, a wide glow from the bottom centre, a dotted floor */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(38%_45%_at_0%_0%,color-mix(in_srgb,#58f6b1_55%,transparent),transparent_70%)]" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(42%_48%_at_50%_100%,color-mix(in_srgb,#58f6b1_75%,#ffffff_10%),color-mix(in_srgb,#58f6b1_18%,transparent)_45%,transparent_75%)]" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(30%_40%_at_75%_45%,rgba(0,0,0,0.55),transparent_70%)]" />
          <span aria-hidden="true" className="gx-dots pointer-events-none absolute bottom-0 left-[14%] h-[40%] w-[30%] [mask-image:radial-gradient(closest-side,#000,transparent)]" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/[0.06]" />

          <CandlesCanvas className="absolute top-[5.25rem] right-[1.25rem] h-[32.125rem] w-[37.4375rem] max-md:top-auto max-md:right-0 max-md:bottom-0 max-md:h-[16rem] max-md:w-full" />

          <motion.div {...fade} className="relative flex h-full flex-col justify-center px-[4rem] max-md:px-6 max-md:pt-16 max-md:pb-72">
            <h2 className="gx-heading w-[40rem] text-[4.016rem] leading-[1.26] max-md:w-full max-md:text-[2.5rem]">
              {CLOSING.title[0]}
              <br />
              {CLOSING.title[1]}
            </h2>
            <p className="mt-[1rem] text-[0.9036rem] text-[var(--gx-dim)]">{CLOSING.body}</p>
            <div className="mt-[1.5rem] flex gap-[0.5625rem]">
              <Btn variant="glow" icon href={CLOSING.primary.href}>{CLOSING.primary.label}</Btn>
              <Btn variant="ghost" href={CLOSING.secondary.href}>{CLOSING.secondary.label}</Btn>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
