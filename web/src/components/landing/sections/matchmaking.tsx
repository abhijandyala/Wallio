import { Btn, Container, Eyebrow } from "../ui";
import { MATCH } from "../content";
import { AppVideo } from "./app-video";

/**
 * AI matchmaking: the heading, a recording of Discover researching and ranking tools, then
 * the four things that go into a match, along a single line.
 */
export function Matchmaking() {
  return (
    <section id="matchmaking" className="mt-[10rem] scroll-mt-24 max-md:mt-24">
      <Container>
        <div className="flex flex-col items-center text-center max-md:px-2">
          <Eyebrow>{MATCH.eyebrow}</Eyebrow>
          <h2 className="wl-h1 mt-[1.94rem] max-w-[52rem]">{MATCH.title}</h2>
          <p className="wl-body mt-[2.5rem] max-w-[40rem]">{MATCH.body}</p>
        </div>

        <AppVideo {...MATCH.video} className="mt-[4.5rem]" />

        {/* The four parts of a match, along one line: a dot per step, no boxes. */}
        <ol className="relative mt-[4.5rem] grid grid-cols-4 gap-x-[3rem] max-lg:grid-cols-2 max-lg:gap-y-[3rem] max-md:grid-cols-1">
          <span
            aria-hidden="true"
            className="absolute top-[0.3rem] right-0 left-0 h-px bg-[linear-gradient(90deg,rgba(88,246,177,0.7),rgba(255,255,255,0.5)_50%,rgba(197,175,255,0.6))] max-lg:hidden"
          />
          {MATCH.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <span aria-hidden="true" className="block size-[0.625rem] rounded-full bg-[var(--wl-300)] shadow-[0_0_0_0.3rem_rgba(88,246,177,0.15),0_0_1rem_rgba(88,246,177,0.6)]" />
              <p className="mt-[1.75rem] text-[0.875rem] leading-none tracking-[0.12rem] text-[var(--wl-silver)]">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-[0.875rem] text-[1.5rem] leading-[1.9rem] font-semibold tracking-[-0.03rem] text-white">{step.title}</h3>
              <p className="mt-[0.75rem] text-[1rem] leading-[1.5rem] text-[var(--wl-silver)]">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-[4rem] flex justify-center">
          <Btn href={MATCH.cta.href} variant="mint">
            {MATCH.cta.label}
          </Btn>
        </div>
      </Container>
    </section>
  );
}
