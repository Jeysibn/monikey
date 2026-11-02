import { FormField } from '@/components/FormField'
import { describedBy } from '@/lib/describedBy'

/*
 * A labelled multi-line answer for the Kakeibo reflections: a native <textarea> styled like Input, with
 * the same label / helper / error wiring as every other field. Optional by default; the count appears only
 * near the limit so it does not nag.
 */
export function NoteField({
  id,
  label,
  value,
  max,
  error,
  helper,
  onChange,
  onBlur,
  rows = 3,
}: {
  id: string
  label: string
  value: string
  max: number
  error?: string
  helper?: string
  onChange: (value: string) => void
  onBlur: () => void
  rows?: number
}) {
  const length = value.trim().length
  const near = length > max * 0.8
  const help = near ? `${length.toLocaleString('en')} of ${max.toLocaleString('en')} characters.${helper ? ` ${helper}` : ''}` : helper
  return (
    <FormField id={id} label={label} error={error} helper={help}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={describedBy(id, error, help)}
        className="min-h-24 w-full min-w-0 resize-y rounded-control border border-input bg-card px-3.5 py-3 text-base leading-snug text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive"
      />
    </FormField>
  )
}
