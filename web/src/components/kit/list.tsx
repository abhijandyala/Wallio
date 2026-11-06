import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/** One-line rows: a title on the left, a short meta on the right. */
export function List({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn("flex flex-col", className)}>{children}</ul>;
}

export function ListItem({
  title,
  meta,
  href,
  highlight = false,
}: {
  title: string;
  meta?: string;
  href: string;
  /** Aurora mark for items that need the user. */
  highlight?: boolean;
}) {
  return (
    <li className="border-t border-line first:border-t-0">
      <Link href={href} className="group flex h-14 items-center gap-3 px-6">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-[1px]",
            highlight ? "bg-aurora" : "bg-text-disabled",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-text-1">{title}</span>
        {meta && (
          <span className="tnum shrink-0 text-[13px] text-text-3">{meta}</span>
        )}
        <CaretRight
          size={14}
          className="shrink-0 text-text-3 transition-colors group-hover:text-text-1"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
