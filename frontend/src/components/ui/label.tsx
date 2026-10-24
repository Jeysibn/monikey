import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "cn"

/* Field label: always visible, above the field, 14px / 600. Never replaced by a placeholder. */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-sm leading-snug font-semibold select-none peer-disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export { Label }
