"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import { ChatCircle, ArrowsOut, Columns, DotsThree, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Heading, MockFrame } from "../ui";
import { VULTR } from "../content";

const C = VULTR.chat;
import { OrbCanvas } from "./bottom/orb-canvas";

/** AI section: lavender orb, centred heading and a chat mockup rising from below. */
export function AiCoachSection() {
  const reduce = useReducedMotionConfig();
  const rise = reduce
    ? {}
    : { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.25 }, transition: { duration: 1, ease: [0.25, 0.1, 0.25, 1] as const } };

  return (
    <section id="vultr" className="relative mt-[2.4rem] h-[59.625rem] scroll-mt-10 max-md:h-auto max-md:pb-16">
      {/* Orb area */}
      <motion.div
        {...(reduce
          ? {}
          : {
              initial: { opacity: 0 },
              whileInView: { opacity: 1 },
              viewport: { once: true, amount: 0.15 },
              transition: { duration: 1.2, ease: [0.25, 0.1, 0.25, 1] as const },
            })}
        className="relative h-[18.875rem]"
      >
        {/* The light: a wide bloom that fills the section, a brighter middle, and a hot core behind the glass. */}
        <div className="pointer-events-none absolute top-[-17rem] left-1/2 h-[52rem] w-[84rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,#ad96f1_26%,transparent),color-mix(in_srgb,#ad96f1_8%,transparent)_60%,transparent)] blur-[30px] max-md:w-[200%]" />
        <div className="pointer-events-none absolute top-[-6rem] left-1/2 h-[30rem] w-[42rem] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,#ad96f1_42%,transparent),transparent)] blur-[30px] max-md:w-full" />
        <div className="pointer-events-none absolute top-[3.6rem] left-1/2 h-[12rem] w-[20rem] -translate-x-1/2 rounded-[50%] bg-[var(--gx-violet)] opacity-55 blur-[60px]" />
        <OrbCanvas className="absolute top-[-3.44rem] left-1/2 size-[25.69rem] -translate-x-1/2 max-md:size-[18rem]" />
      </motion.div>

      <motion.div {...rise} className="relative mx-auto -mt-[0.375rem] flex w-[43rem] flex-col items-center text-center max-md:w-[calc(100%-2rem)]">
        <Heading className="mt-[1rem]">{VULTR.title}</Heading>
        <p className="mt-[1rem] text-[0.8033rem] leading-[1.6] text-[var(--gx-muted)]">
          {VULTR.body[0]}
          <br />
          {VULTR.body[1]}
        </p>
      </motion.div>

      <motion.div {...rise} className="relative mx-auto mt-[2.8rem] h-[28.125rem] w-[56.1875rem] max-md:h-[22rem] max-md:w-[calc(100%-2rem)]">
        <div className="pointer-events-none absolute -inset-x-[0.625rem] -top-[0.625rem] bottom-0 rounded-t-[2.008rem] bg-[linear-gradient(color-mix(in_srgb,#ad96f1_25%,transparent),rgba(0,0,0,0))]" />
        <div className="pointer-events-none absolute -inset-x-[0.625rem] -top-[1.05rem] h-[2.44rem] bg-[radial-gradient(closest-side,var(--gx-violet),transparent)] opacity-80 blur-[6px]" />
        <div className="absolute inset-0">
          <MockFrame tone="violet" className="size-full rounded-t-[1.6065rem] rounded-b-none bg-[color-mix(in_srgb,#ad96f1_4%,#060608)] [mask-image:linear-gradient(#000_62%,transparent)]">
            <ChatMock />
          </MockFrame>
        </div>
      </motion.div>
    </section>
  );
}

function ChatMock() {
  return (
    <div className="absolute inset-0 flex flex-col text-[0.66rem] text-[var(--gx-muted)]">
      <div className="flex h-[2.6875rem] shrink-0 items-center justify-between border-b border-white/[0.06] px-[0.875rem]">
        <span className="flex items-center gap-[0.5rem] text-[var(--gx-text)]">
          <ChatCircle className="size-[0.85rem]" />
          {C.title}
          <span className="rounded-[0.3rem] border border-[color-mix(in_srgb,#ad96f1_35%,transparent)] px-[0.3rem] font-mono text-[0.55rem] text-[var(--gx-violet)]">{C.tag}</span>
        </span>
        <span className="flex items-center gap-[0.4rem]">
          <span className="rounded-[0.4rem] border border-[color-mix(in_srgb,#ad96f1_35%,transparent)] bg-[color-mix(in_srgb,#ad96f1_10%,transparent)] px-[0.45rem] py-[0.15rem] text-[0.6rem] text-[var(--gx-violet)]">Vultr</span>
          {[Columns, ArrowsOut, DotsThree].map((I, i) => (
            <span key={i} className="grid size-[1.375rem] place-items-center rounded-[0.32rem] text-white/40">
              <I className="size-[0.75rem]" />
            </span>
          ))}
        </span>
      </div>
      <div className="grid flex-1 grid-cols-[12.875rem_1fr] max-md:grid-cols-[9rem_1fr]">
        <div className="flex flex-col gap-[0.6rem] border-r border-white/[0.06] p-[0.75rem]">
          <span className="flex h-[1.9rem] items-center gap-[0.4rem] rounded-[0.45rem] bg-[var(--gx-violet)] px-[0.6rem] text-[0.72rem] text-[#0b0714]">
            <Plus weight="bold" className="size-[0.7rem]" />
            {C.newChat}
          </span>
          <span className="flex h-[1.6rem] items-center gap-[0.4rem] rounded-[0.4rem] bg-white/[0.04] px-[0.5rem] text-white/30">
            <MagnifyingGlass className="size-[0.65rem]" />
            {C.search}
          </span>
          <span className="flex gap-[0.6rem] overflow-hidden border-b border-white/[0.06] pb-[0.35rem] text-[0.56rem] whitespace-nowrap">
            <span className="border-b border-[var(--gx-violet)] pb-[0.3rem] text-[var(--gx-text)]">{C.tabs[0]}</span>
            <span>{C.tabs[1]}</span>
            <span>{C.tabs[2]}</span>
          </span>
          <span className="flex items-center gap-[0.4rem] text-white/40">
            <ChatCircle className="size-[0.65rem]" />
            {C.history}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center gap-[0.55rem] pb-[3rem]">
          <span className="grid size-[1.75rem] place-items-center rounded-full border border-[color-mix(in_srgb,#ad96f1_50%,transparent)] bg-[color-mix(in_srgb,#ad96f1_10%,transparent)] text-[var(--gx-violet)]">
            <ChatCircle className="size-[0.85rem]" />
          </span>
          <span className="text-[0.8rem] text-[var(--gx-text)] opacity-80">{C.empty}</span>
          <span className="text-[0.62rem] text-white/30">{C.hint}</span>
          <span className="mt-[0.3rem] flex flex-wrap justify-center gap-[0.4rem] px-[1rem]">
            {C.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-[0.5rem] border-[0.5px] border-[color-mix(in_srgb,#ad96f1_25%,transparent)] bg-[color-mix(in_srgb,#ad96f1_8%,transparent)] px-[0.64rem] py-[0.28rem] text-[0.66rem] text-[var(--gx-violet)]"
              >
                {chip}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
