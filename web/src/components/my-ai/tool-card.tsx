import { Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** The empty slot at the end of the wallet. Widens to fill the last row on wide screens. */
export function AddToolCard({
  onAdd,
  span = 1,
}: {
  onAdd: () => void;
  span?: number;
}) {
  const wide = span > 1;
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "flex h-[120px] w-full items-center justify-center gap-4 sm:h-[188px] rounded-[20px] border border-dashed border-line-strong text-text-3 transition-colors duration-200 hover:text-text-1",
        wide ? "xl:justify-start xl:px-8" : "flex-col",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2">
        <Plus size={18} />
      </span>
      <span className={cn("text-[14px]", wide && "xl:text-left")}>
        <span className="block text-text-1">Add a tool</span>
        {wide && (
          <span className="hidden text-[13px] xl:block">
            Anything you pay for: chat apps, coding tools, image or voice AI.
          </span>
        )}
      </span>
    </button>
  );
}
