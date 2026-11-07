/** Loading: the Decisions grid in placeholder shapes, so nothing jumps when it fills in. */
export function DecisionsSkeleton() {
  const block = "rounded-[20px] border border-line bg-surface-1";
  return (
    <div className="flex flex-col gap-section" aria-busy="true" aria-label="Loading your decisions">
      <div className="flex flex-col gap-2">
        <span className="h-[34px] w-40 animate-pulse rounded-[8px] bg-surface-2" />
        <span className="h-5 w-80 animate-pulse rounded-[6px] bg-surface-1" />
      </div>
      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 flex flex-col gap-gutter xl:col-span-4">
          <div className={`${block} h-[180px]`} />
          <div className={`${block} h-[260px]`} />
        </div>
        <div className={`${block} col-span-12 flex flex-col xl:col-span-8`}>
          <span className="mx-6 mt-6 h-4 w-40 animate-pulse rounded-[6px] bg-surface-2" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-t border-line px-6 py-5 first-of-type:mt-6">
              <span className="size-9 shrink-0 animate-pulse rounded-[10px] bg-surface-2" />
              <span className="h-4 flex-1 animate-pulse rounded-[6px] bg-surface-2" style={{ maxWidth: `${70 - i * 10}%` }} />
              <span className="h-8 w-24 animate-pulse rounded-[8px] bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
