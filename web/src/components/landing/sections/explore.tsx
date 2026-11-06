"use client";

import { useState } from "react";
import Link from "next/link";
import { Arrow, Btn, Container, Eyebrow } from "../ui";
import { EXPLORE } from "../content";
import { cn } from "@/lib/utils";
import { Blobs } from "./blobs";

/**
 * Explore panel, laid out like the reference: on the left a darker half with the title and
 * three items, the hovered one taking a soft fill (it stays on the last one hovered); on
 * the right the gooey dots for that item, held in view while the list scrolls, with the
 * deep button in the top corner.
 */
export function Explore() {
  const [active, setActive] = useState(0);
  return (
    <section id="explore" className="scroll-mt-24">
      <Container>
        <div className="relative flex overflow-hidden rounded-[1rem] bg-[radial-gradient(70%_60%_at_68%_10%,rgba(34,176,124,0.28),transparent_70%),radial-gradient(60%_50%_at_20%_100%,rgba(34,176,124,0.18),transparent_70%),linear-gradient(#04170f,#020c08)] p-[1.75rem] max-md:flex-col max-md:p-3">
          <span aria-hidden="true" className="wl-dots pointer-events-none absolute inset-0 [mask-image:linear-gradient(90deg,transparent_45%,#000_75%)]" />
          <div className="relative flex w-1/2 flex-col rounded-[0.75rem] bg-[rgba(3,20,13,0.5)] px-[1.25rem] py-[2.5rem] max-md:w-full">
            <div className="flex flex-col px-[1.5rem]">
              <Eyebrow>{EXPLORE.eyebrow}</Eyebrow>
              <h2 className="wl-h1 mt-[1.94rem]">{EXPLORE.title}</h2>
            </div>
            <div className="mt-[4rem] flex flex-col">
              {EXPLORE.items.map((item, i) => (
                <Link
                  key={item.title}
                  href={item.href}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className={cn(
                    "group flex flex-col gap-[1.75rem] overflow-hidden rounded-[0.5rem] px-[1.375rem] py-[2rem] transition-colors duration-200 ease-in-out",
                    active === i && "bg-[rgba(12,74,52,0.5)]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="wl-h3">{item.title}</h3>
                    <span className="grid size-[2.5rem] place-items-center rounded-[0.5rem] bg-white/5">
                      <Arrow className="size-[1rem]" />
                    </span>
                  </div>
                  <p className="wl-body max-w-[35.5rem]">{item.body}</p>
                </Link>
              ))}
            </div>
          </div>
          <div className="relative w-1/2 max-md:w-full">
            <div className="absolute top-0 right-0 z-10 pt-[1.25rem] max-md:static max-md:flex max-md:justify-end">
              <Btn href={EXPLORE.cta.href} variant="mint">
                {EXPLORE.cta.label}
              </Btn>
            </div>
            <div className="sticky top-[6rem] aspect-square w-full">
              <Blobs active={active} className="size-full" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
