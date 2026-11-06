"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotionConfig, useScroll, useTransform } from "motion/react";
import { Btn, Eyebrow } from "../ui";
import { HERO, SCROLL_TEXT } from "../content";
import { DigitBall } from "./digit-ball";

/**
 * The opening, as the reference lays it out: centred eyebrow, title, line and button over
 * the liquid ball, which keeps going down past the hero and under the giant text.
 */
export function Hero() {
  return (
    <div className="relative h-[104.56rem] max-md:h-[56rem]">
      <DigitBall className="absolute inset-x-0 top-[12.5rem] h-[100.3rem] max-md:top-[18rem] max-md:h-[44rem]" />
      <section className="pointer-events-none relative z-10 pt-[14.25rem] pb-[5rem] max-md:pt-36">
        <div className="mx-auto flex max-w-[48.75rem] flex-col items-center text-center max-md:px-4">
          <Eyebrow>{HERO.eyebrow}</Eyebrow>
          <h1 className="wl-h1 mt-[1.94rem]">
            {HERO.title[0]}
            <br />
            {HERO.title[1]}
          </h1>
          <p className="wl-body mt-[3rem] max-w-[36.5rem]">{HERO.body}</p>
          <Btn href={HERO.cta.href} className="pointer-events-auto mt-[3rem]">
            {HERO.cta.label}
          </Btn>
        </div>
      </section>
    </div>
  );
}

/**
 * Two giant lines that pass each other as you scroll, as on the reference: the top line
 * enters from the right and leaves to the left, the bottom line the other way round. Both
 * travel from when the section's top reaches 90% of the screen until its bottom leaves the
 * top. Each starts half off one edge and ends half off the other.
 */
export function ScrollText() {
  const ref = useRef<HTMLElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();
  const [size, setSize] = useState({ vw: 1512, a: 1252, b: 1193 });

  useEffect(() => {
    const measure = () =>
      setSize({ vw: window.innerWidth, a: top.current?.offsetWidth ?? 0, b: bottom.current?.offsetWidth ?? 0 });
    measure();
    const ro = new ResizeObserver(measure);
    if (top.current) ro.observe(top.current);
    if (bottom.current) ro.observe(bottom.current);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "end start"] });
  const narrow = size.vw <= 991;
  // Start and end positions, the same formulas the reference uses.
  const aFrom = narrow ? size.vw + size.a * 0.1 : size.vw - size.a / 2;
  const aTo = narrow ? -(size.a + size.vw * 0.1) : -(size.a / 2);
  const bFrom = narrow ? -(size.b + size.vw * 0.1) : -(size.b / 2);
  const bTo = narrow ? size.vw + size.b * 0.1 : size.vw - size.b / 2;
  const x1 = useTransform(scrollYProgress, [0, 1], reduce ? [size.vw / 2 - size.a / 2, size.vw / 2 - size.a / 2] : [aFrom, aTo]);
  const x2 = useTransform(scrollYProgress, [0, 1], reduce ? [size.vw / 2 - size.b / 2, size.vw / 2 - size.b / 2] : [bFrom, bTo]);

  return (
    <section ref={ref} aria-label={SCROLL_TEXT.join(" ")} className="relative z-10 overflow-hidden">
      <div className="relative">
        <motion.div ref={top} style={{ x: x1 }} className="wl-scroll-text will-change-transform" aria-hidden="true">
          {SCROLL_TEXT[0]}
        </motion.div>
      </div>
      <div className="relative">
        <motion.div ref={bottom} style={{ x: x2 }} className="wl-scroll-text will-change-transform" aria-hidden="true">
          {SCROLL_TEXT[1]}
        </motion.div>
      </div>
    </section>
  );
}
