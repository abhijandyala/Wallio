/** Skeleton for My AI while inventory and profile load. Same grid as the page, no spinners. */
export default function Loading() {
  const block = "animate-pulse rounded-[20px] border border-line bg-surface-1";
  return (
    <div className="flex flex-col gap-section" aria-busy="true" aria-label="Loading My AI">
      <div className="flex flex-col gap-2">
        <span className="h-[34px] w-32 animate-pulse rounded-[8px] bg-surface-2" />
        <span className="h-5 w-72 animate-pulse rounded-[6px] bg-surface-1" />
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${block} h-[148px] sm:h-[188px]`} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-gutter">
        <div className={`${block} col-span-12 h-64 xl:col-span-4`} />
        <div className={`${block} col-span-12 h-64 xl:col-span-8`} />
      </div>
    </div>
  );
}
