import { useRef, useState } from 'react'
import { LoaderCircle, NotebookText } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { MoneyInput } from '@/components/MoneyInput'
import { MoneyText } from '@/components/MoneyText'
import { NoteField } from '@/components/NoteField'
import { useSaveForm } from '@/components/kakeibo/useSaveForm'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SLOW_SAVE_TEXT } from '@/lib/apiErrors'
import { describedBy } from '@/lib/describedBy'
import { monthLabel } from '@/lib/finance'
import { ENVELOPES, ENVELOPE_INFO, MAX_REFLECTION, MONTH_QUESTIONS, reviewValues, validateReview } from '@/lib/kakeibo'
import { formatPeso } from '@/lib/money'
import { formatTimestamp } from '@/lib/time'
import type { Centavos, KakeiboEnvelope, KakeiboMonth, KakeiboReviewValues } from '@/types'

/*
 * The month-end reflection (ADR-021). The card shows the saved answers, when they were saved, and the totals
 * the server stored at that moment (its snapshot), plus a note when the ledger has changed since. Nothing on
 * the dashboard ever saves a review: only "Save reflection" does, and saving again replaces the snapshot with
 * the month's current totals, which the form says before it happens. "Self-reported savings" is what the
 * person says they set aside; MoniKey never checks it against an account or moves money.
 */
const MONTH_ID: Record<keyof KakeiboReviewValues, string> = {
  savedDeclared: 'kr-saved',
  available: 'kr-available',
  savings: 'kr-savings',
  change: 'kr-change',
  appreciated: 'kr-appreciated',
  surprise: 'kr-surprise',
  lesson: 'kr-lesson',
}
const SAVED_HELP = "What you set aside, in your own words. MoniKey doesn't check it against your accounts or move any money."

function Totals({ income, expenses, envelopes, unclassified }: { income: Centavos; expenses: Centavos; envelopes: Record<KakeiboEnvelope, Centavos>; unclassified: Centavos }) {
  const row = 'flex items-baseline justify-between gap-3'
  return (
    <dl className="grid gap-1 text-[0.9375rem]">
      <div className={row}><dt className="text-muted-foreground">Income</dt><dd><MoneyText centavos={income} kind="income" /></dd></div>
      <div className={row}><dt className="font-semibold">Total expenses</dt><dd className="font-semibold"><MoneyText centavos={expenses} /></dd></div>
      {ENVELOPES.map((envelope) => (
        <div key={envelope} className={`${row} text-muted-foreground`}>
          <dt className="pl-3">{ENVELOPE_INFO[envelope].label}</dt>
          <dd className="text-foreground"><MoneyText centavos={envelopes[envelope]} /></dd>
        </div>
      ))}
      <div className={`${row} text-muted-foreground`}><dt className="pl-3">Not classified</dt><dd className="text-foreground"><MoneyText centavos={unclassified} /></dd></div>
    </dl>
  )
}

const currentTotals = (report: KakeiboMonth) => ({
  income: report.actualIncome,
  expenses: report.totalExpenses,
  envelopes: Object.fromEntries(ENVELOPES.map((e) => [e, report.envelopes[e].spent])) as Record<KakeiboEnvelope, Centavos>,
  unclassified: report.unclassifiedExpenses,
})

function ReviewForm({
  report,
  onSubmit,
  onCancel,
  onSavingChange,
  onDirty,
}: {
  report: KakeiboMonth
  onSubmit: (values: KakeiboReviewValues) => Promise<void>
  onCancel: () => void
  onSavingChange: (saving: boolean) => void
  onDirty: () => void
}) {
  const form = useSaveForm({
    initial: reviewValues(report.review),
    validate: validateReview,
    onSubmit,
    onSavingChange,
    onDirty,
    idOf: (field) => MONTH_ID[field],
    failMessage: "Couldn't save. Check your connection and try again. Your reflection is still here.",
  })
  const label = monthLabel(report.month)
  const savedError = form.shown('savedDeclared')
  return (
    <form noValidate onSubmit={form.submit} aria-busy={form.saving} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{label} reflection</DialogTitle>
        <DialogDescription>Every answer is optional. Saving never changes your accounts or activity.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <fieldset disabled={form.saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          {form.serverError && <InlineNotice tone="error">{form.serverError}</InlineNotice>}
          {form.slow && <InlineNotice tone="warning"><span role="status">{SLOW_SAVE_TEXT}</span></InlineNotice>}
          {report.review && (
            <InlineNotice tone="warning">
              Saving again replaces the totals stored on {formatTimestamp(report.review.reviewedAt)} with this month&rsquo;s totals as they are now.
            </InlineNotice>
          )}
          {!report.plan && (
            <p className="text-sm text-muted-foreground">
              {label} has no plan. Saving a reflection also stores its plan amounts as ₱0.00; you can set them later with Create plan.
            </p>
          )}
          <section aria-labelledby="kr-now-title" className="rounded-control bg-secondary px-3.5 py-3">
            <h3 id="kr-now-title" className="mb-1 text-sm font-semibold">{label} so far, from your activity</h3>
            <Totals {...currentTotals(report)} />
          </section>

          <FormField id={MONTH_ID.savedDeclared} label="Self-reported savings (optional)" error={savedError} helper={SAVED_HELP}>
            <MoneyInput
              id={MONTH_ID.savedDeclared}
              value={form.values.savedDeclared}
              onChange={(value) => form.set('savedDeclared', value)}
              onBlur={() => form.blur('savedDeclared')}
              invalid={!!savedError}
              describedBy={describedBy(MONTH_ID.savedDeclared, savedError, SAVED_HELP)}
            />
          </FormField>

          {MONTH_QUESTIONS.map(({ field, question }) => (
            <NoteField
              key={field}
              id={MONTH_ID[field]}
              label={question}
              value={form.values[field]}
              max={MAX_REFLECTION}
              error={form.shown(field)}
              onChange={(value) => form.set(field, value)}
              onBlur={() => form.blur(field)}
            />
          ))}
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" className="grow" onClick={onCancel} disabled={form.saving}>Cancel</Button>
        <Button type="submit" className="grow-[1.4]" disabled={form.saving}>
          {form.saving ? <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Saving…</> : 'Save reflection'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function MonthlyReviewCard({
  report,
  onSave,
  onOpen,
  onClosed,
}: {
  report: KakeiboMonth
  onSave: (month: string, values: KakeiboReviewValues) => Promise<void>
  onOpen: () => void
  onClosed: (event: Event) => void
}) {
  const [editing, setEditing] = useState<KakeiboMonth | null>(null) // the month the form was opened for
  const guard = useRef({ saving: false, dirty: false })
  const { review } = report
  const label = monthLabel(report.month)
  const answers = review ? MONTH_QUESTIONS.filter(({ field }) => review[field]) : []

  return (
    <Card role="region" aria-labelledby="kakeibo-month-review-title" className="min-w-0">
      <CardTitle id="kakeibo-month-review-title" tabIndex={-1}>Month-end reflection</CardTitle>
      {!review ? (
        <CardDescription className="mb-0">
          Look back on {label}: what came in, what you set aside, and one change for next month. Best near the end of the
          month; you can update it later.
        </CardDescription>
      ) : (
        <>
          <CardDescription>Saved {formatTimestamp(review.reviewedAt)}</CardDescription>
          {report.actualsChangedSinceReview && (
            <InlineNotice tone="warning" className="mb-3">
              Your activity for {label} has changed since this reflection was saved. The totals below are from when you saved it;
              the envelopes above show today&rsquo;s.
            </InlineNotice>
          )}
          {review.snapshot && (
            <section aria-labelledby="kakeibo-snapshot-title" className="rounded-control bg-surface-raised px-4 py-3">
              <h3 id="kakeibo-snapshot-title" className="mb-1 text-sm font-semibold">Totals when you saved it</h3>
              <Totals income={review.snapshot.actualIncome} expenses={review.snapshot.totalExpenses} envelopes={review.snapshot.envelopes} unclassified={review.snapshot.unclassified} />
            </section>
          )}
          <dl className="mt-4 grid gap-3">
            <div>
              <dt className="text-sm font-semibold">Self-reported savings</dt>
              <dd className="mt-0.5 text-[0.9375rem] text-muted-foreground">
                {review.savedDeclared === null ? 'Not given' : `${formatPeso(review.savedDeclared)} (your own figure, not an account balance)`}
              </dd>
            </div>
            {answers.map(({ field, question }) => (
              <div key={field}>
                <dt className="text-sm font-semibold">{question}</dt>
                <dd className="mt-0.5 text-[0.9375rem] whitespace-pre-line text-muted-foreground">{review[field]}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <Button
        variant="secondary"
        className="mt-4"
        onClick={() => {
          onOpen()
          guard.current = { saving: false, dirty: false }
          setEditing(report)
        }}
      >
        <NotebookText aria-hidden="true" />
        {review ? 'Edit reflection' : 'Write reflection'}
      </Button>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !guard.current.saving && setEditing(null)}>
        {editing && (
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              document.getElementById(MONTH_ID.savedDeclared)?.focus()
            }}
            onEscapeKeyDown={(event) => guard.current.saving && event.preventDefault()}
            onInteractOutside={(event) => (guard.current.saving || guard.current.dirty) && event.preventDefault()}
            onCloseAutoFocus={onClosed}
          >
            <ReviewForm
              key={editing.month}
              report={editing}
              onDirty={() => (guard.current.dirty = true)}
              onSavingChange={(saving) => (guard.current.saving = saving)}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await onSave(editing.month, values)
                guard.current.saving = false
                setEditing(null)
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </Card>
  )
}
