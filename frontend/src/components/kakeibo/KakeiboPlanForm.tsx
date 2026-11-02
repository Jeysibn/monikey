import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { LoaderCircle } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { MoneyInput } from '@/components/MoneyInput'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SLOW_SAVE_MS, SLOW_SAVE_TEXT, WriteError } from '@/lib/apiErrors'
import { describedBy } from '@/lib/describedBy'
import { monthLabel } from '@/lib/finance'
import { ENVELOPES, ENVELOPE_INFO, LIMIT_FIELD, MAX_INTENTION, planEstimate, validatePlan, type PlanField } from '@/lib/kakeibo'
import { formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { KakeiboPlanValues } from '@/types'

/*
 * The monthly plan form (ADR-021), with the same habits as Quick Add: errors show when an edited field is
 * left and for every field on submit; a failed submit lists what to fix and moves focus there; while saving
 * every field is disabled and Save can't be pressed twice; a failed save keeps everything typed.
 * Zero is a valid amount everywhere. The plan does not have to balance: when the limits are more than is
 * available, a warning says so and the numbers are left exactly as typed.
 * The "Planning check" is a display-only estimate (like Quick Add's previews); the saved totals are the server's.
 */
const FIELD_ID: Record<PlanField, string> = {
  plannedIncome: 'kp-income',
  allocatedStartingFunds: 'kp-starting',
  savingsTarget: 'kp-savings',
  priorPeriodDebtReserve: 'kp-debt',
  needsLimit: 'kp-needs',
  wantsLimit: 'kp-wants',
  cultureLimit: 'kp-culture',
  unexpectedLimit: 'kp-unexpected',
  monthlyIntention: 'kp-intention',
}
const FIELD_ORDER = Object.keys(FIELD_ID) as PlanField[]
const LABEL: Record<PlanField, string> = {
  plannedIncome: 'Planned income',
  allocatedStartingFunds: 'Starting funds',
  savingsTarget: 'Savings target',
  priorPeriodDebtReserve: 'Debt reserve',
  needsLimit: 'Needs',
  wantsLimit: 'Wants',
  cultureLimit: 'Culture',
  unexpectedLimit: 'Unexpected',
  monthlyIntention: 'Monthly intention (optional)',
}
const HELP: Partial<Record<PlanField, string>> = {
  plannedIncome: 'What you expect to take home this month. Your recorded income is shown separately.',
  allocatedStartingFunds: 'Money you already have and choose to use this month. 0 if none.',
  savingsTarget: 'Set aside first. This is a goal, not money already saved.',
  priorPeriodDebtReserve: "For card balances from earlier months. This month's card purchases already count in the envelopes.",
  monthlyIntention: 'One short sentence to guide the month.',
}
const FAILED_PLAN = "Couldn't save. Check your connection and try again. Your plan is still here."

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <legend className="mb-3 text-[0.9375rem] font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

export function KakeiboPlanForm({
  month,
  mode,
  initial,
  firstRef,
  onDirty,
  onSavingChange,
  onSubmit,
  onCancel,
}: {
  month: string
  mode: 'create' | 'edit'
  initial: KakeiboPlanValues
  firstRef: RefObject<HTMLInputElement | null>
  onDirty: () => void
  onSavingChange: (saving: boolean) => void
  onSubmit: (values: KakeiboPlanValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Set<PlanField>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverField, setServerField] = useState<PlanField | null>(null)
  const slow = useDelayedFlag(saving, SLOW_SAVE_MS)
  const summaryRef = useRef<HTMLDivElement>(null)
  const edited = useRef<Set<PlanField>>(new Set())

  const errors = validatePlan(values)
  const failing = FIELD_ORDER.filter((field) => errors[field])
  const shown = (field: PlanField) =>
    (submitted || touched.has(field) ? errors[field] : undefined) ?? (serverField === field ? 'Check this field.' : undefined)
  const estimate = planEstimate(values)

  const set = (field: PlanField, value: string) => {
    edited.current.add(field)
    if (serverField === field) setServerField(null)
    onDirty()
    setValues((v) => ({ ...v, [field]: value }))
  }
  const blur = (field: PlanField) => {
    if (edited.current.has(field)) setTouched((t) => new Set(t).add(field))
  }

  useEffect(() => {
    if (failedSubmits > 0) summaryRef.current?.focus()
  }, [failedSubmits])
  useEffect(() => {
    if (serverField) document.getElementById(FIELD_ID[serverField])?.focus()
  }, [serverField])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (failing.length > 0) {
      setFailedSubmits((n) => n + 1)
      return
    }
    setServerError(null)
    setServerField(null)
    setSaving(true)
    onSavingChange(true)
    try {
      await onSubmit(values)
    } catch (err) {
      const failure = err instanceof WriteError ? err : new WriteError(FAILED_PLAN)
      const field = FIELD_ORDER.find((f) => f === failure.field)
      setServerError(failure.message)
      if (field) setServerField(field)
      setSaving(false)
      onSavingChange(false)
    }
  }

  const money = (field: Exclude<PlanField, 'monthlyIntention'>, ref?: RefObject<HTMLInputElement | null>, className?: string) => {
    const error = shown(field)
    return (
      <FormField id={FIELD_ID[field]} label={LABEL[field]} error={error} helper={HELP[field]} className={className}>
        <MoneyInput
          id={FIELD_ID[field]}
          inputRef={ref}
          value={values[field]}
          onChange={(value) => set(field, value)}
          onBlur={() => blur(field)}
          invalid={!!error}
          describedBy={describedBy(FIELD_ID[field], error, HELP[field])}
        />
      </FormField>
    )
  }

  const label = monthLabel(month)
  const intentionError = shown('monthlyIntention')
  return (
    <form noValidate onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{mode === 'edit' ? `Edit ${label} plan` : `Plan ${label}`}</DialogTitle>
        <DialogDescription>Planning figures only. Saving a plan never changes your accounts or activity.</DialogDescription>
      </DialogHeader>

      <DialogBody>
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-6 border-0 p-0">
          {serverError && <InlineNotice tone="error">{serverError}</InlineNotice>}
          {slow && (
            <InlineNotice tone="warning">
              <span role="status">{SLOW_SAVE_TEXT}</span>
            </InlineNotice>
          )}
          {submitted && failing.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-control bg-error-soft px-3.5 py-3 text-sm text-error-ink outline-offset-2">
              <p className="font-semibold">Fix {failing.length} {failing.length === 1 ? 'thing' : 'things'} to save</p>
              <ul className="mt-1 list-disc pl-5">
                {failing.map((field) => (
                  <li key={field}>
                    <button type="button" className="cursor-pointer text-left underline" onClick={() => document.getElementById(FIELD_ID[field])?.focus()}>
                      {LABEL[field].replace(' (optional)', '')}: {errors[field]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Group title="Money for the month">
            {money('plannedIncome', firstRef)}
            {money('allocatedStartingFunds')}
          </Group>

          <Group title="Set aside first">
            {money('savingsTarget')}
            {money('priorPeriodDebtReserve')}
          </Group>

          <Group title="Envelope limits">
            <div className="grid gap-4 sm:grid-cols-2">
              {ENVELOPES.map((envelope) => (
                <div key={envelope} className="min-w-0">
                  {money(LIMIT_FIELD[envelope])}
                  <p className="mt-1 text-[0.8125rem] text-muted-foreground">{ENVELOPE_INFO[envelope].examples}</p>
                </div>
              ))}
            </div>
          </Group>

          <section aria-labelledby="kp-check-title" className="rounded-control bg-secondary px-3.5 py-3 text-sm">
            <h3 id="kp-check-title" className="font-semibold">Planning check (estimate)</h3>
            {estimate ? (
              <dl className="mt-1 grid gap-0.5 text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <dt>Available to allocate</dt>
                  <dd className="font-semibold text-foreground">{formatPeso(estimate.available)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>{estimate.unallocated < 0 ? 'Over-allocated' : 'Unallocated'}</dt>
                  <dd className="font-semibold text-foreground">{formatPeso(estimate.unallocated)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-muted-foreground">Fill in every amount to see what&rsquo;s left to allocate.</p>
            )}
          </section>
          {estimate && estimate.unallocated < 0 && (
            <InlineNotice tone="warning" className="-mt-3">
              Your limits are {formatPeso(-estimate.unallocated)} more than you have available. You can still save this
              plan; your numbers stay exactly as you typed them.
            </InlineNotice>
          )}

          <FormField id="kp-intention" label={LABEL.monthlyIntention} error={intentionError} helper={HELP.monthlyIntention}>
            <Input
              id="kp-intention"
              autoComplete="off"
              maxLength={MAX_INTENTION + 20}
              value={values.monthlyIntention}
              onChange={(event) => set('monthlyIntention', event.target.value)}
              onBlur={() => blur('monthlyIntention')}
              aria-invalid={!!intentionError}
              aria-describedby={describedBy('kp-intention', intentionError, HELP.monthlyIntention)}
            />
          </FormField>
        </fieldset>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="secondary" className="grow" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" className="grow-[1.4]" disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              Saving…
            </>
          ) : (
            'Save plan'
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
