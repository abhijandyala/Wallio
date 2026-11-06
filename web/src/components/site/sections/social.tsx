"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotionConfig, useScroll, useTransform, type MotionValue } from "motion/react";
import { Body, Container, Heading, MockFrame, RimGlow, Shot } from "../ui";
import { LIVE } from "../content";

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
            <RimGlow />
            <div className="absolute inset-0 rounded-[1.6567rem] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_26%,#010102),rgba(0,0,0,0))]" />
            <div className="absolute inset-x-0 -top-[0.45rem] h-[2.44rem] bg-[radial-gradient(closest-side,var(--gx-accent),transparent)] opacity-80 blur-[6px]" />
            <div className="absolute inset-[0.6rem]">
              {/* All three screens stay mounted; their opacity follows the scroll, so the crossfade
                  is continuous and can't stutter however fast the page moves. */}
              {LIVE.images.map((img, i) => (
                <Screen key={img.src} i={i} progress={scrollYProgress} reduce={!!reduce} active={active}>
                  <MockFrame className="size-full rounded-[1.2049rem]">
                    <Shot src={img.src} alt={img.alt} zoom={img.zoom} />
                  </MockFrame>
                </Screen>
              ))}
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
                <motion.li
                  key={i}
                  // Each feature pops in when the scroll reaches it, and stays lit.
                  initial={false}
                  animate={
                    reduce
                      ? { opacity: 1 }
                      : i <= active
                        ? { opacity: 1, y: 0, scale: 1 }
                        : { opacity: i === active + 1 ? 0.3 : 0.12, y: 14, scale: 0.98 }
                  }
                  transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.8 }}
                  className="grid origin-left grid-cols-[0.375rem_1fr] gap-x-[1rem] max-md:!opacity-100 max-md:!transform-none"
                >
                  <span className="mt-[0.3rem] h-[1.125rem] w-[0.375rem] rounded-[2px] bg-[linear-gradient(color-mix(in_srgb,#58f6b1_12%,transparent)_0%,var(--gx-accent)_53%,color-mix(in_srgb,#58f6b1_12%,transparent)_100%)] shadow-[0_0_0.6rem_color-mix(in_srgb,#58f6b1_60%,transparent)]" />
                  <div>
                    <Heading as="h3" size="item" gradient={false}>{LIVE.features[i].title}</Heading>
                    <Body className="mt-[0.4rem] text-[0.8033rem]">{LIVE.features[i].body}</Body>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </Container>
      </section>
    </div>
  );
}

/** One screen in the stack: fully shown in the middle of its third of the scroll, crossfading at the edges. */
function Screen({
  i,
  progress,
  reduce,
  active,
  children,
}: {
  i: number;
  progress: MotionValue<number>;
  reduce: boolean;
  active: number;
  children: React.ReactNode;
}) {
  const edges = [0, 0.3, 0.6, 1];
  const fade = 0.07;
  const opacity = useTransform(
    progress,
    i === 0 ? [edges[1] - fade, edges[1] + fade] : i === 2 ? [edges[2] - fade, edges[2] + fade] : [edges[1] - fade, edges[1] + fade, edges[2] - fade, edges[2] + fade],
    i === 0 ? [1, 0] : i === 2 ? [0, 1] : [0, 1, 1, 0],
  );
  return (
    <motion.div style={reduce ? { opacity: i === active ? 1 : 0 } : { opacity }} className="absolute inset-0">
      {children}
    </motion.div>
  );
}
