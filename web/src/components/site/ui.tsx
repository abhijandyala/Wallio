import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Landing page building blocks. Sizes are rem at the reference's 1512px layout
 * (1rem = 16px there, scaling with the viewport). Every piece of copy is a placeholder
 * until we write it: P.
 */
export const P = "(insert here)";

/** Content width: 1361px of 1512 (76px side margins). */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-[85.0625rem] max-md:w-[calc(100%-2rem)]", className)}>{children}</div>;
}

type BtnVariant = "glow" | "ghost" | "dark" | "tint" | "tintFill" | "light" | "outline" | "violetGhost";

const BTN: Record<BtnVariant, string> = {
  /** Bright pill with a lime glow: the main action */
  glow: "gx-glow-btn",
  /** Hairline pill */
  ghost: "border border-[var(--gx-line-strong)] text-[var(--gx-text)] hover:bg-white/[0.04]",
  /** Dark pill fading into deep lime */
  dark: "bg-[linear-gradient(90deg,#212121,color-mix(in_srgb,#58f6b1_28%,#010102))] text-[var(--gx-text)]",
  /** Plain tinted pill (card actions) */
  tint: "bg-[var(--gx-tint)] text-white",
  /** Tint that fades in from the top */
  tintFill: "bg-[linear-gradient(rgba(0,0,0,0)_0%,var(--gx-tint)_100%)] text-white",
  /** Light gradient pill with a solid edge */
  light:
    "border border-[var(--gx-text)] bg-[linear-gradient(88deg,#d1d1d1_30.26%,color-mix(in_srgb,#58f6b1_14%,#ffffff)_61.14%,color-mix(in_srgb,#58f6b1_22%,#ffffff)_71.88%)] text-[#05070d]",
  /** Dark fill with a gradient hairline */
  outline:
    "border border-transparent [background:linear-gradient(#010102,#010102)_padding-box,linear-gradient(90deg,#212121,color-mix(in_srgb,#58f6b1_28%,#010102))_border-box] text-[var(--gx-text)]",
  /** Dark fill with a lavender hairline (the reference's red accent) */
  violetGhost:
    "border border-transparent [background:linear-gradient(var(--gx-violet-deep-2),var(--gx-violet-deep-2))_padding-box,linear-gradient(90deg,#010102_0%,color-mix(in_srgb,#ad96f1_80%,#ffffff)_100%)_border-box] text-[var(--gx-text)]",
};

export function Btn({
  variant = "glow",
  icon = false,
  href = "#",
  wide = false,
  className,
  children = P,
}: {
  variant?: BtnVariant;
  icon?: boolean;
  href?: string;
  wide?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-[2.1875rem] items-center justify-center gap-[0.4rem] rounded-[0.5rem] px-[1.285rem] text-[0.803rem] whitespace-nowrap transition-[filter,background-color] duration-200 hover:brightness-110",
        wide && "w-full",
        BTN[variant],
        className,
      )}
    >
      {icon && <span className="size-[0.55rem] rotate-45 rounded-[1px] border-[1.5px] border-current" aria-hidden="true" />}
      {children}
    </Link>
  );
}

type HeadingSize = "hero" | "h2" | "xl" | "card" | "challenge" | "sub" | "sm" | "item";

const HEADING: Record<HeadingSize, string> = {
  hero: "text-[4.016rem] leading-[1] pb-[0.4rem]", // 64.26px
  h2: "text-[3.012rem] leading-[1]", // 48.195px
  xl: "text-[3.615rem] leading-[1]", // 57.834px
  card: "text-[1.807rem] leading-tight", // 28.917px
  challenge: "text-[2.008rem] leading-tight", // 32.13px
  sub: "text-[1.506rem] leading-tight", // 24.0975px
  sm: "text-[1.104rem] leading-tight", // 17.67px
  item: "text-[1.205rem] leading-tight", // 19.278px
};

export function Heading({
  as: Tag = "h2",
  size = "h2",
  gradient = true,
  className,
  children = P,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  size?: HeadingSize;
  gradient?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Tag
      className={cn(
        HEADING[size],
        gradient ? (size === "sub" ? "gx-heading-sm" : "gx-heading") : "text-[var(--gx-text)]",
        "max-md:text-[2rem]",
        size === "item" && "max-md:text-[1.1rem]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Body copy at the reference's 11.25px, muted. */
export function Body({ className, children = P }: { className?: string; children?: React.ReactNode }) {
  return <p className={cn("text-[0.703rem] leading-[1.55] text-[var(--gx-muted)] max-md:text-[0.85rem]", className)}>{children}</p>;
}

/**
 * Where a product screenshot goes. Same frame, radius and glow edge as the reference,
 * with a quiet UI skeleton inside so the layout reads right until the real image lands.
 */
export function MockFrame({
  className,
  tone = "accent",
  children,
}: {
  className?: string;
  tone?: "accent" | "violet";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "gx-gradient-border relative overflow-hidden rounded-[1.506rem] bg-[#020203]",
        tone === "violet" && "[&::before]:bg-[linear-gradient(180deg,color-mix(in_srgb,#ad96f1_80%,transparent),rgba(255,255,255,0.06)_40%,rgba(255,255,255,0.02))]",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-[10%] -top-[2px] h-[2px] blur-[2px]",
          tone === "violet" ? "bg-[var(--gx-violet)]" : "bg-[var(--gx-accent)]",
        )}
      />
      {children ?? (
        <div className="absolute inset-0 grid grid-cols-[14%_1fr] gap-[1rem] p-[1.2rem]">
          <div className="flex flex-col gap-[0.6rem]">
            <span className="h-[0.8rem] w-3/4 rounded-[0.3rem] bg-white/[0.07]" />
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="h-[0.5rem] w-full rounded-[0.25rem] bg-white/[0.035]" />
            ))}
          </div>
          <div className="flex flex-col gap-[0.9rem]">
            <span className="h-[0.8rem] w-1/3 rounded-[0.3rem] bg-white/[0.07]" />
            <div className="grid flex-1 place-items-center rounded-[0.9rem] border border-white/[0.05] bg-white/[0.015]">
              <span className="text-[0.85rem] text-[var(--gx-dim)]">{P}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A square icon slot (the reference uses product logos here). */
export function IconSlot({ className, tone = "accent" }: { className?: string; tone?: "accent" | "violet" | "neutral" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[0.683rem] border border-white/[0.08]",
        tone === "accent" && "bg-[var(--gx-deep)] text-[var(--gx-accent)]",
        tone === "violet" && "bg-[var(--gx-violet-deep-2)] text-[var(--gx-violet)]",
        tone === "neutral" && "bg-white/[0.04] text-[var(--gx-text)]",
        className,
      )}
    >
      <span className="size-[40%] rounded-[22%] border-[1.5px] border-current opacity-80" />
    </span>
  );
}

/** A real Wallio screen inside a MockFrame: fills the frame, anchored to the top-left. */
export function Shot({
  src,
  alt,
  priority = false,
  zoom,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  /** Crop into part of the screen: scale and the point to zoom toward, e.g. "100% 0%" (top right). */
  zoom?: { scale: number; origin: string };
}) {
  return (
    <div
      className="absolute inset-0"
      style={zoom ? { transform: `scale(${zoom.scale})`, transformOrigin: zoom.origin } : undefined}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={zoom ? "(max-width: 767px) 150vw, 100vw" : "(max-width: 767px) 100vw, 80vw"}
        className="object-cover object-left-top"
      />
    </div>
  );
}
