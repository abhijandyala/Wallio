import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The one container for grouped content.
 * Header is a title and, optionally, one action on the right. No taglines, no descriptions.
 */
export function Panel({
  title,
  titleAddon,
  action,
  variant = "default",
  flush = false,
  className,
  children,
}: {
  title?: string;
  /** Small inline element after the title, e.g. an info tooltip. */
  titleAddon?: React.ReactNode;
  action?: { label: string; href: string };
  /** "accent" = aurora surface with ink text. Use once per screen at most. */
  variant?: "default" | "accent";
  /** Remove body padding (tables, lists that run edge to edge). */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const accent = variant === "accent";
  return (
    <section
      className={cn(
        "flex flex-col rounded-[20px]",
        accent
          ? // The landing page's pale card: pale aurora into cream into mint.
            "bg-aurora bg-[radial-gradient(41288.31%_255.77%_at_-42.4%_-22.13%,#c2f0ec_0%,#fffdfa_44.72%,#effff8_85.38%,#c9ffe6_100%)] text-ink"
          : // A faint mint light from the top, as on the landing page's cards.
            "border border-line bg-surface-1 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(88,246,177,0.055),transparent_65%)]",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 px-6">
          {title && (
            <h2
              className={cn(
                "flex items-center gap-2 text-[15px] font-medium",
                accent ? "text-ink" : "text-text-1",
              )}
            >
              {title}
              {titleAddon}
            </h2>
          )}
          {action && (
            <Link
              href={action.href}
              className={cn(
                "rounded-md text-[13px] transition-colors",
                accent
                  ? "text-ink/70 hover:text-ink"
                  : "text-text-3 hover:text-text-1",
              )}
            >
              {action.label}
            </Link>
          )}
        </header>
      )}
      <div
        className={cn(
          "flex-1",
          !flush && "px-6 pb-6",
          flush && !title && "pt-0",
        )}
      >
        {children}
      </div>
    </section>
  );
}
