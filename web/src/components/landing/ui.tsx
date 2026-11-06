import Link from "next/link";
import { cn } from "@/lib/utils";

/** The reference's arrow: a corner with a diagonal, 14 x 14. Two stack so hover can swap them. */
function ArrowGlyph() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M12.0641 1.14239L0.499023 12.7061M1.96732 0.706055H11.5399C12.0699 0.706055 12.499 1.13519 12.499 1.66657V11.2378"
        stroke="currentColor"
        strokeWidth="1.41181"
      />
    </svg>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <span className={cn("wl-arrow", className)} aria-hidden="true">
      <ArrowGlyph />
      <ArrowGlyph />
    </span>
  );
}

const external = (href: string) => href.startsWith("http");

/** Button. `light` is the pale mint-to-lavender one, `mint` the deep one that brightens on hover. */
export function Btn({
  href,
  variant = "light",
  className,
  children,
}: {
  href: string;
  variant?: "light" | "mint";
  className?: string;
  children: React.ReactNode;
}) {
  const ext = external(href);
  return (
    <Link
      href={href}
      {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn("wl-btn", variant === "light" ? "wl-btn-light" : "wl-btn-mint", className)}
    >
      <span>{children}</span>
      <Arrow />
    </Link>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("wl-eyebrow", className)}>{children}</div>;
}

/** The reference's content width: 1360 of 1512. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-[85rem] max-md:w-[calc(100%-2rem)]", className)}>{children}</div>;
}
