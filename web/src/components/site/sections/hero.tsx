"use client";

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useReducedMotionConfig,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  CheckSquare,
  Compass,
  CurrencyCircleDollar,
  GearSix,
  HandPalm,
  House,
  ListChecks,
  Scales,
  SealCheck,
  Timer,
  Wallet,
} from "@phosphor-icons/react";
import { Body, Btn, Heading, MockFrame, Shot } from "../ui";
import { GATEWAY, HERO, STATS } from "../content";
import { cn } from "@/lib/utils";
import { usePhone } from "./top/use-phone";

/**
 * The 400vh opening region, measured on the reference at 1512 x 944:
 *   hero     0–60vh    (holds a clipped 100vh layer: title block + rising dashboard)
 *   stats    60–210vh  (sticky 100vh: left text block, right metrics; centre is the globe)
 *   burst    210–265vh (empty: the globe opens up)
 *   gateway  265–400vh (sticky 100vh: heading + six cards around the stage shape)
 * Wrappers carry data-stage so the particle stage knows which scene to play.
 */
export function HeroSection() {
  return (
    <div className="relative">
      <Hero />
      <Stats />
      <div data-stage="burst" className="h-[55vh]" />
      <Gateway />
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero() {
  const reduce = useReducedMotionConfig();
  const { scrollY } = useScroll();
  // At rest the dashboard peeks in at the bottom. On the reference it is pinned while the
  // page scrolls and drops 160px per 200px scrolled; our layer scrolls with the page, so the
  // drop adds the scroll back in (445 → 806 → 1418px over the first 400px).
  const drop = useTransform(scrollY, [0, 200, 400], [27.86, 50.4, 88.6], { clamp: true });
  const y = useMotionTemplate`${drop}rem`;
  // Fade out as it drops, so it is never cut off mid-screen and never shows up again lower down.
  const fade = useTransform(scrollY, [0, 140, 360], [1, 1, 0], { clamp: true });

  return (
    <section data-stage="hero" className="relative h-[60vh] max-md:h-[100svh]">
      <div className="absolute inset-x-0 top-0 h-screen max-md:h-[100svh]">
        <div className="relative mx-auto flex w-[85.0625rem] flex-col items-center pt-[6.8125rem] text-center max-md:w-[calc(100%-2rem)] max-md:pt-28">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center"
          >
            <Heading as="h1" size="hero" className="mt-[0.8rem]">{HERO.title}</Heading>
            <p className="mt-[0.6rem] text-[1.506rem] leading-[1.1] text-[var(--gx-text)] max-md:text-[1.15rem]">{HERO.subtitle}</p>
            <p className="mt-[0.75rem] w-[27.3rem] text-[0.904rem] leading-[1.4] text-[#a0a0a0] max-md:w-auto max-md:text-[0.95rem]">
              {HERO.body}
            </p>
            <Btn variant="glow" icon href={HERO.cta.href} className="mt-[1.8rem] w-[10.25rem] max-md:w-auto">
              {HERO.cta.label}
            </Btn>
          </motion.div>
        </div>

        <motion.div
          className="pointer-events-none absolute top-[19.19rem] left-1/2 w-[76rem] -translate-x-1/2 max-md:hidden"
          style={reduce ? { y: "27.86rem", opacity: fade } : { y, opacity: fade }}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: "12rem" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <MockFrame className="h-[39.81rem] w-[76rem] bg-black">
              <Shot src={HERO.image.src} alt={HERO.image.alt} priority />
            </MockFrame>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Stats ────────────────────────────────────────────────────────────── */

const METRIC_ICONS = [CurrencyCircleDollar, Timer, HandPalm, SealCheck, ListChecks];
/** Rows follow the globe's curve: the lower rows sit a little further right. */
const METRIC_SHIFT = [0, 0, 0.06, 0.44, 1.31];

function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const reduce = useReducedMotionConfig() || phone;
  // 0 when the block starts entering, 1 when it pins (566px → 1000px on the reference).
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.6", "start start"] });
  const shown = useTransform(scrollYProgress, [0.45, 1], [0, 1], { clamp: true });
  const x = useMotionTemplate`${useTransform(shown, [0, 1], [-3.75, 0])}rem`;

  return (
    <div ref={ref} data-stage="stats" className="relative h-[150vh] max-md:h-auto">
      <div className="sticky top-0 h-screen max-md:static max-md:h-auto max-md:py-24">
        <div className="relative mx-auto h-full w-[85.0625rem] max-md:flex max-md:w-[calc(100%-2rem)] max-md:flex-col max-md:gap-10">
          <motion.div
            style={reduce ? { opacity: 1, x: 0 } : { opacity: shown, x }}
            className="absolute top-1/2 left-0 flex w-[19.69rem] -translate-y-1/2 flex-col items-start max-md:static max-md:w-auto max-md:translate-y-0"
          >
            <Heading size="h2" className="mt-[1.19rem]">
              {STATS.title[0]}
              <br />
              {STATS.title[1]}
            </Heading>
            <p className="mt-[1.06rem] text-[0.904rem] leading-[1.2] text-[#a0a0a0] max-md:text-[0.95rem]">{STATS.body}</p>
            <div className="mt-[1.375rem] flex items-center gap-[0.6rem]">
              <Btn variant="glow" icon href={STATS.primary.href}>{STATS.primary.label}</Btn>
              <Btn variant="dark" href={STATS.secondary.href} className="h-[2.1875rem] px-[1.125rem] text-[0.763rem]">
                {STATS.secondary.label}
              </Btn>
            </div>
          </motion.div>

          <ul className="absolute top-1/2 left-[59.3rem] w-[25.69rem] -translate-y-1/2 max-md:static max-md:w-auto max-md:translate-y-0">
            {METRIC_ICONS.map((Icon, i) => (
              <Metric key={i} i={i} row={STATS.rows[i]} progress={scrollYProgress} reduce={!!reduce}>
                <Icon className="size-[1.2rem] text-[var(--gx-text)] opacity-80" weight="fill" />
              </Metric>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Metric({
  i,
  row,
  progress,
  reduce,
  children,
}: {
  i: number;
  row: { value: string; label: string };
  progress: MotionValue<number>;
  reduce: boolean;
  children: React.ReactNode;
}) {
  const start = 0.2 + i * 0.12;
  const opacity = useTransform(progress, [start, start + 0.3], [0, 1], { clamp: true });
  const x = useMotionTemplate`${useTransform(opacity, [0, 1], [2.5, 0])}rem`;
  return (
    <motion.li
      style={reduce ? { opacity: 1, x: 0, marginLeft: `${METRIC_SHIFT[i]}rem` } : { opacity, x, marginLeft: `${METRIC_SHIFT[i]}rem` }}
      className="flex h-[4.25rem] items-center gap-[0.6rem] max-md:ml-0! max-md:h-14"
    >
      <span className="grid w-[1.4rem] shrink-0 place-items-center">{children}</span>
      <span className="gx-heading ml-[2.4rem] min-w-[7rem] shrink-0 pb-[0.15rem] text-[2.008rem] leading-none whitespace-nowrap max-md:ml-2 max-md:min-w-0 max-md:text-[1.5rem]">
        {row.value}
      </span>
      <span className="ml-[0.55rem] text-[1.506rem] leading-none whitespace-nowrap text-[var(--gx-accent)] max-md:text-[1rem] max-md:whitespace-normal">
        {row.label}
      </span>
    </motion.li>
  );
}

/* ── Gateway ──────────────────────────────────────────────────────────── */

type CardTone = "accent" | "gold" | "violet";
/** Left column top → bottom, then right column. The reference tints one card on each side. */
const CARDS: { side: "l" | "r"; row: number; tone: CardTone; fill: boolean }[] = [
  { side: "l", row: 0, tone: "accent", fill: true },
  { side: "l", row: 1, tone: "accent", fill: false },
  { side: "l", row: 2, tone: "gold", fill: false },
  { side: "r", row: 0, tone: "accent", fill: true },
  { side: "r", row: 1, tone: "violet", fill: false },
  { side: "r", row: 2, tone: "accent", fill: false },
];
const ROW_TOP = ["16.94rem", "28.06rem", "39.125rem"];
const CARD_ICONS = { home: House, wallet: Wallet, settings: GearSix, discover: Compass, compare: Scales, decisions: CheckSquare } as const;

function Gateway() {
  const ref = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const reduce = useReducedMotionConfig() || phone;
  // Cards and heading arrive from ~470px before the pin to ~330px after it
  // (2030px → 2830px; on the reference the first card is 73% in at 2500px).
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.5", "start -0.35"] });

  const hOpacity = useTransform(scrollYProgress, [0.3, 0.62], [0, 1], { clamp: true });
  const hY = useMotionTemplate`${useTransform(hOpacity, [0, 1], [2.5, 0])}rem`;

  return (
    <div ref={ref} id="gateway" data-stage="gateway" className="relative h-[135vh] max-md:h-auto">
      <div className="sticky top-0 h-screen max-md:static max-md:h-auto max-md:py-24">
        <div className="relative mx-auto h-full w-[85.0625rem] max-md:w-[calc(100%-2rem)]">
          <motion.div
            style={reduce ? { opacity: 1, y: 0 } : { opacity: hOpacity, y: hY }}
            className="absolute inset-x-0 top-[8.875rem] flex justify-center max-md:static max-md:mb-8"
          >
            <Heading size="h2" className="max-w-[44rem] text-center">
              {GATEWAY.title[0]}
              <br />
              {GATEWAY.title[1]}
            </Heading>
          </motion.div>
          {CARDS.map((c, i) => (
            <GatewayCard key={i} card={c} index={i} progress={scrollYProgress} reduce={!!reduce} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GatewayCard({
  card,
  index,
  progress,
  reduce,
}: {
  card: (typeof CARDS)[number];
  index: number;
  progress: MotionValue<number>;
  reduce: boolean;
}) {
  const copy = GATEWAY.cards[index];
  const Icon = CARD_ICONS[copy.icon as keyof typeof CARD_ICONS];
  const start = 0.29 + card.row * 0.1 + (card.side === "r" ? 0.03 : 0);
  const opacity = useTransform(progress, [start, start + 0.4], [0, 1], { clamp: true });
  const dir = card.side === "l" ? -1 : 1;
  const x = useMotionTemplate`${useTransform(opacity, [0, 1], [3.75 * dir, 0])}rem`;

  return (
    <motion.article
      data-index={index}
      style={reduce ? { opacity: 1, x: 0, top: ROW_TOP[card.row] } : { opacity, x, top: ROW_TOP[card.row] }}
      className={cn(
        "absolute grid h-[9.875rem] w-[20.875rem] grid-cols-[3.25rem_1fr] gap-x-[2.17rem] overflow-hidden rounded-[1.506rem] pt-[1.558rem] pr-[1.205rem] pb-[1.357rem] pl-[1.51rem] backdrop-blur-[24.5px]",
        card.side === "l" ? "left-[4rem]" : "right-[4.06rem]",
        card.tone === "accent" && "bg-[rgba(28,28,28,0.15)]",
        card.tone === "gold" &&
          "bg-white/[0.02] bg-[radial-gradient(120%_90%_at_50%_130%,color-mix(in_srgb,#58f6b1_26%,transparent),transparent_60%)]",
        card.tone === "violet" &&
          "bg-white/[0.02] bg-[radial-gradient(120%_90%_at_50%_130%,color-mix(in_srgb,#ad96f1_28%,transparent),transparent_60%)]",
        "max-md:relative max-md:inset-auto! max-md:top-auto! max-md:mb-3 max-md:h-auto max-md:w-full max-md:grid-cols-[52px_1fr] max-md:gap-x-4 max-md:p-5",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] border",
          card.tone === "violet"
            ? "border-[color-mix(in_srgb,#ad96f1_30%,#0c0c10)]"
            : "border-[color-mix(in_srgb,#58f6b1_22%,#0c0c10)]",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[3.25rem] shrink-0 place-items-center rounded-[0.683rem] border border-white/[0.08] max-md:size-[52px]",
          card.tone === "violet" ? "bg-[var(--gx-violet-deep-2)] text-[var(--gx-violet)]" : "bg-[var(--gx-deep)] text-[var(--gx-accent)]",
        )}
      >
        <Icon className="size-[45%]" />
      </span>
      <div className="flex min-w-0 flex-col gap-[0.32rem]">
        <Heading as="h3" size="item" gradient={false}>{copy.title}</Heading>
        <Body className="text-[0.803rem] leading-[1.35] text-[#a0a0a0]">{copy.body}</Body>
        <div className="relative mt-[0.4rem]">
          <Btn variant={card.fill ? "tintFill" : "tint"} href={copy.href}>{copy.cta}</Btn>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-[0.9rem] left-[-1rem] h-[1.6rem] w-[9rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,#58f6b1_22%,transparent),transparent)] blur-[4px]"
          />
        </div>
      </div>
    </motion.article>
  );
}
