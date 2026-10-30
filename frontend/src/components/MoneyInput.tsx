import type { Ref } from 'react'
import { cn } from 'cn'

import { Input } from '@/components/ui/input'

/* A peso amount field: a "₱" before the text, a decimal keypad on phones, text kept exactly as typed. */
export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  inputRef,
  large = false,
  allowNegative = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  invalid: boolean
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
  large?: boolean // the big Amount field of Quick Add
  allowNegative?: boolean // text keyboards expose a minus sign for balance corrections
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted-foreground',
          large ? 'text-xl' : 'text-base',
        )}
      >
        ₱
      </span>
      <Input
        id={id}
        ref={inputRef}
        inputMode={allowNegative ? 'text' : 'decimal'}
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={large ? 'h-14 pl-9 text-2xl font-semibold' : 'pl-9'}
      />
    </div>
  )
}
