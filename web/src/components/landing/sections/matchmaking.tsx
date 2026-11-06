import { Btn, Container, Eyebrow } from "../ui";
import { MATCH } from "../content";
import { AppVideo } from "./app-video";

/**
 * AI matchmaking: the heading, a recording of Discover researching and ranking tools, then
 * the four things that go into a match, as numbered glossy cards.
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

        <ol className="mt-[1.5rem] grid grid-cols-4 gap-[1.25rem] max-lg:grid-cols-2 max-md:grid-cols-1">
          {MATCH.steps.map((step, i) => (
            <li key={step.title} className="wl-gloss flex flex-col rounded-[1rem] bg-[var(--wl-800)] p-[2rem]">
              <span className="wl-aurora-text inline-block self-start text-[2.5rem] leading-none font-semibold tracking-[-0.1rem]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-[1.75rem] text-[1.375rem] leading-[1.75rem] font-semibold tracking-[-0.02rem] text-white">
                {step.title}
              </h3>
              <p className="mt-[0.75rem] text-[1rem] leading-[1.5rem] text-[var(--wl-silver)]">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-[3rem] flex justify-center">
          <Btn href={MATCH.cta.href} variant="mint">
            {MATCH.cta.label}
          </Btn>
        </div>
      </Container>
    </section>
  );
}
