import Image from "next/image";
import Link from "next/link";
import { Arrow, Btn, Container, Eyebrow } from "../ui";
import { PROOF } from "../content";

/**
 * Proof, in the reference's insights list: rows with a thumbnail, a title, a line and a
 * small caps tag, split by hairlines. Hovering a row fills it with a soft mint gradient and
 * hides the lines around it, so it lifts out as a card.
 */
export function Proof() {
  return (
    <section id="proof" className="scroll-mt-24">
      <Container>
        <div className="wl-gloss rounded-[1rem] bg-[var(--wl-900)] px-[2.5rem] pt-[7.5rem] pb-[7.5rem] max-md:px-3 max-md:py-16">
          <div className="flex flex-col items-center text-center">
            <Eyebrow>{PROOF.eyebrow}</Eyebrow>
            <h2 className="wl-h1 mt-[1.94rem]">{PROOF.title}</h2>
            <p className="wl-body mt-[3rem] max-w-[26.25rem]">{PROOF.body}</p>
          </div>
          <ul className="mt-[5rem]">
            {PROOF.items.map((item) => (
              <li
                key={item.title}
                className="border-b border-[rgba(13,74,53,0.45)] transition-colors duration-200 ease-in-out last:border-b-0 hover:border-transparent has-[+li:hover]:border-transparent"
              >
                <Link href={item.href} className="group relative flex gap-[6.06rem] p-[2.5rem] max-md:flex-col max-md:gap-6 max-md:p-4">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-[0.5rem] bg-[linear-gradient(0deg,var(--wl-750)_0%,var(--wl-700)_100%)] opacity-0 transition-opacity duration-200 ease-in-out group-hover:opacity-100"
                  />
                  <span className="relative h-[10rem] w-[15.625rem] shrink-0 overflow-hidden rounded-[0.375rem] bg-[var(--wl-800)] max-md:w-full">
                    <Image src={item.image.src} alt={item.image.alt} fill sizes="250px" className="object-cover object-[100%_0%]" />
                    <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(20deg,rgba(13,74,53,0.85),rgba(34,176,124,0.25)_60%,rgba(201,255,230,0.12))]" />
                  </span>
                  <div className="relative flex max-w-[28.75rem] flex-col">
                    <h3 className="wl-h3">{item.title}</h3>
                    <p className="wl-body mt-[1.5rem]">{item.body}</p>
                    <p className="mt-[1.5rem] text-[0.813rem] leading-[1.22rem] tracking-[0.045rem] text-[var(--wl-silver)] uppercase">{item.meta}</p>
                  </div>
                  <span className="relative ml-auto grid size-[3.125rem] shrink-0 place-items-center rounded-[0.375rem] bg-white/5 max-md:absolute max-md:top-4 max-md:right-4">
                    <Arrow className="size-[1rem]" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-[5rem] flex justify-center">
            <Btn href={PROOF.cta.href} variant="mint">
              {PROOF.cta.label}
            </Btn>
          </div>
        </div>
      </Container>
    </section>
  );
}
