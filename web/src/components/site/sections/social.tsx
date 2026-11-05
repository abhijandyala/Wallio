"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotionConfig, useScroll, useTransform } from "motion/react";
import { Body, Container, Heading, MockFrame, Shot } from "../ui";
import { LIVE } from "../content";
import { cn } from "@/lib/utils";

const FEATURES = [0, 1, 2];

/**
 * Product showcase, pinned for one extra viewport. Features light up one by one and the
 * screenshot frame crossfades to match.
 */
export function SocialSection() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(2, Math.floor(v * 3.3))));
  const headOpacity = useTransform(scrollYProgress, [0, 0.18], reduce ? [1, 1] : [0.25, 1]);

  return (
    <div ref={ref} id="live" className="relative h-[200vh] max-md:h-auto">
      <section className="sticky top-0 flex h-screen items-center max-md:static max-md:h-auto max-md:py-20">
        <Container className="flex items-center gap-[3.1875rem] max-md:flex-col max-md:items-start">
          {/* Media: lime-lit frame with a glow along its top edge */}
          <div className="relative h-[28.25rem] w-[50.5625rem] shrink-0 max-md:aspect-[809/452] max-md:h-auto max-md:w-full">
            <div className="absolute inset-0 rounded-[1.6567rem] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_26%,#010102),rgba(0,0,0,0))]" />
            <div className="absolute inset-x-0 -top-[0.45rem] h-[2.44rem] bg-[radial-gradient(closest-side,var(--gx-accent),transparent)] opacity-80 blur-[6px]" />
            <div className="absolute inset-[0.6rem]">
              <AnimatePresence initial={false}>
                <motion.div
                  key={active}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.45 }}
                  className="absolute inset-0"
                >
                  <MockFrame className="size-full rounded-[1.2049rem]">
                    <Shot src={LIVE.images[active].src} alt={LIVE.images[active].alt} zoom={LIVE.images[active].zoom} />
                  </MockFrame>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="flex w-[27.3125rem] flex-col max-md:w-full">
            <motion.div style={{ opacity: headOpacity }} className="max-md:!opacity-100">
              <Heading size="xl">{LIVE.title}</Heading>
              <p className="mt-[0.9375rem] w-[22.5rem] text-[0.9036rem] leading-[1.3] text-[var(--gx-dim)] max-md:w-full">
                {LIVE.body}
              </p>
            </motion.div>
            <ul className="mt-[2.4375rem] flex flex-col gap-[1.625rem]">
              {FEATURES.map((i) => (
                <li
                  key={i}
                  className={cn(
                    "grid grid-cols-[0.375rem_1fr] gap-x-[1rem] transition-opacity duration-500",
                    i <= active ? "opacity-100" : i === active + 1 ? "opacity-35" : "opacity-10",
                    "max-md:opacity-100",
                  )}
                >
                  <span className="mt-[0.3rem] h-[1.125rem] w-[0.375rem] rounded-full bg-[linear-gradient(color-mix(in_srgb,#58f6b1_12%,transparent)_0%,var(--gx-accent)_53%,color-mix(in_srgb,#58f6b1_12%,transparent)_100%)]" />
                  <div>
                    <Heading as="h3" size="item" gradient={false}>{LIVE.features[i].title}</Heading>
                    <Body className="mt-[0.4rem] text-[0.8033rem]">{LIVE.features[i].body}</Body>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>
    </div>
  );
}
