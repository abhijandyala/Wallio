"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { CaretRight } from "@phosphor-icons/react";
import { Heading } from "../ui";
import { LINKS, STACK } from "../content";
import { homeSample } from "@/mocks/home";
import type { Subscription } from "@/lib/types";
import { ToolMark } from "@/components/kit/tool-mark";
import { Money } from "@/components/kit/money";
import { formatShortDate } from "@/lib/format";

/**
 * Centred intro, then the 1212px table with a lime light sitting on its top edge.
 * Six rows from the sample stack: tool, monthly cost, renewal, price status, category.
 */
const SUBS = homeSample.subscriptions;

export function LiquiditySection() {
  const reduce = useReducedMotionConfig();
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-10% 0px" },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="relative pt-[2.44rem] pb-[4.175rem] max-md:pt-16 max-md:pb-16">
      <motion.div {...reveal()} className="mx-auto flex w-[41.19rem] flex-col items-center text-center max-md:w-[calc(100%-2rem)]">
        <Heading size="h2" className="mt-[2.1rem] max-md:mt-5">{STACK.title}</Heading>
        <p className="mt-[1.25rem] text-[0.904rem] leading-[1.2] text-[#a0a0a0] max-md:text-[0.95rem]">{STACK.body}</p>
      </motion.div>

      <motion.div
        {...reveal(0.1)}
        className="relative mx-auto mt-[4rem] w-[75.75rem] max-md:mt-10 max-md:w-[calc(100%-2rem)]"
      >
        {/* Light on the top edge: a wide soft glow and a bright thin line */}
        <motion.span
          aria-hidden="true"
          {...(reduce
            ? {}
            : {
                initial: { scaleX: 0.25, opacity: 0 },
                whileInView: { scaleX: 1, opacity: 0.85 },
                viewport: { once: true, margin: "-15% 0px" },
                transition: { duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] as const },
              })}
          className="pointer-events-none absolute -top-[2.25rem] left-0 z-10 h-[4rem] w-full bg-[radial-gradient(50%_50%,color-mix(in_srgb,#58f6b1_90%,transparent),transparent_70%)] opacity-[0.85] blur-[6px]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-[0.19rem] left-1/2 z-10 h-[0.375rem] w-[60.6rem] -translate-x-1/2 max-md:w-[80%] bg-[radial-gradient(50%_100%,#58f6b1,transparent)]"
        />

        <div className="gx-gradient-border relative overflow-hidden rounded-[1.325rem] bg-[linear-gradient(var(--gx-deep-2),var(--gx-deep-3))] px-[1.607rem] max-md:px-3">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[0.375rem] rounded-[0.924rem] bg-[color-mix(in_srgb,#58f6b1_5%,#08080a)]"
          />
          <div className="relative">
            {SUBS.map((sub, i) => (
              <Row key={sub.id} sub={sub} last={i === SUBS.length - 1} />
            ))}
          </div>
        </div>
      </motion.div>

      <p className="mx-auto mt-[2.5rem] w-[36.8rem] text-center text-[0.703rem] text-[#686868] max-md:w-[calc(100%-2rem)]">{STACK.footnote}</p>
    </section>
  );
}

function Row({ sub, last }: { sub: Subscription; last: boolean }) {
  const known = sub.monthlyCents !== null;
  return (
    <div
      className={
        "grid grid-cols-[25.2rem_10.5rem_12.6rem_10.5rem_10.5rem] items-center gap-[0.803rem] py-[1.125rem] " +
        (last ? "" : "border-b border-white/[0.04] ") +
        "max-md:grid-cols-[1fr_auto] max-md:gap-3 max-md:py-4"
      }
    >
      <div className="flex min-w-0 items-center gap-[0.7rem]">
        <span className="[&>span]:size-[1.94rem] [&>span]:rounded-full">
          <ToolMark name={sub.toolName} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[1.004rem] leading-tight text-[var(--gx-text)]">{sub.toolName}</span>
          <span className="truncate text-[0.6024rem] leading-tight text-[#686868]">{sub.plan} plan</span>
        </span>
      </div>
      <span className="text-[0.904rem] text-[var(--gx-text)] max-md:hidden">
        <Money cents={sub.monthlyCents} />
        {known && <span className="text-[#686868]"> /mo</span>}
      </span>
      <span className="text-[0.904rem] text-[var(--gx-text)] max-md:hidden">
        {sub.renewsOn ? `Renews ${formatShortDate(sub.renewsOn)}` : "No renewal date"}
      </span>
      <span className="max-md:hidden">
        <span className="inline-flex h-[1.75rem] items-center gap-[0.4rem] rounded-[0.5rem] border border-white/[0.07] bg-white/[0.02] px-[0.75rem] text-[0.703rem] text-[var(--gx-text)]">
          <span
            className={
              known
                ? "size-[0.375rem] rounded-full bg-[var(--gx-accent)] shadow-[0_0_0.4rem_var(--gx-accent)]"
                : "size-[0.375rem] rounded-full bg-[#686868]"
            }
          />
          {known ? "Price checked" : "Price unknown"}
        </span>
      </span>
      <a
        href={LINKS.myAi}
        className="flex items-center justify-end gap-[0.2rem] text-[0.703rem] text-[#a0a0a0] transition-colors hover:text-white"
      >
        <span className="bg-[linear-gradient(#ffffff,#686868)] bg-clip-text text-transparent">{sub.category}</span>
        <CaretRight className="size-[0.8rem]" />
      </a>
    </div>
  );
}
