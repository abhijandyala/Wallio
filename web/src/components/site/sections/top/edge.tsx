/**
 * A 1px edge that follows the parent's radius and fades from top to bottom.
 * Mask set with both the prefixed and standard properties so every engine cuts the middle out.
 */
const MASK = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";

export function Edge({ from, to = "transparent", stop = "60%" }: { from: string; to?: string; stop?: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        padding: 1,
        background: `linear-gradient(${from}, ${to} ${stop})`,
        WebkitMask: MASK,
        WebkitMaskComposite: "xor",
        mask: MASK,
        maskComposite: "exclude",
      }}
    />
  );
}
