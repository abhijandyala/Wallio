"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { Container, Heading, Shot } from "../ui";
import { DATA } from "../content";

/** Your data: text at left, the real Settings screen running off the right edge. */
export function VerifiedSection() {
  const reduce = useReducedMotionConfig();
  const fade = reduce
    ? {}
    : { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <section className="relative mt-[3.25rem] h-[45.0625rem] max-md:h-auto max-md:py-16">
      <Container className="flex h-full items-center max-md:flex-col max-md:items-start max-md:gap-10">
        <motion.div {...fade} className="flex w-[30.5rem] flex-col items-start max-md:w-full">
          <Heading className="mt-[1.375rem] leading-[1.1]">
            {DATA.title[0]}
            <br />
            {DATA.title[1]}
          </Heading>
          <p className="mt-[1.25rem] w-[24rem] text-[0.9036rem] leading-[1.5] text-[#a0a0a8] max-md:w-full">{DATA.body}</p>
        </motion.div>
      </Container>

      <motion.div
        {...(reduce ? {} : { ...fade, transition: { duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const } })}
        className="absolute top-[6.44rem] left-[43.06vw] h-[32.19rem] w-[67.06rem] max-md:relative max-md:top-0 max-md:left-4 max-md:h-[26rem] max-md:w-[40rem]"
      >
        <div className="pointer-events-none absolute -inset-[0.625rem] rounded-[1.1rem] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_26%,#010102),rgba(0,0,0,0)_55%)]" />
        <div className="pointer-events-none absolute inset-x-[5%] -top-[1rem] h-[2.2rem] bg-[radial-gradient(closest-side,var(--gx-accent),transparent)] opacity-70 blur-[6px]" />
        <div className="absolute inset-0 overflow-hidden rounded-[1.506rem] bg-[#010102] [mask-image:linear-gradient(#000_55%,transparent_92%)]">
          <Shot src={DATA.image.src} alt={DATA.image.alt} zoom={DATA.image.zoom} />
        </div>
      </motion.div>
    </section>
  );
}
