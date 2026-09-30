import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Transaction } from '../domain/finance'

export function TagPicker({
  transaction,
  initialValue,
  open,
  onSave,
  onClose,
}: {
  transaction: Transaction
  initialValue: string
  open: boolean
  onSave: (value: string) => Promise<void>
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputId = useId()
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    setError(null)
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSubmitting(true)
    try { await onSave(value) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update transaction tags.') } finally { setSubmitting(false) }
  }

  return (
    <dialog ref={dialogRef} className="app-dialog tag-picker-dialog" aria-labelledby="tag-picker-title" onCancel={onClose}>
      <form className="app-dialog__body" onSubmit={(event) => void submit(event)}>
        <h2 id="tag-picker-title">Tags for {transaction.title}</h2>
        <label htmlFor={inputId}>Tags <span className="faint">comma-separated names</span></label>
        <input id={inputId} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" />
        {error && <p className="tx-error" role="alert">{error}</p>}
        <div className="app-dialog__actions"><button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>Cancel</button><button type="submit" className="btn btn--primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save tags'}</button></div>
      </form>
    </dialog>
  )
}
