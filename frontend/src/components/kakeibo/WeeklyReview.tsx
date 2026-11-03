import { useRef, useState } from 'react'
import { LoaderCircle, MessageSquareText } from 'lucide-react'

import { ErrorBlock } from '@/components/ErrorBlock'
import { InlineNotice } from '@/components/InlineNotice'
import { MoneyText } from '@/components/MoneyText'
import { NoteField } from '@/components/NoteField'
import { useSaveForm } from '@/components/kakeibo/useSaveForm'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SLOW_SAVE_TEXT } from '@/lib/apiErrors'
import { ENVELOPES, ENVELOPE_INFO, MAX_REFLECTION, WEEK_QUESTIONS, validateWeekNotes, weekLabel } from '@/lib/kakeibo'
import type { Resource } from '@/useResource'
import type { KakeiboWeek, KakeiboWeekNotes } from '@/types'

/*
 * The weekly check-in (ADR-021): one Monday-to-Sunday week, which may run into the next month or year. The
 * card shows the server's totals for the week and any saved notes; "Write notes" opens a short, optional form
 * of three questions. The server replaces the whole set on every save, so the form always sends all three,
 * including notes the person did not touch, and a note cleared on purpose is saved as empty.
 */
const WEEK_ID: Record<keyof KakeiboWeekNotes, string> = { surprise: 'kw-surprise', worthwhile: 'kw-worthwhile', nextWeek: 'kw-next' }

function WeekTotals({ week }: { week: KakeiboWeek }) {
  return (
    <dl className="grid gap-1 text-[0.9375rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 pb-1">
        <dt className="font-semibold">Total expenses</dt>
        <dd><MoneyText centavos={week.totalExpenses} className="text-lg font-semibold" /></dd>
      </div>
      {ENVELOPES.map((envelope) => (
        <div key={envelope} className="flex flex-wrap items-baseline justify-between gap-x-3 text-muted-foreground">
          <dt>{ENVELOPE_INFO[envelope].label}</dt>
          <dd className="text-foreground"><MoneyText centavos={week.spending[envelope]} /></dd>
        </div>
      ))}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-muted-foreground">
        <dt>Not classified</dt>
        <dd className="text-foreground"><MoneyText centavos={week.unclassifiedExpenses} /></dd>
      </div>
    </dl>
  )
}

function WeekForm({
  week,
  onSubmit,
  onCancel,
  onSavingChange,
  onDirty,
}: {
  week: KakeiboWeek
  onSubmit: (notes: KakeiboWeekNotes) => Promise<void>
  onCancel: () => void
  onSavingChange: (saving: boolean) => void
  onDirty: () => void
}) {
  const initial: KakeiboWeekNotes = week.review
    ? { surprise: week.review.surprise, worthwhile: week.review.worthwhile, nextWeek: week.review.nextWeek }
    : { surprise: '', worthwhile: '', nextWeek: '' }
  const form = useSaveForm({
    initial,
    validate: validateWeekNotes,
    onSubmit,
    onSavingChange,
    onDirty,
    idOf: (field) => WEEK_ID[field],
    failMessage: "Couldn't save. Check your connection and try again. Your notes are still here.",
  })
  return (
    <form noValidate onSubmit={form.submit} aria-busy={form.saving} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>Week of {weekLabel(week.weekStart)}</DialogTitle>
        <DialogDescription>Optional. A few words are enough, and you can change them later.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <fieldset disabled={form.saving} className="m-0 grid min-w-0 gap-5 border-0 p-0">
          {form.serverError && <InlineNotice tone="error">{form.serverError}</InlineNotice>}
          {form.slow && <InlineNotice tone="warning"><span role="status">{SLOW_SAVE_TEXT}</span></InlineNotice>}
          <div className="rounded-control bg-secondary px-3.5 py-3">
            <WeekTotals week={week} />
          </div>
          {WEEK_QUESTIONS.map(({ field, question }) => (
            <NoteField
              key={field}
              id={WEEK_ID[field]}
              label={question}
              value={form.values[field]}
              max={MAX_REFLECTION}
              error={form.shown(field)}
              onChange={(value) => form.set(field, value)}
              onBlur={() => form.blur(field)}
            />
          ))}
          {week.review && <p className="text-sm text-muted-foreground">Saving keeps all three answers as shown here. An answer you clear is removed.</p>}
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" className="grow" onClick={onCancel} disabled={form.saving}>Cancel</Button>
        <Button type="submit" className="grow-[1.4]" disabled={form.saving}>
          {form.saving ? <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Saving…</> : 'Save notes'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function WeeklyReviewCard({
  weeks,
  weekStart,
  week,
  onWeekChange,
  onSave,
  onOpen,
  onClosed,
}: {
  weeks: string[] // Mondays that touch the selected month, newest first
  weekStart: string
  week: Resource<KakeiboWeek>
  onWeekChange: (weekStart: string) => void
  onSave: (weekStart: string, notes: KakeiboWeekNotes) => Promise<void>
  onOpen: () => void // remember the opener so focus can return to it
  onClosed: (event: Event) => void
}) {
  const [editing, setEditing] = useState<KakeiboWeek | null>(null) // the week the form was opened for: switching weeks can't move it
  const guard = useRef({ saving: false, dirty: false })
  const data = week.data?.weekStart === weekStart ? week.data : undefined
  const notes = data?.review ? WEEK_QUESTIONS.filter(({ field }) => data.review?.[field]) : []

  return (
    <Card role="region" aria-labelledby="kakeibo-week-title" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <CardTitle id="kakeibo-week-title" tabIndex={-1}>Weekly check-in</CardTitle>
        <label htmlFor="kakeibo-week" className="sr-only">Week</label>
        <select
          id="kakeibo-week"
          value={weekStart}
          onChange={(event) => onWeekChange(event.target.value)}
          className="h-11 max-w-full min-w-0 cursor-pointer rounded-full border border-input bg-card pl-4 text-[0.9375rem] font-semibold text-foreground"
        >
          {weeks.map((monday) => <option key={monday} value={monday}>{weekLabel(monday)}</option>)}
        </select>
      </div>
      <CardDescription>Monday to Sunday, from your activity. Card payments and transfers aren&rsquo;t spending.</CardDescription>

      {week.error && !data ? (
        <ErrorBlock what="this week's summary" updatedAt={week.updatedAt} onRetry={week.retry} focusAfter="#kakeibo-week-title" className="mt-3" />
      ) : !data ? (
        <div aria-hidden="true" className="mt-3 grid gap-2">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="block h-5 rounded-chip bg-secondary" />)}
        </div>
      ) : (
        <>
          <div className="mt-3"><WeekTotals week={data} /></div>
          <div className="mt-4 border-t border-rule pt-4">
            {notes.length > 0 ? (
              <dl className="grid gap-3">
                {notes.map(({ field, question }) => (
                  <div key={field}>
                    <dt className="text-sm font-semibold">{question}</dt>
                    <dd className="mt-0.5 text-[0.9375rem] whitespace-pre-line text-muted-foreground">{data.review?.[field]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No notes for this week. A quick look back is optional.</p>
            )}
            <Button
              variant="secondary"
              className="mt-3 h-auto min-h-11 max-w-full whitespace-normal py-2"
              onClick={() => {
                onOpen()
                guard.current = { saving: false, dirty: false }
                setEditing(data)
              }}
            >
              <MessageSquareText aria-hidden="true" />
              {notes.length > 0 ? 'Edit notes' : 'Write notes'}
            </Button>
          </div>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !guard.current.saving && setEditing(null)}>
        {editing && (
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              document.getElementById(WEEK_ID.surprise)?.focus()
            }}
            onEscapeKeyDown={(event) => guard.current.saving && event.preventDefault()}
            onInteractOutside={(event) => (guard.current.saving || guard.current.dirty) && event.preventDefault()}
            onCloseAutoFocus={onClosed}
          >
            <WeekForm
              key={editing.weekStart}
              week={editing}
              onDirty={() => (guard.current.dirty = true)}
              onSavingChange={(saving) => (guard.current.saving = saving)}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await onSave(editing.weekStart, values)
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
