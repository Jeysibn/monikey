import { useEffect, useId, useRef, useState } from 'react'
import type { RecurringItem } from '../domain/recurring'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { useAsyncFinance } from '../state/asyncFinanceContext'
import { formatDateLabel } from '../utils/date'
import { isUncertainFailure } from './V3ConfirmBill'

type Phase =
  | { kind: 'ask'; error?: string }
  | { kind: 'submitting' }
  | { kind: 'uncertain' }
  | { kind: 'done'; refreshed: boolean; replayed: boolean }

/**
 * "Skip this cycle" is the opposite of "Record payment": it advances the bill to its next due date and records NOTHING in the ledger.
 * The server keys the skip on (bill, due date), so a double click, a retry after a lost response or a reload can only skip that one cycle.
 */
export function SkipBillDialog({ item, onClose }: { item: RecurringItem; onClose: () => void }) {
  const finance = useAsyncFinance()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(false)
  const dueDate = item.nextDueDate // the cycle being skipped; fixed for the lifetime of this dialog
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })
  const titleId = useId()
  const busy = phase.kind === 'submitting'

  // Focus the safe choice (Cancel) so Enter never skips by accident.
  useEffect(() => { const d = dialogRef.current; if (d && !d.open) d.showModal(); cancelRef.current?.focus() }, [])

  async function send() {
    if (busyRef.current) return
    busyRef.current = true
    setPhase({ kind: 'submitting' })
    try {
      const { result, refreshed } = await finance.skipRecurringCycle(item.id, { expectedDueDate: dueDate })
      setPhase({ kind: 'done', refreshed, replayed: result.outcome === 'replayed' })
    } catch (error) {
      if (isUncertainFailure(error)) setPhase({ kind: 'uncertain' })
      else setPhase({ kind: 'ask', error: error instanceof FinanceApiError ? error.message : 'Could not skip this bill.' })
    } finally { busyRef.current = false }
  }
  async function retryRefresh() {
    const ok = await finance.refreshAfterPayment()
    setPhase((p) => (p.kind === 'done' ? { ...p, refreshed: ok } : p))
  }
  const close = () => { if (!busy) { dialogRef.current?.close(); onClose() } }

  return (
    <dialog ref={dialogRef} className="v3-cb" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); close() }} data-testid="v3-skip-dialog">
      <div className="v3-cb__body">
        <header className="v3-cb__head">
          <h2 id={titleId} className="v3-h2">{phase.kind === 'done' ? 'Bill skipped' : `Skip this bill: ${item.merchant}`}</h2>
          <button type="button" className="v3-btn v3-btn--ghost" onClick={close} aria-label="Close" disabled={busy}>✕</button>
        </header>
        {phase.kind === 'done' ? (
          <div className="v3-cb__done" role="status" data-testid="v3-skip-success">
            <p>{phase.replayed ? `The ${formatDateLabel(dueDate)} bill was already skipped, so nothing changed.` : `${item.merchant} for ${formatDateLabel(dueDate)} is skipped, not paid. No expense was recorded and no balance changed.`}</p>
            {!phase.refreshed && (
              <p role="alert" data-testid="v3-skip-stale">The skip is saved, but the latest bills couldn't be loaded. <button type="button" className="v3-btn v3-btn--secondary" onClick={() => void retryRefresh()}>Retry refresh</button></p>
            )}
            <div className="v3-cb__actions"><button type="button" className="v3-btn v3-btn--primary" onClick={close}>Done</button></div>
          </div>
        ) : (
          <div aria-busy={busy || undefined}>
            <p data-testid="v3-skip-explain">Skipping the <strong>{formatDateLabel(dueDate)}</strong> bill moves {item.merchant} to its next due date. <strong>It does not record a payment</strong>: no expense is added to your history and no account balance changes. If you did pay it, cancel and choose Record payment instead.</p>
            {phase.kind === 'ask' && phase.error && <p className="v3-cb__error" role="alert" data-testid="v3-skip-error">{phase.error}</p>}
            {phase.kind === 'uncertain' && <p className="v3-cb__error" role="alert" data-testid="v3-skip-uncertain">We couldn't confirm whether the skip went through. <strong>Check again</strong>: this is safe, it can only ever skip this one bill once.</p>}
            <div className="v3-cb__actions">
              <button ref={cancelRef} type="button" className="v3-btn v3-btn--ghost" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="v3-btn v3-btn--primary" onClick={() => void send()} disabled={busy} aria-disabled={busy || undefined} data-testid="v3-skip-submit">{busy ? 'Skipping…' : phase.kind === 'uncertain' ? 'Check again' : 'Skip without paying'}</button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
