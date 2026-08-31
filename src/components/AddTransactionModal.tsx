import { useEffect, useRef, useState } from 'react'
import { useFinance } from '../hooks/useFinance'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { showToast } from '../hooks/toastBus'
import type { TransactionType } from '../domain/finance'
import { FinanceValidationError } from '../domain/financeRules'
import { categoriesForTransactionType } from '../state/financeSelectors'
import { parseMoneyInput } from '../utils/money'
import { isValidIsoDate, isValidTime24 } from '../utils/date'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import './AddTransactionModal.css'

type TxTab = TransactionType

/** The order errors are resolved in when deciding which control to focus after a failed submit (TR-009). */
const FIELD_ORDER = ['amount', 'title', 'categoryId', 'accountId', 'fromAccountId', 'toAccountId', 'fee', 'date', 'time'] as const
type FieldName = (typeof FIELD_ORDER)[number]
type FieldErrors = Partial<Record<FieldName, string>>

function emptyFormState(defaultDate: string) {
  return {
    tab: 'expense' as TxTab,
    amount: '',
    title: '',
    categoryId: '',
    accountId: '',
    fromAccountId: '',
    toAccountId: '',
    fee: '',
    // TR-001: the default transaction date is the injected application
    // clock's today — the same "today" the active reporting period is built
    // from — so a saved default transaction always lands inside the period
    // whose totals the KPIs label.
    date: defaultDate,
    time: '',
    note: '',
    receiptName: '',
  }
}

export function AddTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const triggerFocusRef = useRef<Element | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const [form, setForm] = useState(() => emptyFormState(finance.todayIso))
  const [submitting, setSubmitting] = useState(false)
  // TR-009 / FINDING-010: the same shared hook the page forms use, rather
  // than a second hand-rolled copy of the accessibility contract.
  const { errors, field, errorId, fail, clear } = useFieldErrors<FieldName>(FIELD_ORDER)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      triggerFocusRef.current = document.activeElement
      setForm(emptyFormState(finance.todayIso))
      clear()
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, finance.todayIso, clear])

  function handleClose() {
    onClose()
    // Return focus to whatever opened the dialog (the "+ Add Transaction" button).
    if (triggerFocusRef.current instanceof HTMLElement) triggerFocusRef.current.focus()
  }

  function update<K extends keyof ReturnType<typeof emptyFormState>>(key: K, value: ReturnType<typeof emptyFormState>[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setTab(tab: TxTab) {
    setForm((f) => ({ ...emptyFormState(finance.todayIso), tab, date: f.date }))
    clear()
  }

  const sameAccount = form.tab === 'transfer' && form.fromAccountId !== '' && form.fromAccountId === form.toAccountId
  const payingCard = form.tab === 'transfer' && finance.isCreditCardId(form.toAccountId)

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!form.amount.trim()) {
      errors.amount = 'Enter an amount greater than zero.'
    } else {
      const amountResult = parseMoneyInput(form.amount)
      if (!amountResult.ok) errors.amount = amountResult.error
      else if (amountResult.value <= 0) errors.amount = 'Enter an amount greater than zero.'
    }
    if (form.tab !== 'transfer') {
      if (!form.title.trim()) errors.title = 'Description is required.'
      if (!form.categoryId) errors.categoryId = 'Category is required.'
      if (!form.accountId) errors.accountId = 'Account is required.'
    } else {
      if (!form.fromAccountId) errors.fromAccountId = 'From Account is required.'
      if (!form.toAccountId) errors.toAccountId = 'To Account is required.'
      if (form.fromAccountId && form.fromAccountId === form.toAccountId) {
        errors.toAccountId = "From Account and To Account can't be the same."
      }
      if (form.fee.trim()) {
        const feeResult = parseMoneyInput(form.fee)
        if (!feeResult.ok) errors.fee = feeResult.error
      }
    }
    if (!form.date) errors.date = 'Date is required.'
    else if (!isValidIsoDate(form.date)) errors.date = 'Enter a real calendar date.'
    if (form.time && !isValidTime24(form.time)) errors.time = 'Enter a time between 00:00 and 23:59.'
    return errors
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      fail(validationErrors)
      return
    }

    const amountResult = parseMoneyInput(form.amount)
    if (!amountResult.ok) {
      fail({ amount: amountResult.error })
      return
    }
    const feeResult = form.fee.trim() ? parseMoneyInput(form.fee) : undefined
    if (feeResult && !feeResult.ok) {
      fail({ fee: feeResult.error })
      return
    }
    const transferTitle = payingCard
      ? `Card payment · ${finance.accountLabel(form.fromAccountId)} → ${finance.accountLabel(form.toAccountId)}`
      : `${finance.accountLabel(form.fromAccountId)} → ${finance.accountLabel(form.toAccountId)}`
    const title = form.tab === 'transfer' ? transferTitle : form.title.trim()

    try {
      const input = {
        type: form.tab,
        title,
        categoryId: form.tab !== 'transfer' ? form.categoryId : undefined,
        accountId: form.tab !== 'transfer' ? form.accountId : undefined,
        fromAccountId: form.tab === 'transfer' ? form.fromAccountId : undefined,
        toAccountId: form.tab === 'transfer' ? form.toAccountId : undefined,
        date: form.date,
        time: form.time || undefined,
        amount: amountResult.value,
        fee: feeResult && feeResult.ok ? feeResult.value : undefined,
        note: form.note.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current ?? (idempotencyKeyRef.current = crypto.randomUUID()),
      }
      if (asyncFinance) {
        setSubmitting(true)
        await asyncFinance.addTransaction(input)
      } else {
        finance.addTransaction(input)
      }
    } catch (err) {
      // The repository owns the finance invariants (TR-002); this places
      // whatever it rejected on the exact control at fault.
      const errorField = err instanceof FinanceValidationError && err.field ? (err.field as FieldName) : 'amount'
      const message = err instanceof Error ? err.message : 'Could not save transaction.'
      fail({ [errorField]: message })
      return
    } finally {
      setSubmitting(false)
    }

    showToast(payingCard ? 'Card payment saved' : `${form.tab[0].toUpperCase()}${form.tab.slice(1)} saved`)
    idempotencyKeyRef.current = null
    handleClose()
  }

  const categories = form.tab === 'transfer' ? [] : categoriesForTransactionType(finance.state.categories, form.tab)
  const accountOptions = finance.state.accounts
  const cardOptions = finance.state.creditCards
  // Expenses can be paid from an asset account or charged to a credit card;
  // income only ever lands in an asset account.
  const payableOptions = [
    ...accountOptions.map((a) => ({ id: a.id, label: finance.accountLabel(a.id) })),
    ...cardOptions.map((c) => ({ id: c.id, label: finance.accountLabel(c.id) })),
  ]
  // TR-003: a transfer's destination may be a credit card — that is how a
  // normal bank-to-card payment is recorded (see the To Account optgroups
  // below). The source stays asset-only: a card → asset cash advance is
  // deliberately not supported.

  /** Renders a field's error paragraph with the id its control points at. */
  function fieldError(name: FieldName) {
    const message = errors[name]
    if (!message) return null
    return (
      <p className="tx-error" role="alert" id={errorId(name)}>
        {message}
      </p>
    )
  }

  return (
    <dialog
      ref={dialogRef}
      className="tx-modal"
      onClose={handleClose}
      onCancel={(e) => {
        e.preventDefault()
        handleClose()
      }}
      aria-labelledby="add-tx-title"
    >
      <form method="dialog" onSubmit={handleSubmit} noValidate>
        <div className="tx-modal-head">
          <h2 id="add-tx-title" className="tx-modal-title">
            Add Transaction
          </h2>
          <button type="button" className="tx-modal-close" aria-label="Close" onClick={handleClose} disabled={submitting}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="tx-tabs" role="group" aria-label="Transaction type">
          {(['expense', 'income', 'transfer'] as TxTab[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.tab === t}
              className={`tx-tab${form.tab === t ? ' tx-tab--active' : ''}`}
              onClick={() => setTab(t)}
              disabled={submitting}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="tx-body">
          <label className="tx-field">
            <span className="visually-hidden">Amount</span>
            <div className="tx-amount-row">
              <span className="tx-amount-ph" aria-hidden="true">
                ₱
              </span>
              <input
                type="text"
                inputMode="decimal"
                className="tx-amount-input"
                placeholder="0.00"
                value={form.amount}
                aria-label="Amount"
                {...field('amount', (e) => update('amount', e.target.value))}
              />
            </div>
            {fieldError('amount')}
          </label>

          {form.tab !== 'transfer' ? (
            <>
              <label className="tx-field">
                <span className="tx-label">
                  {form.tab === 'income' ? 'Source / Description' : 'Merchant / Description'}
                  <span className="tx-req">*</span>
                </span>
                <input
                  type="text"
                  className="tx-input"
                  placeholder={form.tab === 'income' ? 'e.g. Freelance Payment' : 'e.g. Grab Grocery'}
                  value={form.title}
                    {...field('title', (e) => update('title', e.target.value))}
                />
                {fieldError('title')}
              </label>
              <div className="tx-row two">
                <label className="tx-field">
                  <span className="tx-label">
                    Category<span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.categoryId}
                        {...field('categoryId', (e) => update('categoryId', e.target.value))}
                  >
                    <option value="" disabled>
                      Select category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {fieldError('categoryId')}
                </label>
                <label className="tx-field">
                  <span className="tx-label">
                    {form.tab === 'income' ? 'Deposit to' : 'Account'}
                    <span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.accountId}
                        {...field('accountId', (e) => update('accountId', e.target.value))}
                  >
                    <option value="" disabled>
                      Select account
                    </option>
                    {(form.tab === 'income' ? accountOptions.map((a) => ({ id: a.id, label: finance.accountLabel(a.id) })) : payableOptions).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {fieldError('accountId')}
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="tx-row two">
                <label className="tx-field">
                  <span className="tx-label">
                    From Account<span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.fromAccountId}
                        {...field('fromAccountId', (e) => update('fromAccountId', e.target.value))}
                  >
                    <option value="" disabled>
                      Select account
                    </option>
                    {accountOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {finance.accountLabel(a.id)}
                      </option>
                    ))}
                  </select>
                  {fieldError('fromAccountId')}
                </label>
                <label className="tx-field">
                  <span className="tx-label">
                    To Account<span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.toAccountId}
                    {...field('toAccountId', (e) => update('toAccountId', e.target.value))}
                    aria-invalid={sameAccount || errors.toAccountId ? true : undefined}
                    aria-describedby={sameAccount || errors.toAccountId ? errorId('toAccountId') : undefined}
                  >
                    <option value="" disabled>
                      Select account
                    </option>
                    <optgroup label="Cash accounts">
                      {accountOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {finance.accountLabel(a.id)}
                        </option>
                      ))}
                    </optgroup>
                    {cardOptions.length > 0 && (
                      <optgroup label="Credit cards (pay a card)">
                        {cardOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {finance.accountLabel(c.id)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
              {(sameAccount || errors.toAccountId) && (
                <p className="tx-error" role="alert" id={errorId('toAccountId')}>
                  {sameAccount ? "From Account and To Account can't be the same." : errors.toAccountId}
                </p>
              )}
              {payingCard && !sameAccount && (
                <p className="tx-help">
                  Credit card payment: this moves money from the selected cash account to the card and reduces the amount owed by the same
                  amount. It stays a transfer, so your income and expense totals don’t change.
                </p>
              )}
              <label className="tx-field">
                <span className="tx-label">Transfer Fee</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="tx-input"
                  placeholder="Optional"
                  value={form.fee}
                    {...field('fee', (e) => update('fee', e.target.value))}
                />
                {fieldError('fee')}
              </label>
            </>
          )}

          <div className="tx-row two">
            <label className="tx-field">
              <span className="tx-label">
                Date<span className="tx-req">*</span>
              </span>
              <input
                type="date"
                className="tx-input"
                value={form.date}
                {...field('date', (e) => update('date', e.target.value))}
              />
              {fieldError('date')}
            </label>
            <label className="tx-field">
              <span className="tx-label">Time</span>
              <input
                type="time"
                className="tx-input"
                value={form.time}
                {...field('time', (e) => update('time', e.target.value))}
              />
              {fieldError('time')}
            </label>
          </div>

          <label className="tx-field">
            <span className="tx-label">Notes</span>
            <textarea className="tx-input tx-textarea" placeholder="Optional" value={form.note} onChange={(e) => update('note', e.target.value)} />
          </label>

          {form.tab === 'expense' && (
            <div className="tx-field">
              <span className="tx-label">Receipt</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="visually-hidden"
                onChange={(e) => update('receiptName', e.target.files?.[0]?.name ?? '')}
              />
              <button type="button" className="tx-receipt" onClick={() => fileInputRef.current?.click()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <rect x="7" y="10" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                {form.receiptName ? `Attached: ${form.receiptName}` : 'Attach a receipt photo (optional)'}
              </button>
              <p className="tx-help">
                Receipt scan (OCR) is planned for a future release — attaching here only keeps a local filename preview.
              </p>
            </div>
          )}
        </div>

        <div className="tx-foot">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={sameAccount || submitting}>
            {submitting ? 'Saving…' : `Save ${form.tab[0].toUpperCase() + form.tab.slice(1)}`}
          </button>
        </div>
      </form>
    </dialog>
  )
}
