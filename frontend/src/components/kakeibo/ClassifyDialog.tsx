import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { cn } from 'cn'

import { InlineNotice } from '@/components/InlineNotice'
import { MoneyText } from '@/components/MoneyText'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DataSource } from '@/dataSource'
import { ACTIVITY_MAX_ROWS, formatDate, monthLabel } from '@/lib/finance'
import { ENVELOPES, ENVELOPE_INFO, envelopeLabel } from '@/lib/kakeibo'
import type { ActivityItem, KakeiboEnvelope } from '@/types'

/*
 * Classify past expenses (ADR-021, PR D). It lists the month's expenses that were actually loaded, newest
 * first (income, card payments and transfers are never listed), lets the person tick one or more, choose one
 * envelope (or "Not classified" to clear), and confirm. Each one is then sent on its own with
 * PATCH /api/transactions/{id}/kakeibo-envelope, which changes only the envelope: amounts, accounts, dates,
 * notes and balances stay exactly as they were. There is no all-at-once server call, so the dialog counts what
 * was saved; if some fail it says how many, keeps those ticked, and the rest stay saved.
 * Nothing is ever ticked or classified automatically, and the list says when it may not be the whole month.
 */
const STEP = 200 // rows asked for at a time; Activity's own cap of 1,000 still applies

type Show = 'unclassified' | 'all'
type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ActivityItem[]; hasMore: boolean }
const CHOICES: { value: KakeiboEnvelope | null; label: string }[] = [...ENVELOPES.map((e) => ({ value: e, label: ENVELOPE_INFO[e].label })), { value: null, label: 'Not classified' }]

function Body({
  month,
  source,
  onClassified,
  onClose,
  onBusyChange,
}: {
  month: string
  source: DataSource
  onClassified: (count: number, envelope: KakeiboEnvelope | null, complete: boolean) => void
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [limit, setLimit] = useState(STEP)
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [show, setShow] = useState<Show>('unclassified')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [envelope, setEnvelope] = useState<KakeiboEnvelope | null | undefined>(undefined)
  const [step, setStep] = useState<'pick' | 'confirm' | 'saving'>('pick')
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const label = monthLabel(month)

  useEffect(() => {
    const controller = new AbortController()
    source.loadActivity({ month, accountId: null, limit }, controller.signal).then(
      (page) => setLoad({ status: 'ready', items: page.items.filter((item) => item.kind === 'expense'), hasMore: page.hasMore }),
      () => {
        if (!controller.signal.aborted) setLoad({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [month, limit, attempt, source])

  const items = load.status === 'ready' ? load.items : []
  const shown = show === 'unclassified' ? items.filter((item) => !item.entry.envelope) : items
  const chosen = items.filter((item) => selected.has(item.id))
  const allShownChosen = shown.length > 0 && shown.every((item) => selected.has(item.id))
  const toggle = (id: number) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const count = chosen.length
  const noun = count === 1 ? 'expense' : 'expenses'
  const target = envelope === undefined ? '' : envelope === null ? 'Not classified' : envelopeLabel(envelope)

  const run = async () => {
    if (step === 'saving' || envelope === undefined || count === 0) return
    setStep('saving')
    onBusyChange(true)
    setFailure(null)
    setProgress(0)
    const failed: number[] = []
    for (const [index, item] of chosen.entries()) {
      try {
        await source.classifyExpense(item.id, envelope)
      } catch {
        failed.push(item.id)
      }
      setProgress(index + 1)
    }
    onBusyChange(false)
    const saved = count - failed.length
    if (saved > 0) onClassified(saved, envelope, failed.length === 0)
    if (failed.length === 0) return // the parent closes the dialog and says what happened
    setFailure(
      `${saved} of ${count} ${noun} ${envelope === null ? 'cleared' : `moved to ${target}`}. ${failed.length} couldn't be saved and ${failed.length === 1 ? 'is' : 'are'} still ticked. Check your connection and try again.`,
    )
    setSelected(new Set(failed))
    setStep('pick')
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1) // show the list as it is now
    titleRef.current?.focus()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle ref={titleRef} tabIndex={-1}>Classify {label} expenses</DialogTitle>
        <DialogDescription>Only the envelope changes. Amounts, accounts, dates and balances stay the same.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-4">
          {failure && <InlineNotice tone="error">{failure}</InlineNotice>}

          {step === 'pick' && (
            <>
              <SegmentedControl
                legend="Show"
                name="kc-show"
                value={show}
                options={[{ value: 'unclassified', label: 'Not classified' }, { value: 'all', label: 'All expenses' }]}
                onChange={(next) => {
                  setShow(next)
                  setSelected(new Set()) // nothing stays ticked out of sight
                }}
              />
              {load.status === 'error' ? (
                <InlineNotice tone="error">
                  Couldn&rsquo;t load {label} expenses.{' '}
                  <Button variant="link" className="min-h-11 px-0 align-baseline text-sm" onClick={() => { setLoad({ status: 'loading' }); setAttempt((n) => n + 1) }}>
                    Try again
                  </Button>
                </InlineNotice>
              ) : load.status === 'loading' ? (
                <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Loading expenses…
                </p>
              ) : shown.length === 0 ? (
                <p className="rounded-control border-[1.5px] border-dashed border-input p-4 text-center text-sm text-muted-foreground">
                  {show === 'unclassified' ? `Every loaded ${label} expense has an envelope.` : `No expenses recorded in ${label}.`}
                </p>
              ) : (
                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="sr-only">Expenses to classify</legend>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-rule pb-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-[var(--primary)]"
                      checked={allShownChosen}
                      onChange={() => setSelected((s) => {
                        const next = new Set(s)
                        for (const item of shown) {
                          if (allShownChosen) next.delete(item.id)
                          else next.add(item.id)
                        }
                        return next
                      })}
                    />
                    Tick all {shown.length} shown
                  </label>
                  <ul>
                    {shown.map((item) => (
                      <li key={item.key} className="border-b border-rule last:border-b-0">
                        <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                          <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-medium">{item.title}</span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {formatDate(item.date)} · {item.categoryName} · {envelopeLabel(item.entry.envelope)}
                            </span>
                          </span>
                          <MoneyText centavos={item.amount} kind="expense" className="shrink-0 text-[0.9375rem] font-semibold" />
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}
              {load.status === 'ready' && load.hasMore && (
                <div className="rounded-control bg-secondary px-3.5 py-3 text-sm text-muted-foreground">
                  {limit >= ACTIVITY_MAX_ROWS
                    ? `This list stops at the latest ${ACTIVITY_MAX_ROWS.toLocaleString('en')} entries of ${label}. Older ones may still need an envelope.`
                    : `Showing the latest ${limit} entries of ${label}. More may exist.`}
                  {limit < ACTIVITY_MAX_ROWS && (
                    <Button variant="secondary" size="sm" className="mt-2 flex" onClick={() => { setLoad({ status: 'loading' }); setLimit((n) => Math.min(n + STEP, ACTIVITY_MAX_ROWS)) }}>
                      Load more
                    </Button>
                  )}
                </div>
              )}

              {count > 0 && (
                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="mb-1.5 text-sm font-semibold">Move {count} {noun} to</legend>
                  <div className="flex flex-wrap gap-2">
                    {CHOICES.map((choice) => {
                      const checked = envelope === choice.value
                      return (
                        <label key={choice.label} className="relative block">
                          <input type="radio" name="kc-envelope" className="peer sr-only" checked={checked} onChange={() => setEnvelope(choice.value)} />
                          <span className={cn(
                            'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-card px-4 text-[0.9375rem] font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                            choice.value === null && !checked && 'border-dashed',
                            checked && 'border-primary bg-primary-soft font-semibold text-primary-ink',
                          )}>
                            {checked && <Check aria-hidden="true" className="size-4" />}
                            {choice.label}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )}
            </>
          )}

          {step !== 'pick' && (
            <div className="grid gap-3">
              <p className="text-base font-semibold">
                {envelope === null ? `Clear the envelope on ${count} ${noun}?` : `Move ${count} ${noun} to ${target}?`}
              </p>
              <ul className="max-h-56 overflow-y-auto rounded-control bg-secondary px-3.5 py-2 text-sm">
                {chosen.map((item) => (
                  <li key={item.key} className="flex justify-between gap-3 py-1">
                    <span className="min-w-0 truncate">{item.title} · {formatDate(item.date)}</span>
                    <MoneyText centavos={item.amount} kind="expense" className="shrink-0" />
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">Your balances and total expenses don&rsquo;t change; only how these expenses are grouped.</p>
              {step === 'saving' && (
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Saving {progress} of {count}…
                </p>
              )}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        {step === 'pick' ? (
          <>
            <Button type="button" variant="secondary" className="grow" onClick={onClose}>Close</Button>
            <Button type="button" className="grow-[1.4]" disabled={count === 0 || envelope === undefined} onClick={() => setStep('confirm')}>
              {count === 0 ? 'Tick expenses first' : envelope === undefined ? 'Choose an envelope' : `Review ${count} ${noun}`}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" className="grow" disabled={step === 'saving'} onClick={() => setStep('pick')}>Back</Button>
            <Button type="button" className="grow-[1.4]" disabled={step === 'saving'} onClick={() => void run()}>
              {step === 'saving' ? 'Saving…' : envelope === null ? `Clear ${count}` : `Move ${count} to ${target}`}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}

export function ClassifyDialog({
  month,
  source,
  onClassified,
  onOpenChange,
  onClosed,
}: {
  month: string | null // null while closed
  source: DataSource
  onClassified: (count: number, envelope: KakeiboEnvelope | null, complete: boolean) => void
  onOpenChange: (open: boolean) => void
  onClosed: (event: Event) => void
}) {
  const busy = useRef(false)
  return (
    <Dialog open={month !== null} onOpenChange={(open) => !open && !busy.current && onOpenChange(false)}>
      {month !== null && (
        <DialogContent
          onEscapeKeyDown={(event) => busy.current && event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()} // ticks would be lost; Close is always there
          onCloseAutoFocus={onClosed}
        >
          <Body key={month} month={month} source={source} onClassified={onClassified} onClose={() => onOpenChange(false)} onBusyChange={(b) => (busy.current = b)} />
        </DialogContent>
      )}
    </Dialog>
  )
}
