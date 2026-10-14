import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useFinance } from '../hooks/useFinance'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { showToast } from '../hooks/toastBus'
import { FinanceValidationError } from '../domain/financeRules'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { localFirstStore, newOperationId } from '../services/localFirstStore'
import { createIdempotencyKey } from '../utils/idempotencyKey'
import { formatMinorUnits } from '../utils/currency'
import { exactMinor } from '../utils/money'
import { formatDateLabel } from '../utils/date'
import {
  QUICK_ADD_FIELD_ORDER, QUICK_ADD_TYPES, accountOptions, buildQuickAddInput, categoryOptions, draftFromTransaction, emptyDraft, fieldForServer,
  isDirty, quickPicks, switchType, validateDraft, type AccountOption, type AccountRole, type QuickAddDraft, type QuickAddField, type QuickAddType,
} from './quickAddModel'
import { OUTBOX_CHANGED_EVENT } from './usePendingTransactions'
import './V3QuickAdd.css'

type Phase = 'editing' | 'submitting' | 'queued'

const SUBMIT_LABEL: Record<QuickAddType, string> = { expense: 'Add expense', income: 'Add income', transfer: 'Add transfer', card_payment: 'Pay card' }
const DETAIL_FIELDS: QuickAddField[] = ['title', 'date', 'time', 'note', 'fee']

function AccountSelect({ id, label, options, value, onChange, error, describedBy, invalid, refCb, hint }: {
  id: string; label: string; options: AccountOption[]; value: string; onChange: (v: string) => void; error?: string; describedBy?: string; invalid?: boolean; refCb: (el: HTMLElement | null) => void; hint?: string
}) {
  const favorites = options.filter((o) => o.favorite)
  const others = options.filter((o) => !o.favorite)
  const render = (o: AccountOption) => <option key={o.id} value={o.id}>{o.label} — {o.detail}</option>
  return (
    <div className="v3-field">
      <label className="v3-label" htmlFor={id}>{label}</label>
      <select id={id} ref={refCb} className="v3-input v3-qa__select" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid ? true : undefined} aria-describedby={describedBy}>
        <option value="">Select…</option>
        {favorites.length > 0 && <optgroup label="Favorites">{favorites.map(render)}</optgroup>}
        {others.length > 0 && <optgroup label={favorites.length > 0 ? 'Other accounts' : 'Accounts'}>{others.map(render)}</optgroup>}
      </select>
      {hint && !error && <p className="v3-caption">{hint}</p>}
    </div>
  )
}

export function V3QuickAdd({ initialType = 'expense', onClose }: { initialType?: QuickAddType; onClose: () => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const { state, todayIso } = finance
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement)
  const lockRef = useRef(false)
  /** One key per logical submission. It survives retries; it only changes after a confirmed outcome or a definitively rejected, edited draft. */
  const keyRef = useRef<{ key: string; fingerprint: string | null; rejected: boolean }>({ key: createIdempotencyKey(), fingerprint: null, rejected: false })
  const initial = useMemo(() => emptyDraft(state, todayIso, initialType), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<QuickAddDraft>(initial)
  const [phase, setPhase] = useState<Phase>('editing')
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)
  const { errors, field, errorId, fail, clear, clearField } = useFieldErrors<QuickAddField>(QUICK_ADD_FIELD_ORDER)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    // showModal focuses the first control (Close); the amount is what the user types first.
    dialog?.querySelector<HTMLInputElement>('.v3-qa__amount')?.focus()
    const trigger = triggerRef.current
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus() }
  }, [])

  const dirty = isDirty(draft, initial)
  const busy = phase === 'submitting'

  function requestClose() {
    if (busy) return
    if (phase === 'editing' && dirty && !confirmDiscard) { setConfirmDiscard(true); return }
    onClose()
  }

  function update(patch: Partial<QuickAddDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
    setFormError(null)
  }

  function setType(type: QuickAddType) {
    setDraft((d) => switchType(state, d, type))
    clear()
    setFormError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (lockRef.current || phase !== 'editing') return
    const problems = validateDraft(state, draft)
    if (Object.keys(problems).length > 0) {
      if (DETAIL_FIELDS.some((f) => problems[f])) setDetailsOpen(true)
      setFormError(null)
      // Let an expanded details section render before focus moves into it.
      window.setTimeout(() => fail(problems), 0)
      fail(problems)
      return
    }
    lockRef.current = true
    setPhase('submitting')
    setFormError(null)
    clear()
    const probe = buildQuickAddInput(state, draft, '')
    const fingerprint = JSON.stringify({ ...probe, idempotencyKey: undefined })
    // A rejected attempt consumed nothing; if the user then changed the entry it is a new submission and gets a new key.
    // Any other outcome (timeout, 5xx, dropped connection) may have posted, so the same key is reused.
    if (keyRef.current.rejected && keyRef.current.fingerprint !== fingerprint) keyRef.current = { key: createIdempotencyKey(), fingerprint: null, rejected: false }
    keyRef.current = { ...keyRef.current, fingerprint }
    const input = { ...probe, idempotencyKey: keyRef.current.key }
    try {
      if (asyncFinance) await asyncFinance.addTransaction(input)
      else finance.addTransaction(input)
      showToast(draft.type === 'card_payment' ? 'Card payment saved' : `${draft.type[0]!.toUpperCase()}${draft.type.slice(1)} saved`)
      onClose()
      return
    } catch (err) {
      if (asyncFinance && err instanceof TypeError) {
        // The request may or may not have reached the server. Queue it under the SAME idempotency key so a replay can never double-post.
        try {
          await localFirstStore.enqueue({ operationId: newOperationId(), idempotencyKey: keyRef.current.key, operationType: 'create_transaction', payload: input, createdAt: new Date().toISOString(), status: 'pending', attemptCount: 0, lastError: null, dependencyIds: [] })
          window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
          setQueuedCount((n) => n + 1)
          setPhase('queued')
          return
        } catch {
          setFormError('Could not reach the server and could not save this on your device. Your entry is still here — try again.')
          setPhase('editing')
          return
        }
      }
      const definite = err instanceof FinanceValidationError || (err instanceof FinanceApiError && err.status >= 400 && err.status < 500)
      const serverField = err instanceof FinanceValidationError ? err.field : err instanceof FinanceApiError ? err.field : undefined
      const message = err instanceof Error ? err.message : 'Could not save.'
      if (definite) {
        keyRef.current = { ...keyRef.current, rejected: true }
        fail({ [fieldForServer(draft.type, serverField)]: message })
      } else {
        setFormError('The server did not confirm this transaction. It may have been saved — check Activity before trying again. Trying again is safe: it reuses the same request key.')
      }
      setPhase('editing')
    } finally {
      lockRef.current = false
    }
  }

  function startAnother() {
    keyRef.current = { key: createIdempotencyKey(), fingerprint: null, rejected: false }
    setDraft(emptyDraft(state, todayIso, draft.type))
    clear()
    setPhase('editing')
  }

  const type = draft.type
  const needsCategory = type === 'expense' || type === 'income'
  const categories = categoryOptions(state, type)
  const picks = useMemo(() => quickPicks(state, type), [state, type])
  const accountRole: AccountRole | null = type === 'expense' ? 'expense' : type === 'income' ? 'income' : null
  const fromOptions = accountOptions(state, 'from')
  const toRole: AccountRole = type === 'card_payment' ? 'cardTo' : 'transferTo'
  const toOptions = accountOptions(state, toRole).filter((o) => o.id !== draft.fromAccountId)
  const cardOwed = type === 'card_payment' ? toOptions.find((o) => o.id === draft.toAccountId)?.owedMinor : undefined
  const describe = (name: QuickAddField) => (errors[name] ? errorId(name) : undefined)
  const err = (name: QuickAddField) => errors[name] ? <p className="v3-qa__error" role="alert" id={errorId(name)}>{errors[name]}</p> : null
  const accountHint = type === 'income' ? 'Income goes to a cash, bank or e-wallet account — never a credit card.' : undefined
  const reuseId = useId()
  const autoOpenDetails = detailsOpen || DETAIL_FIELDS.some((f) => errors[f])
  const reusePreview = picks.reusable.map((t) => ({ id: t.id, label: `${t.title} · ${formatMinorUnits(exactMinor(t.amountMinor, t.amount), { withCents: true })} · ${formatDateLabel(t.date)}` }))

  return (
    <dialog
      ref={dialogRef}
      className="v3-qa"
      aria-labelledby="v3-qa-title"
      onCancel={(e) => { e.preventDefault(); requestClose() }}
      onClose={() => { if (dialogRef.current?.open === false && phase !== 'submitting') onClose() }}
    >
      <form className="v3-qa__form" onSubmit={(e) => void submit(e)} noValidate aria-busy={busy || undefined}>
        <header className="v3-qa__head">
          <h2 id="v3-qa-title" className="v3-h2">Quick add</h2>
          <button type="button" className="v3-btn v3-btn--ghost v3-qa__close" onClick={requestClose} aria-label="Close quick add" disabled={busy}>✕</button>
        </header>

        {phase === 'queued' ? (
          <section className="v3-qa__queued" role="status" data-testid="v3-qa-queued">
            <h3 className="v3-h3">Queued — pending sync</h3>
            <p>The server could not be reached, so this {type === 'card_payment' ? 'card payment' : type} is <strong>not posted yet</strong>. It is saved on this device and will not change your balances until it syncs.</p>
            <p className="v3-secondary">{queuedCount > 1 ? `${queuedCount} entries queued from this sheet.` : 'It keeps its original request key, so syncing can never post it twice.'}</p>
            <div className="v3-qa__actions">
              <Link className="v3-btn v3-btn--primary" to="/sync" onClick={onClose}>Review in Sync Center</Link>
              <button type="button" className="v3-btn v3-btn--secondary" onClick={startAnother}>Add another</button>
              <button type="button" className="v3-btn v3-btn--ghost" onClick={onClose}>Done</button>
            </div>
          </section>
        ) : (
          <>
            <div className="v3-qa__typebar">
              <fieldset className="v3-qa__types" disabled={busy}>
                <legend className="v3-visually-hidden">Transaction type</legend>
                {QUICK_ADD_TYPES.map((t) => (
                  <label key={t.id} className="v3-qa__type">
                    <input type="radio" name="v3-qa-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} />
                    <span>{t.label}</span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="v3-qa__body">
              {formError && <p className="v3-qa__banner" role="alert" data-testid="v3-qa-form-error">{formError}</p>}

              <div className="v3-field">
                <label className="v3-label" htmlFor={field('amount').id}>Amount</label>
                <input {...field('amount', (ev) => update({ amount: ev.target.value }))} className="v3-input v3-qa__amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={draft.amount} />
                {err('amount')}
                {cardOwed !== undefined && !errors.amount && <p className="v3-caption">Outstanding on this card: {formatMinorUnits(cardOwed, { withCents: true })}</p>}
              </div>

              {accountRole && (
                <>
                  <div>
                    <AccountSelect id={field('accountId').id} refCb={field('accountId').ref} label={type === 'income' ? 'Deposit to' : 'Paid from'} options={accountOptions(state, accountRole)} value={draft.accountId} onChange={(v) => { clearField('accountId'); update({ accountId: v }) }} invalid={!!errors.accountId} describedBy={describe('accountId')} hint={accountHint} />
                    {err('accountId')}
                  </div>
                  {picks.accountIds.length > 0 && (
                    <div className="v3-qa__picks" role="group" aria-label="Recent accounts">
                      {picks.accountIds.map((id) => { const o = accountOptions(state, accountRole).find((a) => a.id === id); return o && <button key={id} type="button" className="v3-qa__chip" aria-pressed={draft.accountId === id} onClick={() => { clearField('accountId'); update({ accountId: id }) }}>{o.label}</button> })}
                    </div>
                  )}
                </>
              )}

              {needsCategory && (
                <>
                  <div className="v3-field">
                    <label className="v3-label" htmlFor={field('categoryId').id}>Category</label>
                    <select {...field('categoryId', (ev) => update({ categoryId: ev.target.value }))} className="v3-input v3-qa__select" value={draft.categoryId}>
                      <option value="">Select…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {err('categoryId')}
                  </div>
                  {picks.categoryIds.length > 0 && (
                    <div className="v3-qa__picks" role="group" aria-label="Recent categories">
                      {picks.categoryIds.map((id) => <button key={id} type="button" className="v3-qa__chip" aria-pressed={draft.categoryId === id} onClick={() => { clearField('categoryId'); update({ categoryId: id }) }}>{categories.find((c) => c.id === id)?.name}</button>)}
                    </div>
                  )}
                </>
              )}

              {!accountRole && (
                <>
                  <div>
                    <AccountSelect id={field('fromAccountId').id} refCb={field('fromAccountId').ref} label={type === 'card_payment' ? 'Pay from' : 'From'} options={fromOptions} value={draft.fromAccountId} onChange={(v) => { clearField('fromAccountId'); update({ fromAccountId: v, toAccountId: v === draft.toAccountId && type === 'transfer' ? '' : draft.toAccountId }) }} invalid={!!errors.fromAccountId} describedBy={describe('fromAccountId')} />
                    {err('fromAccountId')}
                  </div>
                  <div>
                    <AccountSelect id={field('toAccountId').id} refCb={field('toAccountId').ref} label={type === 'card_payment' ? 'Credit card' : 'To'} options={toOptions} value={draft.toAccountId} onChange={(v) => { clearField('toAccountId'); update({ toAccountId: v }) }} invalid={!!errors.toAccountId} describedBy={describe('toAccountId')} hint={type === 'card_payment' && toOptions.length === 0 ? 'No credit card has an outstanding balance.' : type === 'card_payment' ? 'Reduces the card balance. Not counted as spending.' : 'Moves your own money. Not counted as income or spending.'} />
                    {err('toAccountId')}
                  </div>
                </>
              )}

              {picks.reusable.length > 0 && (
                <div className="v3-field">
                  <label className="v3-label" htmlFor={`v3-qa-reuse-${reuseId}`}>Reuse an earlier one</label>
                  <select id={`v3-qa-reuse-${reuseId}`} className="v3-input v3-qa__select" value="" onChange={(e) => { const t = picks.reusable.find((x) => x.id === e.target.value); if (t) { setDraft(draftFromTransaction(state, t, type, todayIso)); clear(); setFormError(null) } }}>
                    <option value="">Prefill from a recent entry…</option>
                    {reusePreview.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
              )}

              <div className="v3-qa__details">
                <button type="button" className="v3-btn v3-btn--ghost v3-qa__details-toggle" aria-expanded={autoOpenDetails} aria-controls="v3-qa-details" onClick={() => setDetailsOpen(!autoOpenDetails)}>
                  <span>{autoOpenDetails ? 'Hide optional details' : 'Add optional details'}</span>
                  <span className="v3-caption">Description, date, time, note{type === 'transfer' ? ', fee' : ''}</span>
                </button>
                <div id="v3-qa-details" hidden={!autoOpenDetails} className="v3-qa__details-body">
                  <div className="v3-field">
                    <label className="v3-label" htmlFor={field('title').id}>Description</label>
                    <input {...field('title', (ev) => update({ title: ev.target.value }))} className="v3-input" value={draft.title} autoComplete="off" placeholder={needsCategory ? 'Defaults to the category' : 'Defaults to the accounts involved'} />
                  </div>
                  <div className="v3-qa__row">
                    <div className="v3-field">
                      <label className="v3-label" htmlFor={field('date').id}>Date</label>
                      <input {...field('date', (ev) => update({ date: ev.target.value }))} type="date" className="v3-input" value={draft.date} />
                      {err('date')}
                    </div>
                    <div className="v3-field">
                      <label className="v3-label" htmlFor={field('time').id}>Time</label>
                      <input {...field('time', (ev) => update({ time: ev.target.value }))} type="time" className="v3-input" value={draft.time} />
                      {err('time')}
                    </div>
                  </div>
                  {type === 'transfer' && (
                    <div className="v3-field">
                      <label className="v3-label" htmlFor={field('fee').id}>Transfer fee</label>
                      <input {...field('fee', (ev) => update({ fee: ev.target.value }))} className="v3-input" inputMode="decimal" autoComplete="off" placeholder="0.00" value={draft.fee} />
                      {err('fee')}
                    </div>
                  )}
                  <div className="v3-field">
                    <label className="v3-label" htmlFor={field('note').id}>Notes</label>
                    <textarea {...field('note', (ev) => update({ note: ev.target.value }))} className="v3-input v3-qa__note" rows={2} value={draft.note} />
                  </div>
                </div>
              </div>
            </div>

            {confirmDiscard ? (
              <footer className="v3-qa__foot" role="alertdialog" aria-labelledby="v3-qa-discard">
                <p id="v3-qa-discard" className="v3-qa__discard"><strong>Discard this entry?</strong> What you typed will be lost.</p>
                <div className="v3-qa__actions">
                  <button type="button" className="v3-btn v3-btn--secondary" autoFocus onClick={() => setConfirmDiscard(false)}>Keep editing</button>
                  <button type="button" className="v3-btn v3-btn--primary v3-qa__danger" onClick={onClose}>Discard</button>
                </div>
              </footer>
            ) : (
              <footer className="v3-qa__foot">
                <p className="v3-visually-hidden" role="status">{busy ? 'Saving…' : ''}</p>
                <button type="submit" className="v3-btn v3-btn--primary v3-qa__submit" disabled={busy} aria-disabled={busy || undefined}>{busy ? 'Saving…' : SUBMIT_LABEL[type]}</button>
              </footer>
            )}
          </>
        )}
      </form>
    </dialog>
  )
}
