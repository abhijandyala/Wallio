"use client";

import { useEffect, useRef } from "react";
import { ArrowsLeftRight, CheckCircle, Wallet } from "@phosphor-icons/react";
import { Container, Eyebrow } from "../ui";
import { STEPS } from "../content";

const ICONS = { wallet: Wallet, compare: ArrowsLeftRight, decide: CheckCircle } as const;

/**
 * How it works, in the reference's partners panel: three columns split by thin lines, each
 * filling with a soft mint gradient on hover (the lines beside it fade so the fill reads as
 * one card), then a strip of names drifting left at 75px a second.
 */
export function Steps() {
  return (
    <section id="steps" className="scroll-mt-24">
      <Container>
        <div className="wl-gloss rounded-[1rem] bg-[var(--wl-900)] px-[2.5rem] pt-[7.5rem] pb-[5rem] max-md:px-3 max-md:pt-16">
          <div className="flex flex-col items-center text-center">
            <Eyebrow>{STEPS.eyebrow}</Eyebrow>
            <h2 className="wl-h1 mt-[1.94rem] max-w-[40rem]">{STEPS.title}</h2>
          </div>
          <ul className="group/cards mt-[4.375rem] grid grid-cols-3 max-md:grid-cols-1">
            {STEPS.steps.map((step) => {
              const Icon = ICONS[step.icon as keyof typeof ICONS];
              return (
                <li
                  key={step.label[0]}
                  className="group/card relative flex min-h-[29.44rem] flex-col px-[2.25rem] py-[3rem] after:absolute after:top-1/2 after:right-0 after:h-[calc(100%-6rem)] after:w-px after:-translate-y-1/2 after:bg-[var(--wl-700)] after:transition-opacity after:duration-200 last:after:hidden hover:after:opacity-0 has-[+li:hover]:after:opacity-0 max-md:after:hidden"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[0.5rem] bg-[linear-gradient(0deg,var(--wl-750)_0%,var(--wl-700)_100%)] opacity-0 transition-opacity duration-200 ease-in-out group-hover/card:opacity-100"
                  />
                  <p className="relative max-w-[22.2rem] text-[1.5rem] leading-[1.95rem] tracking-[-0.02rem] text-[#f2f2f2]">{step.body}</p>
                  <div className="relative mt-auto pt-10">
                    <p className="wl-caps font-normal text-[var(--wl-silver)]">
                      {step.label[0]}
                      <br />
                      {step.label[1]}
                    </p>
                    <Icon aria-hidden="true" weight="regular" className="mt-[1.75rem] size-[1.9rem] text-white" />
                  </div>
                </li>
              );
            })}
          </ul>
          <Marquee />
        </div>
      </Container>
    </section>
  );
}

function Marquee() {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const l = list.current;
    if (!el || !l) return;
    // One copy's width at 75px a second, as the reference times it.
    const time = () => l.style.setProperty("--wl-marquee-time", `${l.scrollWidth / 2 / 75}s`);
    time();
    document.fonts?.ready.then(time);
    const io = new IntersectionObserver(([e]) => {
      l.style.animationPlayState = e.isIntersecting ? "running" : "paused";
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const names = [...STEPS.tools, ...STEPS.tools];
  return (
    <div className="mt-[4rem]">
      <p className="sr-only">{STEPS.marqueeLabel}: {STEPS.tools.join(", ")}</p>
      <div
        ref={box}
        aria-hidden="true"
        className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_4.7rem,#000_calc(100%-4.7rem),transparent)]"
      >
        <div ref={list} className="wl-marquee flex w-max items-center">
          {names.map((n, i) => (
            <span key={i} className="mr-[4.375rem] text-[1.75rem] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-white/85">
              {n}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-[1.5rem] text-center text-[0.75rem] tracking-[0.09rem] text-[var(--wl-silver)] uppercase">{STEPS.marqueeLabel}</p>
    </div>
  );
}
