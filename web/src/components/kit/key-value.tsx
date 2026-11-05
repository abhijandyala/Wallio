import { cn } from "@/lib/utils";

/** Label on the left, value on the right, one line per row. For facts and settings. */
export function KeyValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <dl className={cn("flex flex-col", className)}>{children}</dl>;
}

export function KeyValueRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-6 border-t border-line px-6 py-3 first:border-t-0",
        className,
      )}
    >
      <dt className="shrink-0 text-text-3">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-3 text-right text-text-1">
        {children}
      </dd>
    </div>
  );
}
