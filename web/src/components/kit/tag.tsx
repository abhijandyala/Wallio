import type { EvidenceKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type TagKind = EvidenceKind | "inferred";

const KIND: Record<TagKind, { label: string; mark: string; text: string }> = {
  tested: { label: "Tested", mark: "bg-lime", text: "text-lime" },
  researched: {
    label: "Researched",
    mark: "bg-aurora",
    text: "text-aurora",
  },
  user_input: { label: "Your input", mark: "bg-text-2", text: "text-text-2" },
  sample: {
    label: "Sample data",
    mark: "border border-text-3 bg-transparent",
    text: "text-text-3",
  },
  unknown: { label: "Unknown", mark: "bg-text-disabled", text: "text-text-3" },
  inferred: {
    label: "Inferred",
    mark: "border border-aurora bg-transparent",
    text: "text-text-2",
  },
};

/** Evidence label: a small square mark and a word. No pill, no background. */
export function Tag({
  kind,
  children,
  className,
}: {
  kind: TagKind;
  children?: React.ReactNode;
  className?: string;
}) {
  const k = KIND[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] leading-4 whitespace-nowrap",
        k.text,
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-[1px]", k.mark)}
        aria-hidden="true"
      />
      {children ?? k.label}
    </span>
  );
}
