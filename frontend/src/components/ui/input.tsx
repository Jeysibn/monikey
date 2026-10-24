import * as React from "react"
import { cn } from "cn"

/*
 * MoniKey input: 48px tall, 16px text (stops iOS zooming on focus), radius 12.
 * The border is `input` (#858B92) so the field edge meets the 3:1 contrast rule.
 * Invalid state uses border + ring in the error colour; the message beside it carries the words.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-control border border-input bg-card px-3.5 text-base text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
