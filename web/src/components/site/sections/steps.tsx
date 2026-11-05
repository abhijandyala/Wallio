"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotionConfig, useScroll, useTransform } from "motion/react";
import { Badge, Body, Btn, Container, Heading } from "../ui";
import { STEPS as COPY } from "../content";
import { cn } from "@/lib/utils";

const STEPS = [1, 2, 3];

/**
 * "Seamless access" steps. Pinned for one extra viewport while the stage turns the globe
 * (left of centre). The intro fades in, the track fills with lime and each step lights in turn.
 */
export function StepsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(2, Math.floor(v * 3.2))));

  const introOpacity = useTransform(scrollYProgress, [0, 0.22], reduce ? [1, 1] : [0, 1]);
  const introY = useTransform(scrollYProgress, [0, 0.22], reduce ? [0, 0] : [24, 0]);
  const fill = useTransform(scrollYProgress, [0.05, 0.85], ["0%", "100%"]);

  return (
    <div ref={ref} id="steps" data-stage="steps" className="relative h-[200vh] max-md:h-auto">
      <section className="sticky top-0 flex h-screen items-center max-md:static max-md:h-auto max-md:py-24">
        <Container className="relative flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-12">
          <motion.div style={{ opacity: introOpacity, y: introY }} className="flex w-[27.3125rem] flex-col items-start max-md:w-full max-md:!transform-none max-md:!opacity-100">
            <Badge>{COPY.badge}</Badge>
            <Heading className="mt-[1.25rem] w-full">
              {COPY.title[0]}
              <br />
              {COPY.title[1]}
            </Heading>
            <p className="mt-[1rem] w-[21.875rem] text-[0.9036rem] leading-[1.6] text-[var(--gx-dim)] max-md:w-full">
              {COPY.body}
            </p>
            <div className="mt-[1.4375rem] flex gap-[0.5625rem]">
              <Btn variant="glow" icon href={COPY.primary.href}>{COPY.primary.label}</Btn>
              <Btn variant="outline" href={COPY.secondary.href}>{COPY.secondary.label}</Btn>
            </div>
          </motion.div>

          <ol className="relative flex h-[27.3125rem] w-[24.125rem] flex-col justify-between max-md:h-auto max-md:w-full max-md:gap-8">
            {/* Track: a dim line through the markers that fills with lime as you scroll. */}
            <span aria-hidden="true" className="absolute top-[0.875rem] bottom-[3.75rem] left-[0.96rem] w-[2px] -translate-x-1/2 rounded-full bg-white/[0.08]">
              <motion.span style={{ height: fill }} className="absolute inset-x-0 top-0 rounded-full bg-[linear-gradient(180deg,var(--gx-accent),color-mix(in_srgb,#58f6b1_40%,transparent))] shadow-[0_0_12px_var(--gx-accent)]" />
            </span>
            {STEPS.map((n, i) => {
              const on = i === active;
              return (
                <li key={n} className="relative grid grid-cols-[2rem_1fr] gap-x-[1.4057rem]">
                  <span
                    className={cn(
                      "relative z-[1] grid place-items-center justify-self-center rounded-full bg-[radial-gradient(circle_at_50%_35%,#ffffff,#d7dae0)] text-[1rem] text-[#05070d] transition-[width,height,box-shadow] duration-300",
                      on ? "size-[1.9375rem] shadow-[0_0_18px_color-mix(in_srgb,#58f6b1_60%,transparent)]" : "size-[1.75rem]",
                    )}
                  >
                    {n}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[0.9036rem] text-[var(--gx-accent)]">{COPY.steps[i].eyebrow}</span>
                    <div className={cn("transition-opacity duration-300 max-md:opacity-100", on ? "opacity-100" : "opacity-40")}>
                      <Heading as="h3" size="item" gradient={false} className="mt-[0.375rem]">
                        {COPY.steps[i].title}
                      </Heading>
                      <Body className="mt-[0.375rem] text-[0.8033rem] text-[#a0a0a8]">{COPY.steps[i].body}</Body>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Container>
      </section>
    </div>
  );
}
