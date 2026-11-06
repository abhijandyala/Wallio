import { LogoMark } from "./logo-mark";
import { cn } from "@/lib/utils";

/** The W mark plus "Wallio" set in Poppins Bold. The brand lockup. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-text-1", className)}
    >
      <LogoMark className="h-[13px] w-auto" />
      <span className="font-brand text-[15px] leading-none font-bold tracking-[-0.01em]">
        Wallio
      </span>
    </span>
  );
}
