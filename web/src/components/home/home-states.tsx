import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Panel } from "@/components/kit/panel";
import { ButtonLink } from "@/components/kit/button-link";
import { Skeleton } from "@/components/ui/skeleton";
import { hatch } from "@/components/kit/charts";

/** Loading: placeholder shapes at the exact size of each Home panel, so nothing jumps. */
export function HomeSkeleton() {
  const block = "rounded-[20px] bg-surface-1 border border-line";
  return (
    <div
      className="flex flex-col gap-section"
      aria-busy="true"
      aria-label="Loading your dashboard"
    >
      <div>
        <Skeleton className="h-12 w-80 rounded-[10px] bg-surface-2" />
        <Skeleton className="mt-3 h-4 w-48 rounded-[6px] bg-surface-2" />
      </div>
      <div className="grid grid-cols-12 gap-gutter">
        <div className={`col-span-12 h-[232px] xl:col-span-4 ${block}`} />
        <div
          className={`col-span-12 h-[232px] xl:col-span-8 ${block} animate-pulse`}
        />
        <div className={`col-span-12 h-[104px] ${block}`} />
        <div className={`col-span-12 h-[480px] xl:col-span-4 ${block}`} />
        <div
          className={`col-span-12 h-[480px] xl:col-span-8 ${block} animate-pulse`}
        />
      </div>
    </div>
  );
}

/** First visit, no tools yet. Shows what Home will look like, clearly marked as an example. */
export function HomeEmpty({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-section">
      <h1 className="display text-[40px] leading-[44px] font-medium text-text-1 sm:text-[52px] sm:leading-[56px]">
        Welcome, {name}
      </h1>
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 grid xl:col-span-8">
          <Panel variant="accent">
            <div className="flex h-full flex-col justify-between gap-10 p-2 pt-8">
              <div>
                <h2 className="display max-w-[22ch] text-[32px] leading-[38px] font-medium">
                  Add the AI tools you pay for.
                </h2>
                <p className="mt-3 max-w-[52ch] text-[16px] leading-[24px] text-ink/70">
                  Takes about two minutes. Wallio then shows what you spend and
                  what is worth testing.
                </p>
              </div>
              <ButtonLink
                href="/my-ai"
                variant="inverse"
                size="lg"
                className="self-start"
              >
                Add your first tool <ArrowRight size={16} />
              </ButtonLink>
            </div>
          </Panel>
        </div>
        <div className="col-span-12 xl:col-span-4">
          <Panel title="Your spend will show here" className="h-full">
            <div className="flex h-40 items-end gap-2.5" aria-hidden="true">
              {[30, 45, 40, 60, 55, 75].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-[10px]"
                  style={{
                    height: `${h}%`,
                    background: hatch("rgba(255,255,255,0.10)"),
                  }}
                />
              ))}
            </div>
            <p className="mt-4 text-[12px] text-text-3">Example</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
