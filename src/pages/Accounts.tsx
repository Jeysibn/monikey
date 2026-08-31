import { useId, useState } from 'react'
import { Card } from '../components/Card'
import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import { parseMoneyInput } from '../utils/money'
import type { AccountType } from '../domain/finance'
import './Accounts.css'

type AccountSection = 'bank' | 'wallet'

const SECTION_TYPES: Record<AccountSection, Exclude<AccountType, 'credit_card'>[]> = {
  bank: ['checking', 'savings'],
  wallet: ['ewallet', 'cash'],
}

const SECTION_TYPE_LABELS: Record<Exclude<AccountType, 'credit_card'>, string> = {
  checking: 'Bank — Checking',
  savings: 'Bank — Savings',
  ewallet: 'E-Wallet',
  cash: 'Cash',
}

function AddAccountForm({ section, onClose }: { section: AccountSection; onClose: () => void }) {
  const finance = useFinance()
  const [name, setName] = useState('')
  const [type, setType] = useState<Exclude<AccountType, 'credit_card'>>(SECTION_TYPES[section][0])
  const [balance, setBalance] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Account name is required.')
      return
    }
    if (!balance.trim()) {
      setError('Enter a starting balance of zero or more.')
      return
    }
    const result = parseMoneyInput(balance)
    if (!result.ok) {
      setError(result.error)
      return
    }
    try {
      finance.addManualAccount({ name: name.trim(), type, balance: result.value })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add account.')
    }
  }

  return (
    <form className="new-category-form" onSubmit={handleSubmit}>
      <label className="new-category-field">
        <span className="tx-label">Account name</span>
        <input type="text" className="tx-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PayMaya" autoFocus />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Type</span>
        <select className="tx-input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {SECTION_TYPES[section].map((t) => (
            <option key={t} value={t}>
              {SECTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="new-category-field">
        <span className="tx-label">Starting balance</span>
        <input type="text" inputMode="decimal" className="tx-input" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
      </label>
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Add account
        </button>
      </div>
    </form>
  )
}

function AddCardForm({ onClose }: { onClose: () => void }) {
  const finance = useFinance()
  const [name, setName] = useState('')
  const [lastFour, setLastFour] = useState('')
  const [network, setNetwork] = useState<'visa' | 'mastercard'>('visa')
  const [limit, setLimit] = useState('')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Card name is required.')
      return
    }
    if (!/^\d{4}$/.test(lastFour)) {
      setError('Enter the last 4 digits of the card.')
      return
    }
    if (!limit.trim()) {
      setError('Enter a credit limit greater than zero.')
      return
    }
    const limitResult = parseMoneyInput(limit)
    if (!limitResult.ok) {
      setError(limitResult.error)
      return
    }
    if (limitResult.value <= 0) {
      setError('Enter a credit limit greater than zero.')
      return
    }
    const balanceResult = balance.trim() ? parseMoneyInput(balance) : { ok: true as const, value: 0 }
    if (!balanceResult.ok) {
      setError(balanceResult.error)
      return
    }
    // Documented rule (SR-007): a card's balance may not exceed its own
    // limit — the repository also enforces this, this is just an earlier,
    // friendlier surface for the same rule.
    if (balanceResult.value > limitResult.value) {
      setError(`Current balance can’t exceed the ${formatMoney(limitResult.value, { withCents: false })} credit limit.`)
      return
    }
    try {
      finance.addManualCreditCard({
        name: name.trim(),
        lastFour,
        network,
        limit: limitResult.value,
        balance: balanceResult.value,
        dueDate: 'Not set',
        minPayment: 0,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add card.')
    }
  }

  return (
    <form className="new-category-form" onSubmit={handleSubmit}>
      <label className="new-category-field">
        <span className="tx-label">Card name</span>
        <input type="text" className="tx-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BPI Rewards" autoFocus />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Last 4 digits</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          className="tx-input"
          value={lastFour}
          onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
          placeholder="1234"
        />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Network</span>
        <select className="tx-input" value={network} onChange={(e) => setNetwork(e.target.value as typeof network)}>
          <option value="visa">Visa</option>
          <option value="mastercard">Mastercard</option>
        </select>
      </label>
      <label className="new-category-field">
        <span className="tx-label">Credit limit</span>
        <input type="text" inputMode="decimal" className="tx-input" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0.00" />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Current balance (optional)</span>
        <input type="text" inputMode="decimal" className="tx-input" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
      </label>
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Add card
        </button>
      </div>
    </form>
  )
}

export function Accounts() {
  const finance = useFinance()
  const { accounts, creditCards } = finance.state
  const [addingAccount, setAddingAccount] = useState<'bank' | 'wallet' | null>(null)
  const [addingCard, setAddingCard] = useState(false)
  const bankFormId = useId()
  const walletFormId = useId()

  const banks = accounts.filter((a) => a.type === 'checking' || a.type === 'savings')
  const wallets = accounts.filter((a) => a.type === 'ewallet' || a.type === 'cash')
  const bankTotal = banks.reduce((s, a) => s + a.balance, 0)
  const walletTotal = wallets.reduce((s, a) => s + a.balance, 0)

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Accounts</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Available Cash</div>
          <div className="num kpi-val">{formatMoney(finance.totalAvailableCash)}</div>
          {typeof finance.availableCashMonthlyChangePct === 'number' && (
            <div className={finance.availableCashMonthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
              {finance.availableCashMonthlyChangePct >= 0 ? '+' : ''}
              {finance.availableCashMonthlyChangePct}% this month
            </div>
          )}
        </Card>
        <Card>
          <div className="eyebrow">Banks · {banks.length} accounts</div>
          <div className="num kpi-val">{formatMoney(bankTotal)}</div>
        </Card>
        <Card>
          <div className="eyebrow">E-Wallets &amp; Cash · {wallets.length} sources</div>
          <div className="num kpi-val">{formatMoney(walletTotal)}</div>
        </Card>
        <Card>
          <div className="eyebrow">Credit Owed · {creditCards.length} cards</div>
          <div className="num kpi-val">{formatMoney(finance.totalCreditOwed)}</div>
          <div className="kpi-delta--down">
            {finance.totalCreditLimit > 0 ? Math.round((finance.totalCreditOwed / finance.totalCreditLimit) * 100) : 0}% of{' '}
            {formatMoney(finance.totalCreditLimit, { withCents: false })} limit
          </div>
        </Card>
      </div>

      <div className="accounts-split">
        <div className="accounts-col">
          <Card>
            <div className="section-head">
              <span className="card-title-text">Bank Accounts</span>
              <button
                type="button"
                className="add-link"
                aria-expanded={addingAccount === 'bank'}
                aria-controls={bankFormId}
                onClick={() => setAddingAccount(addingAccount === 'bank' ? null : 'bank')}
              >
                + Add account
              </button>
            </div>
            {addingAccount === 'bank' && (
              <div id={bankFormId}>
                <AddAccountForm section="bank" onClose={() => setAddingAccount(null)} />
              </div>
            )}
            {banks.map((a) => (
              <div className="account-row" key={a.id}>
                <div>
                  <div className="acct-name">
                    {a.name}
                    {a.lastFour ? ` ••${a.lastFour}` : ''}
                  </div>
                  <div className="faint">
                    {a.institution ? `${a.institution} · ` : ''}
                    {a.syncStatus}
                  </div>
                </div>
                <div className="acct-amt">
                  <div className="num">{formatMoney(a.balance)}</div>
                  {typeof a.monthlyChangePct === 'number' && (
                    <div className={a.monthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                      {a.monthlyChangePct >= 0 ? '+' : ''}
                      {a.monthlyChangePct}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div className="section-head">
              <span className="card-title-text">E-Wallets &amp; Cash</span>
              <button
                type="button"
                className="add-link"
                aria-expanded={addingAccount === 'wallet'}
                aria-controls={walletFormId}
                onClick={() => setAddingAccount(addingAccount === 'wallet' ? null : 'wallet')}
              >
                + Add account
              </button>
            </div>
            {addingAccount === 'wallet' && (
              <div id={walletFormId}>
                <AddAccountForm section="wallet" onClose={() => setAddingAccount(null)} />
              </div>
            )}
            {wallets.map((a) => (
              <div className="account-row" key={a.id}>
                <div>
                  <div className="acct-name">{a.name}</div>
                  <div className="faint">{a.syncStatus}</div>
                </div>
                <div className="acct-amt">
                  <div className="num">{formatMoney(a.balance)}</div>
                  {typeof a.monthlyChangePct === 'number' && (
                    <div className={a.monthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                      {a.monthlyChangePct >= 0 ? '+' : ''}
                      {a.monthlyChangePct}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div className="section-head">
              <span className="card-title-text">Credit Cards</span>
              <button type="button" className="add-link" aria-expanded={addingCard} onClick={() => setAddingCard((v) => !v)}>
                + Add card
              </button>
            </div>
            {addingCard && <AddCardForm onClose={() => setAddingCard(false)} />}
            {creditCards.map((c) => (
              <div className="account-row" key={c.id}>
                <div>
                  <div className="acct-name">
                    {c.name} ••{c.lastFour}
                  </div>
                  <div className="faint">
                    {c.dueDate === 'Not set' ? 'Due date not set' : `Due ${c.dueDate} · min ${formatMoney(c.minPayment, { withCents: false })}`}
                  </div>
                </div>
                <div className="acct-amt">
                  <div className="num" style={{ color: 'var(--amber)' }}>
                    {formatMoney(c.balance)}
                  </div>
                  <div className="faint">of {formatMoney(c.limit, { withCents: false })}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <div className="accounts-col">
          <Card>
            <div className="card-title-text">Assets Distribution</div>
            <div className="alloc-bars">
              {banks.concat(wallets).map((a) => (
                <div className="alloc-row" key={a.id}>
                  <span className="alloc-label">{a.name}</span>
                  <div className="alloc-track">
                    <div
                      className="alloc-fill"
                      style={{ width: `${finance.totalAvailableCash > 0 ? (a.balance / finance.totalAvailableCash) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="num alloc-amt">{formatMoney(a.balance, { withCents: false })}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="card-title-text">
              Liabilities <span className="faint" style={{ color: 'var(--amber)', fontWeight: 400 }}>{formatMoney(finance.totalCreditOwed, { withCents: false })} owed</span>
            </div>
            <div className="alloc-row">
              <span className="alloc-label">Credit Cards · {creditCards.length}</span>
              <span className="num alloc-amt">{formatMoney(finance.totalCreditOwed, { withCents: false })}</span>
            </div>
            <div className="alloc-row">
              <span className="alloc-label">Loans</span>
              <span className="faint alloc-amt">None yet</span>
            </div>
          </Card>

          <Card className="add-account-card">
            <div className="add-plus" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ fontWeight: 700 }}>Link a real account</div>
            <div className="faint" style={{ textAlign: 'center' }}>
              Connecting a real bank, e-wallet, or credit card is planned for a future release. Use "+ Add account" above for a manual entry today.
            </div>
            <button type="button" className="btn btn--primary" disabled title="Coming soon">
              Connect account — coming soon
            </button>
          </Card>
        </div>
      </div>
    </div>
  )
}
