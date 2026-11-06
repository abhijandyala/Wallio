import { splitMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** $1,234.56 with dimmed cents. null renders an honest "Unknown", never $0. */
export function Money({
  cents,
  className,
  dropCents = false,
}: {
  cents: number | null;
  className?: string;
  /** For rounded estimates like "$60". */
  dropCents?: boolean;
}) {
  if (cents === null) {
    return <span className={cn("text-text-3", className)}>Unknown</span>;
  }
  const [dollars, frac] = splitMoney(cents);
  return (
    <span className={cn("tnum", className)}>
      {dollars}
      {!dropCents && <span className="opacity-50">{frac}</span>}
    </span>
  );
}
