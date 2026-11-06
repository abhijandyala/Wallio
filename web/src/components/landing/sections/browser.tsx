import { Broom, Fingerprint, HandPalm, Package, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { Btn, Container, Eyebrow } from "../ui";
import { BROWSER } from "../content";
import { AppVideo } from "./app-video";

const ICONS = [Package, ShieldCheck, Fingerprint, HandPalm, Broom];

/**
 * The browser runner: the heading, then a recording of a run beside the five rules it keeps,
 * then the containment test, where Wallio attacks its own browser and every attempt is refused.
 */
export function Browser() {
  const a = BROWSER.attack;
  return (
    <section id="browser" className="mt-[10rem] scroll-mt-24 max-md:mt-24">
      <Container>
        <div className="flex flex-col items-center text-center max-md:px-2">
          <Eyebrow>{BROWSER.eyebrow}</Eyebrow>
          <h2 className="wl-h1 mt-[1.94rem] max-w-[52rem]">{BROWSER.title}</h2>
          <p className="wl-body mt-[2.5rem] max-w-[40rem]">{BROWSER.body}</p>
        </div>

        <div className="mt-[4.5rem] grid grid-cols-[minmax(0,1fr)_25rem] items-start gap-[1.25rem] max-lg:grid-cols-1">
          <AppVideo {...BROWSER.video} />
          <ul className="wl-gloss flex flex-col rounded-[1rem] bg-[var(--wl-800)] px-[2rem] py-[0.75rem]">
            {BROWSER.rules.map((rule, i) => {
              const Icon = ICONS[i];
              return (
                <li key={rule.title} className="flex gap-[1rem] border-t border-[rgba(201,255,230,0.08)] py-[1.25rem] first:border-t-0">
                  <span className="mt-[0.125rem] grid size-[2.25rem] shrink-0 place-items-center rounded-[0.625rem] bg-[rgba(88,246,177,0.1)] text-[var(--wl-300)]">
                    <Icon aria-hidden="true" className="size-[1.125rem]" />
                  </span>
                  <div>
                    <h3 className="text-[1.0625rem] leading-[1.5rem] font-semibold text-white">{rule.title}</h3>
                    <p className="mt-[0.25rem] text-[0.9375rem] leading-[1.375rem] text-[var(--wl-silver)]">{rule.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The containment test, in the globe card's deep-to-bright mint. */}
        <div className="wl-gloss mt-[1.25rem] grid grid-cols-[28rem_minmax(0,1fr)] items-center gap-[3rem] rounded-[1rem] bg-[radial-gradient(60%_80%_at_0%_100%,rgba(88,246,177,0.22),transparent_70%),linear-gradient(90deg,#05271c_0%,#0b3a2a_55%,#0e4a35_100%)] p-[3rem] max-lg:grid-cols-1 max-md:p-5">
          <div>
            <p className="wl-caps text-[var(--wl-mint)]">{a.label}</p>
            <h3 className="mt-[1.25rem] text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.1rem] text-white">{a.title}</h3>
            <p className="wl-body mt-[1.5rem] text-white/85">{a.body}</p>
            <Btn href={a.cta.href} className="mt-[2.25rem]">
              {a.cta.label}
            </Btn>
          </div>
          <AppVideo {...a.video} />
        </div>
      </Container>
    </section>
  );
}
