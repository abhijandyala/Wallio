"use client";

import { useRef } from "react";
import { motion, useReducedMotionConfig, useScroll, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A big statement between sections, as the reference does it: three quarters of a screen
 * tall, the text centred, every line a gradient. As the block crosses 60% of the screen,
 * each line in turn shifts from deep mint into pale mint and aurora. The lines overlap
 * like the reference's stagger: each takes 0.5 of the run and starts 0.3 after the last.
 */
const FROM = ["#128a5e", "#effff8"];
const TO = ["#c9ffe6", "#a8e6de"];

export function Statement({ lines, className }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.6", "end 0.6"] });
  const total = 0.5 + 0.3 * (lines.length - 1);

  return (
    <section className="flex h-[75vh] items-center justify-center max-md:h-[60vh]">
      <div ref={ref} className={cn("wl-display text-center max-md:px-4 max-md:text-[3rem] max-md:tracking-[-0.12rem]", className)}>
        {lines.map((line, i) => (
          <Line key={i} progress={scrollYProgress} start={(0.3 * i) / total} end={(0.3 * i + 0.5) / total} reduce={!!reduce}>
            {line}
          </Line>
        ))}
      </div>
    </section>
  );
}

function Line({
  progress,
  start,
  end,
  reduce,
  children,
}: {
  progress: MotionValue<number>;
  start: number;
  end: number;
  reduce: boolean;
  children: React.ReactNode;
}) {
  const from = useTransform(progress, [start, end], reduce ? [FROM[1], FROM[1]] : FROM);
  const to = useTransform(progress, [start, end], reduce ? [TO[1], TO[1]] : TO);
  return (
    <motion.span className="wl-line" style={{ "--from": from, "--to": to } as React.CSSProperties}>
      {children}
    </motion.span>
  );
}
