import { cn } from "@/lib/utils";

// Plain table primitives. One line per row, hairline dividers, numbers right-aligned.

export function Table({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn("w-full min-w-[520px] text-left", className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  className,
  align = "left",
  children,
}: {
  className?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-10 border-y border-line px-4 text-[13px] font-normal text-text-3 first:pl-6 last:pr-6",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tr({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <tr className={cn("border-b border-line last:border-b-0", className)}>
      {children}
    </tr>
  );
}

export function Td({
  className,
  align = "left",
  children,
}: {
  className?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <td
      className={cn(
        "h-14 px-4 whitespace-nowrap first:pl-6 last:pr-6",
        align === "right" && "tnum text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}
