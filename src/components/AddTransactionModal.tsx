import { useEffect, useRef, useState } from 'react'
import './AddTransactionModal.css'

type TxTab = 'expense' | 'income' | 'transfer'

export function AddTransactionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<TxTab>('expense')
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const sameAccount = tab === 'transfer' && fromAccount !== '' && fromAccount === toAccount

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="tx-modal"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      aria-labelledby="add-tx-title"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        <div className="tx-modal-head">
          <h2 id="add-tx-title" className="tx-modal-title">
            Add Transaction
          </h2>
          <button type="button" className="tx-modal-close" aria-label="Close" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="tx-tabs" role="tablist" aria-label="Transaction type">
          {(['expense', 'income', 'transfer'] as TxTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`tx-tab${tab === t ? ' tx-tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="tx-body">
          <div className="tx-amount">
            <span className="tx-amount-ph">$</span>0.00
          </div>

          {tab !== 'transfer' ? (
            <>
              <label className="tx-field">
                <span className="tx-label">
                  {tab === 'income' ? 'Source / Description' : 'Merchant / Description'}
                  <span className="tx-req">*</span>
                </span>
                <input
                  type="text"
                  className="tx-input"
                  placeholder={tab === 'income' ? 'e.g. Freelance Payment' : 'e.g. Grab Grocery'}
                  required
                />
              </label>
              <div className="tx-row two">
                <label className="tx-field">
                  <span className="tx-label">
                    Category<span className="tx-req">*</span>
                  </span>
                  <select className="tx-input" defaultValue="" required>
                    <option value="" disabled>
                      Select category
                    </option>
                    <option>Food &amp; Groceries</option>
                    <option>Transport</option>
                    <option>Shopping</option>
                    <option>Utilities</option>
                    <option>Salary</option>
                  </select>
                </label>
                <label className="tx-field">
                  <span className="tx-label">
                    {tab === 'income' ? 'Deposit to' : 'Account'}
                    <span className="tx-req">*</span>
                  </span>
                  <select className="tx-input" defaultValue="" required>
                    <option value="" disabled>
                      Select account
                    </option>
                    <option>Checking ••4471</option>
                    <option>Savings ••8830</option>
                    <option>GCash</option>
                    <option>Maya</option>
                    <option>Cash Wallet</option>
                  </select>
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
                    value={fromAccount}
                    onChange={(e) => setFromAccount(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select account
                    </option>
                    <option>Checking ••4471</option>
                    <option>Savings ••8830</option>
                    <option>GCash</option>
                    <option>Maya</option>
                    <option>Cash Wallet</option>
                  </select>
                </label>
                <label className="tx-field">
                  <span className="tx-label">
                    To Account<span className="tx-req">*</span>
                  </span>
                  <select className="tx-input" value={toAccount} onChange={(e) => setToAccount(e.target.value)} required>
                    <option value="" disabled>
                      Select account
                    </option>
                    <option>Checking ••4471</option>
                    <option>Savings ••8830</option>
                    <option>GCash</option>
                    <option>Maya</option>
                    <option>Cash Wallet</option>
                  </select>
                </label>
              </div>
              {sameAccount && (
                <p className="tx-error" role="alert">
                  From Account and To Account can&apos;t be the same.
                </p>
              )}
              <label className="tx-field">
                <span className="tx-label">Transfer Fee</span>
                <input type="text" className="tx-input" placeholder="Optional" />
              </label>
            </>
          )}

          <div className="tx-row two">
            <label className="tx-field">
              <span className="tx-label">
                Date<span className="tx-req">*</span>
              </span>
              <input type="date" className="tx-input" defaultValue="2026-08-29" required />
            </label>
            <label className="tx-field">
              <span className="tx-label">Time</span>
              <input type="time" className="tx-input" />
            </label>
          </div>

          <label className="tx-field">
            <span className="tx-label">Notes</span>
            <textarea className="tx-input tx-textarea" placeholder="Optional" />
          </label>

          {tab === 'expense' && (
            <label className="tx-field">
              <span className="tx-label">Receipt</span>
              <div className="tx-receipt">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <rect x="7" y="10" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                Scan or attach a receipt (optional)
              </div>
            </label>
          )}
        </div>

        <div className="tx-foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={sameAccount}>
            Save {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        </div>
      </form>
    </dialog>
  )
}
