import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { DecisionCard } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { ButtonLink } from "@/components/kit/button-link";
import { Button } from "@/components/ui/button";

/** The single most important thing on Home. Lavender surface, a title, one sentence, actions. */
export function DecisionHero({ decision }: { decision: DecisionCard | null }) {
  if (!decision) {
    return (
      <Panel variant="accent" className="justify-center">
        <div className="flex h-full flex-col justify-between gap-10 p-2 pt-8">
          <div>
            <h2 className="display max-w-[22ch] text-[32px] leading-[38px] font-medium">
              Nothing needs a decision right now.
            </h2>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-[24px] text-ink/70">
              Try a comparison on a sample task to see how Wallio tests tools.
            </p>
          </div>
          <ButtonLink
            href="/compare"
            variant="inverse"
            size="lg"
            className="self-start"
          >
            Run a sample comparison <ArrowRight size={16} />
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  return (
    <Panel variant="accent">
      <div className="flex h-full flex-col justify-between gap-10 p-2 pt-8">
        <div>
          <h2 className="display max-w-[22ch] text-[32px] leading-[38px] font-medium">
            {decision.title}
          </h2>
          <p className="mt-3 max-w-[52ch] text-[16px] leading-[24px] text-ink/70">
            {decision.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/compare" variant="inverse" size="lg">
            {decision.primaryCta} <ArrowRight size={16} />
          </ButtonLink>
          <Button variant="inverse-ghost" size="lg">
            {decision.secondaryCta}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
