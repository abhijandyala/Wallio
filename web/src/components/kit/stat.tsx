import { cn } from "@/lib/utils";

/** Label above a big value. That's it. */
export function Stat({
  label,
  value,
  tone = "default",
  delta,
  chart,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** "positive" renders the value in lime (savings, money kept). */
  tone?: "default" | "positive";
  /** Short change note shown opposite the label, e.g. "+1 since Oct". */
  delta?: string;
  /** Tiny visual shown opposite the value, e.g. <Sparkbars />. */
  chart?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <dt className="flex items-center justify-between gap-3 text-[13px] text-text-3">
        <span>{label}</span>
        {delta && <span className="text-[12px]">{delta}</span>}
      </dt>
      <dd className="flex items-end justify-between gap-3">
        <span
          className={cn(
            "display text-[30px] leading-[32px] font-medium",
            tone === "positive" ? "text-lime" : "text-text-1",
          )}
        >
          {value}
        </span>
        {chart}
      </dd>
    </div>
  );
}

/** A row of stats separated by hairlines, inside one surface. */
export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-line bg-line md:grid-cols-4 [&>*]:bg-surface-1 [&>*]:px-6 [&>*]:py-5",
        className,
      )}
    >
      {children}
    </dl>
  );
}
