import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * MoniKey button (see DESIGN.md, section F). One filled primary action per screen.
 * - 44px tall everywhere (touch target); icon buttons are 36px for pointer-only row actions.
 * - Disabled stays readable (disabled-bg / disabled-fg, 4.9:1) and says why where it is not obvious.
 * - No press animation, no opacity tricks. Colour transitions only, and only if motion is allowed.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border border-transparent text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 select-none motion-reduce:transition-none disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover",
        ghost: "bg-transparent text-muted-foreground hover:bg-secondary",
        destructive: "bg-destructive text-white hover:bg-[#a8131f]",
        link: "h-auto min-h-11 bg-transparent px-1 text-sm text-primary hover:underline",
      },
      size: {
        default: "h-11 px-[18px]",
        sm: "h-11 px-4 text-sm",
        icon: "size-9 rounded-[10px] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
