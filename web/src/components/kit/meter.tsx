/** Thin progress bar. Value is 0..100, computed upstream. */
export function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-[2px] bg-surface-3"
      role="meter"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-[2px] bg-lime"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
