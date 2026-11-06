import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// The only button system in Wallio. Radius 8, never pills. See docs/DESIGN.md.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-[14px] font-medium whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** The pale gradient. At most one per screen: the next action. */
        primary: "w-btn-primary",
        /** Quiet bordered button for secondary choices. */
        secondary:
          "border border-line-strong bg-surface-2 text-text-1 hover:bg-surface-3",
        /** Text-only. */
        ghost: "text-text-2 hover:text-text-1",
        /** Black button used on aurora surfaces. */
        inverse: "bg-ink text-text-1 hover:bg-ink/85",
        /** Text-only on aurora surfaces. */
        "inverse-ghost": "text-ink/70 hover:text-ink",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
