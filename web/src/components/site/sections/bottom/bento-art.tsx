import { MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";

/**
 * Line-art illustrations for the bento cards, lime on dark. Our own drawings,
 * sized to sit where the reference's illustrations sit.
 */

const line = "stroke-[color-mix(in_srgb,#58f6b1_35%,transparent)]";

/** Faint circuit lines fanning out from an illustration. */
export function Circuit({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 160" fill="none" className={className} aria-hidden="true">
      <path d="M0 80 H120 L140 60 H170" className={line} strokeWidth="1" />
      <path d="M400 80 H280 L260 60 H230" className={line} strokeWidth="1" />
      <path d="M0 110 H100 L120 130 H160" className={line} strokeWidth="1" opacity="0.6" />
      <path d="M400 110 H300 L280 130 H240" className={line} strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

/** A small device with a coin and a status grid, on a stand (Auto-sync card). */
export function DeviceArt() {
  return (
    <div className="relative flex flex-col items-center">
      <span className="absolute -top-[1.6rem] size-[0.3rem] rounded-full bg-white shadow-[0_0_10px_white]" />
      <div className="relative flex h-[3.4rem] w-[5.4rem] items-center justify-center gap-[0.5rem] rounded-[0.6rem] border border-[color-mix(in_srgb,#58f6b1_45%,transparent)] bg-[color-mix(in_srgb,#58f6b1_10%,#050507)] shadow-[0_0_30px_color-mix(in_srgb,#58f6b1_25%,transparent)]">
        <span className="grid size-[1.6rem] place-items-center rounded-full border border-white/30 bg-white/10"><span className="size-[0.55rem] rounded-full border border-white/60" /></span>
        <span className="grid grid-cols-2 gap-[0.15rem]">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="size-[0.28rem] rounded-[1px] bg-white/35" />
          ))}
        </span>
      </div>
      <div className="h-[2.6rem] w-[2.2rem] border-x border-b border-white/15 bg-[linear-gradient(rgba(255,255,255,0.12),rgba(255,255,255,0.02))]" />
    </div>
  );
}

/** A screen with an "AI" panel and a magnifier (pattern recognition card). */
export function AiPanelArt() {
  return (
    <div className="relative">
      <div className="flex h-[5.2rem] w-[8.6rem] flex-col justify-center gap-[0.35rem] rounded-[0.7rem] border border-[color-mix(in_srgb,#58f6b1_45%,transparent)] bg-[color-mix(in_srgb,#58f6b1_14%,#050507)] px-[0.9rem] shadow-[0_0_40px_color-mix(in_srgb,#58f6b1_25%,transparent)]">
        <span className="size-[1.1rem] self-end rounded-[0.3rem] border-2 border-white/80" />
        <span className="h-[0.18rem] w-[2.2rem] self-end rounded-full bg-white/70" />
        <span className="h-[0.18rem] w-[3.2rem] self-end rounded-full bg-white/30" />
      </div>
      <div className="mx-auto h-[0.4rem] w-[10rem] -translate-x-[0.7rem] rounded-b-[0.4rem] border border-t-0 border-white/20 bg-white/[0.06]" />
      <span className="absolute top-[1.3rem] -left-[2rem] grid size-[2.2rem] place-items-center rounded-full border-2 border-white/60 bg-[color-mix(in_srgb,#58f6b1_20%,#050507)]">
        <Plus weight="bold" className="size-[0.75rem] text-white" />
      </span>
      <MagnifyingGlass className="absolute top-[2.9rem] -left-[2.6rem] size-[1rem] -rotate-12 text-white/50" />
    </div>
  );
}

/** A bar chart with a delta tag and a tick ruler (market replay card). */
export function BarsArt() {
  const bars = [38, 52, 70, 100, 60, 44, 34];
  return (
    <div className="relative flex items-end gap-[0.75rem]">
      <span className="flex h-[6rem] flex-col justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-px w-[0.35rem] bg-white/40" />
        ))}
      </span>
      <div className="relative flex h-[4.6rem] items-end gap-[0.3rem] rounded-[0.6rem] border border-[color-mix(in_srgb,#58f6b1_40%,transparent)] bg-[color-mix(in_srgb,#58f6b1_8%,#050507)] px-[0.55rem] pb-[0.5rem]">
        {bars.map((h, i) => (
          <span
            key={i}
            style={{ height: `${h * 0.032}rem` }}
            className="w-[0.75rem] rounded-[0.15rem] border border-white/45 bg-white/10"
          />
        ))}
        <span className="absolute -bottom-[1.5rem] left-1/2 -translate-x-1/2 rounded-full border border-[color-mix(in_srgb,#58f6b1_50%,transparent)] bg-[color-mix(in_srgb,#58f6b1_14%,#050507)] px-[0.55rem] py-[0.12rem] text-[0.55rem] text-white/80 whitespace-nowrap">
          $60 a year
        </span>
      </div>
    </div>
  );
}

/** Stacked bars on a tray with a "+%" tag (advanced statistics card). */
export function StackArt() {
  return (
    <div className="relative flex items-end gap-[1rem]">
      <span className="flex h-[5rem] flex-col justify-between">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex items-center gap-[0.2rem]">
            <span className="size-[0.25rem] rounded-full bg-white/40" />
            <span className="h-px w-[0.6rem] bg-white/25" />
          </span>
        ))}
      </span>
      <div className="relative">
        <span className="absolute -top-[2.4rem] left-0 rounded-[0.5rem] border border-[color-mix(in_srgb,#58f6b1_50%,transparent)] bg-[color-mix(in_srgb,#58f6b1_14%,#050507)] px-[0.5rem] py-[0.2rem] text-[0.55rem] text-white/85 whitespace-nowrap">
          Unknown
        </span>
        <div className="flex h-[5.6rem] items-end gap-[0.4rem] px-[0.6rem]">
          {[52, 72, 46, 100].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} className="flex w-[1.05rem] flex-col justify-end gap-[2px]">
              <span className="flex-1 rounded-[0.12rem] border border-white/35 bg-white/[0.06]" />
              <span className="h-[30%] rounded-[0.12rem] border border-white/45 bg-[color-mix(in_srgb,#58f6b1_25%,transparent)]" />
            </span>
          ))}
        </div>
        <div className="h-[1.1rem] w-[7.5rem] rounded-b-[0.5rem] border border-[color-mix(in_srgb,#58f6b1_45%,transparent)] bg-[color-mix(in_srgb,#58f6b1_12%,#050507)]" />
      </div>
      <span className="flex h-[5rem] flex-col justify-between">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex items-center gap-[0.2rem]">
            <span className="h-px w-[0.6rem] bg-white/25" />
            <span className="size-[0.25rem] rounded-full bg-white/40" />
          </span>
        ))}
      </span>
    </div>
  );
}
