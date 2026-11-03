import { Check, ChevronDown } from 'lucide-react'
import { cn } from 'cn'

import { FieldError } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { ENVELOPES, ENVELOPE_INFO, envelopeLabel } from '@/lib/kakeibo'
import type { KakeiboEnvelope } from '@/types'

/*
 * Quick Add's one Kakeibo control (ADR-021): which envelope an expense belongs to, or "Not sure yet".
 * Native radio inputs styled as chips, like the category chips above it (arrow keys move, Tab leaves).
 * The category's default envelope is only a suggestion: when it differs from the choice, a one-line hint
 * offers it with a button, and nothing changes until the person presses that button.
 * "Pause before buying?" is an optional, closed-by-default disclosure of three questions to think about. It
 * never blocks saving and nothing typed or chosen there is stored.
 */
const PAUSE_QUESTIONS = [
  'Is this something I need, or something I want?',
  'Does it fit what matters to me this month?',
  'Could I wait a few days before buying it?',
]
const OPTIONS: { value: KakeiboEnvelope | null; label: string }[] = [
  ...ENVELOPES.map((envelope) => ({ value: envelope, label: ENVELOPE_INFO[envelope].label })),
  { value: null, label: 'Not sure yet' },
]

export function EnvelopePicker({
  value,
  suggestion,
  categoryName,
  onChange,
  onBlur,
  error,
}: {
  value: KakeiboEnvelope | null
  suggestion: KakeiboEnvelope | null // the category's default, if it has one
  categoryName: string | null
  onChange: (envelope: KakeiboEnvelope | null) => void
  onBlur: () => void
  error?: string // a field the server refused
}) {
  const offer = suggestion !== null && suggestion !== value
  const helper = value === null
    ? 'Not sure? Leave it. It still counts in your total expenses.'
    : `${ENVELOPE_INFO[value].meaning}. Shown on your Kakeibo plan.`

  return (
    <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0" aria-describedby={error ? 'qa-envelope-help qa-envelope-error' : 'qa-envelope-help'}>
      <legend className="mb-1.5 text-sm leading-snug font-semibold">Kakeibo envelope</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option, i) => {
          const checked = value === option.value
          return (
            <label key={option.label} className="relative block">
              <input
                id={`qa-envelope-${i}`}
                type="radio"
                name="qa-envelope"
                value={option.value ?? ''}
                checked={checked}
                onChange={() => onChange(option.value)}
                onBlur={onBlur}
                aria-invalid={error ? true : undefined}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-card px-4 text-[0.9375rem] font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed',
                  option.value === null && !checked && 'border-dashed',
                  checked && 'border-primary bg-primary-soft font-semibold text-primary-ink',
                )}
              >
                {checked && <Check aria-hidden="true" className="size-4" />}
                {option.label}
              </span>
            </label>
          )
        })}
      </div>
      <p id="qa-envelope-help" className="text-sm text-muted-foreground">
        {helper}
      </p>
      {error && <FieldError id="qa-envelope-error" message={error} />}
      <details className="group rounded-control text-sm text-muted-foreground">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 font-semibold text-primary [&::-webkit-details-marker]:hidden">
          Pause before buying?
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <ul className="mb-1 grid list-disc gap-1 pl-5">
          {PAUSE_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
        </ul>
        <p>Just something to think about. Nothing here is saved.</p>
      </details>
      {offer && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>
            {categoryName ? `${categoryName} is usually` : 'Suggested:'} {envelopeLabel(suggestion)}.
          </span>
          <Button type="button" variant="link" className="min-h-11 px-0 font-semibold" onClick={() => onChange(suggestion)}>
            Use {envelopeLabel(suggestion)}
          </Button>
        </p>
      )}
    </fieldset>
  )
}
