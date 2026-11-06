import { cn } from "@/lib/utils";

/**
 * A count of things waiting on you: a small lime chip with ink numbers and a soft glow,
 * so it reads as "needs you" at a glance instead of a loose number. Hidden at zero.
 * `tone="ink"` is for sitting on an aurora or lime surface.
 */
export function NotifyBadge({
  count,
  tone = "lime",
  size = "md",
  pulse = false,
  className,
}: {
  count: number;
  tone?: "lime" | "ink";
  size?: "md" | "lg";
  /** A slow breathing glow, for spots the eye might otherwise skip. Off under reduced motion. */
  pulse?: boolean;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "tnum inline-grid place-items-center leading-none font-semibold",
        size === "lg"
          ? "h-[24px] min-w-[24px] rounded-[8px] px-[7px] text-[13px]"
          : "h-[18px] min-w-[18px] rounded-[6px] px-[5px] text-[11px]",
        pulse && "motion-safe:animate-[notify-pulse_2.4s_ease-in-out_infinite]",
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
