import { cn } from "@/lib/utils";

/**
 * A count of things waiting on you: a small lime chip with ink numbers and a soft glow,
 * so it reads as "needs you" at a glance instead of a loose number. Hidden at zero.
 * `tone="ink"` is for sitting on an aurora or lime surface.
 */
export function NotifyBadge({
  count,
  tone = "lime",
  className,
}: {
  count: number;
  tone?: "lime" | "ink";
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "tnum inline-grid h-[18px] min-w-[18px] place-items-center rounded-[6px] px-[5px] text-[11px] leading-none font-semibold",
        tone === "lime"
          ? "bg-lime text-ink shadow-[0_0_0_3px_rgba(88,246,177,0.14),0_0_14px_rgba(88,246,177,0.35)]"
          : "bg-ink text-aurora",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
