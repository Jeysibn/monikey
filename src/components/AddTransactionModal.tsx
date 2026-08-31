import { useEffect, useId, useRef, useState } from 'react'
import { useFinance } from '../hooks/useFinance'
import { showToast } from '../hooks/toastBus'
import type { TransactionType } from '../domain/finance'
import { categoriesForTransactionType } from '../state/financeSelectors'
import { parseMoneyInput } from '../utils/money'
import './AddTransactionModal.css'

type TxTab = TransactionType

function todayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function emptyFormState() {
  return {
    tab: 'expense' as TxTab,
    amount: '',
    title: '',
    categoryId: '',
    accountId: '',
    fromAccountId: '',
    toAccountId: '',
    fee: '',
    date: todayIso(),
    time: '',
    note: '',
    receiptName: '',
    errors: {} as Record<string, string>,
  }
}

export function AddTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const finance = useFinance()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const triggerFocusRef = useRef<Element | null>(null)
  const [form, setForm] = useState(emptyFormState())
  const amountId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      triggerFocusRef.current = document.activeElement
      setForm(emptyFormState())
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleClose() {
    onClose()
    // Return focus to whatever opened the dialog (the "+ Add Transaction" button).
    if (triggerFocusRef.current instanceof HTMLElement) triggerFocusRef.current.focus()
  }

  function update<K extends keyof ReturnType<typeof emptyFormState>>(key: K, value: ReturnType<typeof emptyFormState>[K]) {
    setForm((f) => ({ ...f, [key]: value, errors: { ...f.errors, [key]: '' } }))
  }

  function setTab(tab: TxTab) {
    setForm((f) => ({ ...emptyFormState(), tab, date: f.date }))
  }

  const sameAccount = form.tab === 'transfer' && form.fromAccountId !== '' && form.fromAccountId === form.toAccountId

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!form.amount.trim()) {
      errors.amount = 'Enter an amount greater than zero.'
    } else {
      const amountResult = parseMoneyInput(form.amount)
      if (!amountResult.ok) errors.amount = amountResult.error
      else if (amountResult.value <= 0) errors.amount = 'Enter an amount greater than zero.'
    }
    if (form.tab !== 'transfer') {
      if (!form.title.trim()) errors.title = 'Description is required.'
      if (form.tab === 'income' || form.tab === 'expense') {
        if (!form.categoryId) errors.categoryId = 'Category is required.'
      }
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
    return errors
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setForm((f) => ({ ...f, errors }))
      return
    }

    const amountResult = parseMoneyInput(form.amount)
    if (!amountResult.ok) {
      setForm((f) => ({ ...f, errors: { ...f.errors, amount: amountResult.error } }))
      return
    }
    const feeResult = form.fee.trim() ? parseMoneyInput(form.fee) : undefined
    if (feeResult && !feeResult.ok) {
      setForm((f) => ({ ...f, errors: { ...f.errors, fee: feeResult.error } }))
      return
    }
    const title = form.tab === 'transfer' ? `${finance.accountLabel(form.fromAccountId)} → ${finance.accountLabel(form.toAccountId)}` : form.title.trim()

    try {
      finance.addTransaction({
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
      })
    } catch (err) {
      setForm((f) => ({ ...f, errors: { ...f.errors, amount: err instanceof Error ? err.message : 'Could not save transaction.' } }))
      return
    }

    showToast(`${form.tab[0].toUpperCase()}${form.tab.slice(1)} saved`)
    handleClose()
  }

  const categories = form.tab === 'transfer' ? [] : categoriesForTransactionType(finance.state.categories, form.tab)
  const accountOptions = finance.state.accounts
  // Expenses can be paid from an asset account or charged to a credit card;
  // income and transfers only move between asset accounts.
  const payableOptions = [...accountOptions.map((a) => ({ id: a.id, label: finance.accountLabel(a.id) })), ...finance.state.creditCards.map((c) => ({ id: c.id, label: finance.accountLabel(c.id) }))]

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
          <button type="button" className="tx-modal-close" aria-label="Close" onClick={handleClose}>
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
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="tx-body">
          <label className="tx-field">
            <span className="visually-hidden" id={amountId}>
              Amount
            </span>
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
                onChange={(e) => update('amount', e.target.value)}
                aria-labelledby={amountId}
                aria-invalid={!!form.errors.amount}
                aria-describedby={form.errors.amount ? `${amountId}-error` : undefined}
              />
            </div>
            {form.errors.amount && (
              <p className="tx-error" role="alert" id={`${amountId}-error`}>
                {form.errors.amount}
              </p>
            )}
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
                  onChange={(e) => update('title', e.target.value)}
                  aria-invalid={!!form.errors.title}
                />
                {form.errors.title && (
                  <p className="tx-error" role="alert">
                    {form.errors.title}
                  </p>
                )}
              </label>
              <div className="tx-row two">
                <label className="tx-field">
                  <span className="tx-label">
                    Category<span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.categoryId}
                    onChange={(e) => update('categoryId', e.target.value)}
                    aria-invalid={!!form.errors.categoryId}
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
                  {form.errors.categoryId && (
                    <p className="tx-error" role="alert">
                      {form.errors.categoryId}
                    </p>
                  )}
                </label>
                <label className="tx-field">
                  <span className="tx-label">
                    {form.tab === 'income' ? 'Deposit to' : 'Account'}
                    <span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.accountId}
                    onChange={(e) => update('accountId', e.target.value)}
                    aria-invalid={!!form.errors.accountId}
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
                  {form.errors.accountId && (
                    <p className="tx-error" role="alert">
                      {form.errors.accountId}
                    </p>
                  )}
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
                    onChange={(e) => update('fromAccountId', e.target.value)}
                    aria-invalid={!!form.errors.fromAccountId}
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
                  {form.errors.fromAccountId && (
                    <p className="tx-error" role="alert">
                      {form.errors.fromAccountId}
                    </p>
                  )}
                </label>
                <label className="tx-field">
                  <span className="tx-label">
                    To Account<span className="tx-req">*</span>
                  </span>
                  <select
                    className="tx-input"
                    value={form.toAccountId}
                    onChange={(e) => update('toAccountId', e.target.value)}
                    aria-invalid={sameAccount || !!form.errors.toAccountId}
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
                </label>
              </div>
              {(sameAccount || form.errors.toAccountId) && (
                <p className="tx-error" role="alert">
                  From Account and To Account can&apos;t be the same.
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
                  onChange={(e) => update('fee', e.target.value)}
                />
                {form.errors.fee && (
                  <p className="tx-error" role="alert">
                    {form.errors.fee}
                  </p>
                )}
              </label>
            </>
          )}

          <div className="tx-row two">
            <label className="tx-field">
              <span className="tx-label">
                Date<span className="tx-req">*</span>
              </span>
              <input type="date" className="tx-input" value={form.date} onChange={(e) => update('date', e.target.value)} aria-invalid={!!form.errors.date} />
              {form.errors.date && (
                <p className="tx-error" role="alert">
                  {form.errors.date}
                </p>
              )}
            </label>
            <label className="tx-field">
              <span className="tx-label">Time</span>
              <input type="time" className="tx-input" value={form.time} onChange={(e) => update('time', e.target.value)} />
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
              <p className="faint" style={{ fontSize: 10.5, margin: '4px 0 0' }}>
                Receipt scan (OCR) is planned for a future release — attaching here only keeps a local filename preview.
              </p>
            </div>
          )}
        </div>

        <div className="tx-foot">
          <button type="button" className="btn btn--ghost" onClick={handleClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={sameAccount}>
            Save {form.tab[0].toUpperCase() + form.tab.slice(1)}
          </button>
        </div>
      </form>
    </dialog>
  )
}
