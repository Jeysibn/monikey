import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { FinanceState } from '../domain/finance'
import type { RecurringItem } from '../domain/recurring'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { RecurringConfirmError, type ConfirmPaymentInput, type PaymentCandidate } from '../services/apiRecurringGateway'
import { useAsyncFinance } from '../state/asyncFinanceContext'
import { formatMinorUnits } from '../utils/currency'
import { formatDateLabel } from '../utils/date'
import { exactMinor, parseMinorUnitInput } from '../utils/money'
import { accountOptions } from './quickAddModel'

const money = (minor: bigint) => formatMinorUnits(minor, { withCents: true })
const minorOf = (raw: string) => { const p = parseMinorUnitInput(raw); return p.ok && p.value > 0n ? p.value : null }

type Phase =
  | { kind: 'form'; error?: string; field?: 'amount' | 'account' | 'date' }
  | { kind: 'submitting' }
  | { kind: 'duplicate'; candidates: PaymentCandidate[]; error?: string }
  | { kind: 'uncertain' }
  | { kind: 'confirmed'; refreshed: boolean; how: 'confirmed' | 'linked' | 'replayed' | 'reconciled_existing' }

/** Network failures and 5xx leave the outcome unknown. 4xx means the server refused and nothing was recorded. */
export const isUncertainFailure = (error: unknown) => !(error instanceof FinanceApiError) || error.status >= 500

function fieldOf(error: FinanceApiError): 'amount' | 'account' | 'date' | undefined {
  if (error.field === 'amountMinor') return 'amount'
  if (error.field === 'accountId') return 'account'
  if (error.field === 'paidOn') return 'date'
  return undefined
}

/**
 * Explicit "record this bill payment" dialog. Nothing is recorded until the user submits; the server derives the ledger key from the bill and
 * the due date being confirmed, so resending after a lost response, a double click or a reload can only ever produce one expense.
 */
export function ConfirmBillDialog({ item, state, todayIso, onClose }: { item: RecurringItem; state: FinanceState; todayIso: string; onClose: () => void }) {
  const finance = useAsyncFinance()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const submittingRef = useRef(false)
  const lastRef = useRef<ConfirmPaymentInput | null>(null)
  const dueDate = item.nextDueDate // the cycle being confirmed; fixed for the lifetime of this dialog
  const scheduled = exactMinor(item.amountMinor, item.amount)
  const accounts = useMemo(() => accountOptions(state, 'expense'), [state])
  const [amount, setAmount] = useState(() => (Number(scheduled) / 100).toFixed(2))
  const [accountId, setAccountId] = useState(() => (accounts.some((a) => a.id === item.accountId) ? item.accountId : ''))
  const [paidOn, setPaidOn] = useState(todayIso)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const ids = { amount: useId(), account: useId(), date: useId(), err: useId() }

  useEffect(() => { const d = dialogRef.current; if (d && !d.open) d.showModal(); d?.querySelector<HTMLInputElement>('input')?.focus() }, [])

  const minor = minorOf(amount)
  const accountName = accounts.find((a) => a.id === accountId)?.label ?? ''
  const busy = phase.kind === 'submitting'
  const locked = busy || phase.kind === 'uncertain' || phase.kind === 'confirmed'

  const validate = (): Phase | null => {
    if (minor === null) return { kind: 'form', field: 'amount', error: 'Enter an amount greater than zero, like 1,250.00.' }
    if (!accountId) return { kind: 'form', field: 'account', error: 'Choose the account this was paid from.' }
    if (!paidOn || paidOn > todayIso) return { kind: 'form', field: 'date', error: 'Choose the date you actually paid — today or earlier.' }
    return null
  }

  async function send(input: ConfirmPaymentInput) {
    if (submittingRef.current) return
    submittingRef.current = true
    lastRef.current = input
    setPhase({ kind: 'submitting' })
    try {
      const { result, refreshed } = await finance.confirmRecurringPayment(item.id, input)
      setPhase({ kind: 'confirmed', refreshed, how: result.outcome === 'linked' ? 'linked' : result.outcome === 'replayed' ? 'replayed' : result.outcome === 'reconciled_existing' ? 'reconciled_existing' : 'confirmed' })
    } catch (error) {
      if (error instanceof RecurringConfirmError && error.code === 'POSSIBLE_DUPLICATE_PAYMENT') setPhase({ kind: 'duplicate', candidates: error.candidates })
      else if (isUncertainFailure(error)) setPhase({ kind: 'uncertain' })
      else if (error instanceof FinanceApiError) setPhase({ kind: 'form', error: error.message, field: fieldOf(error) })
      else setPhase({ kind: 'uncertain' })
    } finally { submittingRef.current = false }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const invalid = validate()
    if (invalid) { setPhase(invalid); return }
    void send({ expectedDueDate: dueDate, amountMinor: String(minor), accountId, paidOn })
  }
  const recordAnyway = () => { const input = lastRef.current; if (input) void send({ ...input, allowPossibleDuplicate: true }) }
  async function linkPayment(c: PaymentCandidate) {
    if (submittingRef.current) return
    submittingRef.current = true
    setPhase({ kind: 'submitting' })
    try {
      const { refreshed } = await finance.linkRecurringPayment(item.id, { expectedDueDate: dueDate, transactionId: c.transactionId })
      setPhase({ kind: 'confirmed', refreshed, how: 'linked' })
    } catch (error) {
      setPhase(isUncertainFailure(error) ? { kind: 'uncertain' } : { kind: 'duplicate', candidates: phase.kind === 'duplicate' ? phase.candidates : [c], error: error instanceof Error ? error.message : 'Could not link that payment.' })
    } finally { submittingRef.current = false }
  }
  async function retryRefresh() {
    const ok = await finance.refreshAfterPayment()
    setPhase((p) => (p.kind === 'confirmed' ? { ...p, refreshed: ok } : p))
  }
  const retrySame = () => { if (lastRef.current) void send(lastRef.current) }
  const close = () => { if (!busy) { dialogRef.current?.close(); onClose() } }

  const err = phase.kind === 'form' && phase.error ? phase.error : null
  const fieldErr = (f: 'amount' | 'account' | 'date') => (phase.kind === 'form' && phase.field === f ? phase.error : undefined)

  return (
    <dialog ref={dialogRef} className="v3-cb" aria-labelledby={`${ids.err}-title`} onCancel={(e) => { e.preventDefault(); close() }} data-testid="v3-confirm-dialog">
      <div className="v3-cb__body">
        <header className="v3-cb__head">
          <h2 id={`${ids.err}-title`} className="v3-h2">{phase.kind === 'confirmed' ? 'Payment recorded' : `Record payment: ${item.merchant}`}</h2>
          <button type="button" className="v3-btn v3-btn--ghost" onClick={close} aria-label="Close" disabled={busy}>✕</button>
        </header>

        {phase.kind === 'confirmed' ? (
          <div className="v3-cb__done" role="status" data-testid="v3-confirm-success">
            <p>
              {phase.how === 'linked' ? `Linked your existing payment to the ${formatDateLabel(dueDate)} bill. No new expense was created.`
                : phase.how === 'replayed' || phase.how === 'reconciled_existing' ? `This ${formatDateLabel(dueDate)} payment was already recorded, so nothing new was added.`
                : `${item.merchant} for ${formatDateLabel(dueDate)} is recorded as paid: ${money(minor ?? scheduled)} from ${accountName || 'your account'} on ${formatDateLabel(paidOn)}.`}
            </p>
            {!phase.refreshed && (
              <p role="alert" data-testid="v3-confirm-stale">The payment is saved, but the latest balances and bills couldn't be loaded. Do not pay again. <button type="button" className="v3-btn v3-btn--secondary" onClick={() => void retryRefresh()}>Retry refresh</button></p>
            )}
            <div className="v3-cb__actions">
              <Link className="v3-btn v3-btn--secondary" to="/activity" onClick={close}>View in Activity</Link>
              <button type="button" className="v3-btn v3-btn--primary" onClick={close}>Done</button>
            </div>
          </div>
        ) : phase.kind === 'duplicate' ? (
          <div data-testid="v3-confirm-duplicate">
            <p role="alert"><strong>This may already be recorded.</strong> We found {phase.candidates.length === 1 ? 'an expense that looks' : 'expenses that look'} like this bill. Nothing has been recorded yet.</p>
            {phase.error && <p className="v3-cb__error" role="alert">{phase.error}</p>}
            <ul className="v3-cb__cands">
              {phase.candidates.map((c) => (
                <li key={c.transactionId} data-testid="v3-confirm-candidate">
                  <span><strong>{c.title}</strong> · {money(BigInt(c.amountMinor))} · {formatDateLabel(c.occurredOn)}</span>
                  <span className="v3-secondary">Matches on {c.matchedOn.join(', ')}</span>
                  <span className="v3-cb__row">
                    <Link className="v3-btn v3-btn--secondary" to={`/activity?focus=${c.transactionId}`} onClick={close}>Inspect in Activity</Link>
                    <button type="button" className="v3-btn v3-btn--secondary" onClick={() => void linkPayment(c)} disabled={busy}>This is the payment: link it</button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="v3-caption v3-secondary">Linking marks this bill paid using the expense you already have: no new expense is created and no balance changes.</p>
            <div className="v3-cb__actions">
              <button type="button" className="v3-btn v3-btn--ghost" onClick={() => setPhase({ kind: 'form' })}>Back</button>
              <button type="button" className="v3-btn v3-btn--primary" onClick={recordAnyway} disabled={busy}>It is different: record a new expense</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-busy={busy || undefined}>
            <p className="v3-secondary" data-testid="v3-confirm-explain">
              This records a new expense of <strong>{money(minor ?? scheduled)}</strong>{accountName ? <> from <strong>{accountName}</strong></> : null} on <strong>{paidOn ? formatDateLabel(paidOn) : '…'}</strong> in your history, lowers that balance, and moves this bill to its next due date. Nothing is recorded until you confirm.
            </p>
            <p className="v3-caption v3-secondary">Bill due {formatDateLabel(dueDate)}{dueDate < todayIso ? ' · overdue' : ''}. Scheduled amount {money(scheduled)}.</p>
            <label className="v3-label" htmlFor={ids.amount}>Amount paid</label>
            <input id={ids.amount} className="v3-input" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={locked} aria-invalid={fieldErr('amount') ? true : undefined} aria-describedby={fieldErr('amount') ? `${ids.amount}-e` : undefined} />
            {fieldErr('amount') && <p className="v3-cb__error" role="alert" id={`${ids.amount}-e`}>{fieldErr('amount')}</p>}
            <label className="v3-label" htmlFor={ids.account}>Paid from</label>
            <select id={ids.account} className="v3-input" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={locked} aria-invalid={fieldErr('account') ? true : undefined} aria-describedby={fieldErr('account') ? `${ids.account}-e` : undefined}>
              <option value="">Choose an account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {a.detail}</option>)}
            </select>
            {fieldErr('account') && <p className="v3-cb__error" role="alert" id={`${ids.account}-e`}>{fieldErr('account')}</p>}
            <label className="v3-label" htmlFor={ids.date}>Payment date</label>
            <input id={ids.date} className="v3-input" type="date" max={todayIso} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} disabled={locked} aria-invalid={fieldErr('date') ? true : undefined} aria-describedby={fieldErr('date') ? `${ids.date}-e` : undefined} />
            {fieldErr('date') && <p className="v3-cb__error" role="alert" id={`${ids.date}-e`}>{fieldErr('date')}</p>}
            {phase.kind === 'form' && err && !phase.field && <p className="v3-cb__error" role="alert" data-testid="v3-confirm-error">{err}</p>}
            {phase.kind === 'uncertain' && (
              <p className="v3-cb__error" role="alert" data-testid="v3-confirm-uncertain">We couldn't confirm whether this payment was recorded. It may or may not have gone through. <strong>Check again</strong>: this is safe, it can never record the payment twice.</p>
            )}
            <div className="v3-cb__actions">
              <button type="button" className="v3-btn v3-btn--ghost" onClick={close} disabled={busy}>Cancel</button>
              {phase.kind === 'uncertain'
                ? <button type="button" className="v3-btn v3-btn--primary" onClick={retrySame}>Check again</button>
                : <button type="submit" className="v3-btn v3-btn--primary" disabled={busy} aria-disabled={busy || undefined} data-testid="v3-confirm-submit">{busy ? 'Recording…' : 'Record payment'}</button>}
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
