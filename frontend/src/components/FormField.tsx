import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from 'cn'

import { Label } from '@/components/ui/label'

/*
 * One labelled field: label above, the control, a muted helper line, and an error line that is words
 * plus an icon (never colour alone). Give the control `aria-describedby={describedBy(id, error, helper)}`
 * (from lib/describedBy.ts) and `aria-invalid={!!error}` so a screen reader reads the helper and the error with the field.
 */
export function FormField({
  id,
  label,
  error,
  helper,
  children,
  className,
}: {
  id: string
  label: string
  error?: string
  helper?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {helper && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {helper}
        </p>
      )}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  )
}

export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-error-ink">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  )
}
