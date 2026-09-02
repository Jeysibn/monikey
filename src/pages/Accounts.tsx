import { useId, useState } from 'react'
import { Card } from '../components/Card'
import { useFinance } from '../hooks/useFinance'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { formatMoney } from '../utils/currency'
import { formatDueDateLabel } from '../utils/date'
import { parseMoneyInput } from '../utils/money'
import { FinanceValidationError } from '../domain/financeRules'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
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

const ACCOUNT_FIELDS = ['name', 'type', 'balance'] as const
type AccountField = (typeof ACCOUNT_FIELDS)[number]

function AddAccountForm({ section, onClose, editingId }: { section: AccountSection; onClose: () => void; editingId?: string }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const editingAccount = editingId ? finance.state.accounts.find((a) => a.id === editingId) : undefined
  const [name, setName] = useState(editingAccount?.name ?? '')
  const [type, setType] = useState<Exclude<AccountType, 'credit_card'>>(
    (editingAccount?.type as Exclude<AccountType, 'credit_card'> | undefined) ?? SECTION_TYPES[section][0],
  )
  // Editing only changes name/type — the starting balance is a one-time input
  // at creation, not an editable field (balances move via transactions).
  const [balance, setBalance] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { errors, field, errorId, fail } = useFieldErrors<AccountField>(ACCOUNT_FIELDS)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      fail({ name: 'Account name is required.' })
      return
    }
    if (editingAccount) {
      // Edit mode is backend-only — see AddAccountForm's edit affordance is
      // only ever shown when `asyncFinance` is available (mirrors Goals.tsx).
      // The backend's PATCH /accounts/:id only accepts name/institution/
      // lastFour (UpdateAccountInput) — type isn't editable once an account
      // exists, so only the name changes here.
      if (!asyncFinance) return
      try {
        setSubmitting(true)
        await asyncFinance.updateAccount(editingAccount.id, { name: name.trim() })
        onClose()
      } catch (err) {
        fail({ name: err instanceof Error ? err.message : 'Could not update account.' })
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (!balance.trim()) {
      fail({ balance: 'Enter a starting balance of zero or more.' })
      return
    }
    const result = parseMoneyInput(balance)
    if (!result.ok) {
      fail({ balance: result.error })
      return
    }
    try {
      setSubmitting(true)
      if (asyncFinance) await asyncFinance.addManualAccount({ name: name.trim(), type, balance: result.value })
      else finance.addManualAccount({ name: name.trim(), type, balance: result.value })
      onClose()
    } catch (err) {
      const at = err instanceof FinanceValidationError && err.field ? (err.field as AccountField) : 'name'
      fail({ [at]: err instanceof Error ? err.message : 'Could not add account.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="new-category-form" onSubmit={handleSubmit} noValidate>
      <label className="new-category-field">
        <span className="tx-label">Account name</span>
        <input
          type="text"
          className="tx-input"
          value={name}
          placeholder="e.g. PayMaya"
          autoFocus
          {...field('name', (e) => setName(e.target.value))}
        />
        {errors.name && (
          <p className="tx-error" role="alert" id={errorId('name')}>
            {errors.name}
          </p>
        )}
      </label>
      {!editingAccount && (
        <label className="new-category-field">
          <span className="tx-label">Type</span>
          <select className="tx-input" value={type} {...field('type', (e) => setType(e.target.value as typeof type))}>
            {SECTION_TYPES[section].map((t) => (
              <option key={t} value={t}>
                {SECTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      {!editingAccount && (
        <label className="new-category-field">
          <span className="tx-label">Starting balance</span>
          <input
            type="text"
            inputMode="decimal"
            className="tx-input"
            value={balance}
            placeholder="0.00"
            {...field('balance', (e) => setBalance(e.target.value))}
          />
          {errors.balance && (
            <p className="tx-error" role="alert" id={errorId('balance')}>
              {errors.balance}
            </p>
          )}
        </label>
      )}
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : editingAccount ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </form>
  )
}

const CARD_FIELDS = ['name', 'lastFour', 'network', 'limit', 'balance', 'dueDate', 'minPayment'] as const
type CardField = (typeof CARD_FIELDS)[number]

function AddCardForm({ onClose, editingId }: { onClose: () => void; editingId?: string }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const editingCard = editingId ? finance.state.creditCards.find((c) => c.id === editingId) : undefined
  const [name, setName] = useState(editingCard?.name ?? '')
  const [lastFour, setLastFour] = useState(editingCard?.lastFour ?? '')
  const [network, setNetwork] = useState<'visa' | 'mastercard'>((editingCard?.network as 'visa' | 'mastercard') ?? 'visa')
  const [limit, setLimit] = useState(editingCard ? String(editingCard.limit) : '')
  const [balance, setBalance] = useState('')
  // TR-003: a card carries a real due date and minimum payment from the
  // moment it is created, so it can contribute to Money Position's upcoming
  // commitments instead of being stored as `dueDate: 'Not set'`/`minPayment: 0`.
  const [dueDate, setDueDate] = useState(editingCard?.dueDate ?? '')
  const [minPayment, setMinPayment] = useState(editingCard ? String(editingCard.minPayment) : '')
  const [submitting, setSubmitting] = useState(false)
  const { errors, field, errorId, fail } = useFieldErrors<CardField>(CARD_FIELDS)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      fail({ name: 'Card name is required.' })
      return
    }
    if (!/^\d{4}$/.test(lastFour)) {
      fail({ lastFour: 'Enter the last 4 digits of the card.' })
      return
    }
    if (editingCard) {
      // Edit mode is backend-only, mirroring AddAccountForm and Goals.tsx.
      // The backend's PATCH /accounts/:id only accepts name/institution/
      // lastFour (UpdateAccountInput) — network, limit, due date, and minimum
      // payment aren't editable once a card exists.
      if (!asyncFinance) return
      try {
        setSubmitting(true)
        await asyncFinance.updateCreditCard(editingCard.id, { name: name.trim(), lastFour })
        onClose()
      } catch (err) {
        fail({ name: err instanceof Error ? err.message : 'Could not update card.' })
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (!limit.trim()) {
      fail({ limit: 'Enter a credit limit greater than zero.' })
      return
    }
    const limitResult = parseMoneyInput(limit)
    if (!limitResult.ok) {
      fail({ limit: limitResult.error })
      return
    }
    if (limitResult.value <= 0) {
      fail({ limit: 'Enter a credit limit greater than zero.' })
      return
    }
    if (!dueDate) {
      fail({ dueDate: 'Enter a payment due date.' })
      return
    }
    const minResult = minPayment.trim() ? parseMoneyInput(minPayment) : { ok: true as const, value: 0 }
    if (!minResult.ok) {
      fail({ minPayment: minResult.error })
      return
    }
    const balanceResult = balance.trim() ? parseMoneyInput(balance) : { ok: true as const, value: 0 }
    if (!balanceResult.ok) {
      fail({ balance: balanceResult.error })
      return
    }
    try {
      // The credit-limit and due-date rules live in the repository
      // (domain/financeRules.ts, TR-002) — this form only surfaces whatever
      // it rejects on the field that caused it.
      const input = {
        name: name.trim(),
        lastFour,
        network,
        limit: limitResult.value,
        balance: balanceResult.value,
        dueDate,
        minPayment: minResult.value,
      }
      setSubmitting(true)
      if (asyncFinance) await asyncFinance.addManualCreditCard(input)
      else finance.addManualCreditCard(input)
      onClose()
    } catch (err) {
      const at = err instanceof FinanceValidationError && err.field ? (err.field as CardField) : 'name'
      fail({ [at]: err instanceof Error ? err.message : 'Could not add card.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="new-category-form" onSubmit={handleSubmit} noValidate>
      <label className="new-category-field">
        <span className="tx-label">Card name</span>
        <input
          type="text"
          className="tx-input"
          value={name}
          placeholder="e.g. BPI Rewards"
          autoFocus
          {...field('name', (e) => setName(e.target.value))}
        />
        {errors.name && (
          <p className="tx-error" role="alert" id={errorId('name')}>
            {errors.name}
          </p>
        )}
      </label>
      <label className="new-category-field">
        <span className="tx-label">Last 4 digits</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          className="tx-input"
          value={lastFour}
          placeholder="1234"
          {...field('lastFour', (e) => setLastFour(e.target.value.replace(/\D/g, '')))}
        />
        {errors.lastFour && (
          <p className="tx-error" role="alert" id={errorId('lastFour')}>
            {errors.lastFour}
          </p>
        )}
      </label>
      {!editingCard && (
        <>
          <label className="new-category-field">
            <span className="tx-label">Network</span>
            <select className="tx-input" value={network} {...field('network', (e) => setNetwork(e.target.value as typeof network))}>
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
            </select>
          </label>
          <label className="new-category-field">
            <span className="tx-label">Credit limit</span>
            <input
              type="text"
              inputMode="decimal"
              className="tx-input"
              value={limit}
              placeholder="0.00"
              {...field('limit', (e) => setLimit(e.target.value))}
            />
            {errors.limit && (
              <p className="tx-error" role="alert" id={errorId('limit')}>
                {errors.limit}
              </p>
            )}
          </label>
          <label className="new-category-field">
            <span className="tx-label">Current balance (optional)</span>
            <input
              type="text"
              inputMode="decimal"
              className="tx-input"
              value={balance}
              placeholder="0.00"
              {...field('balance', (e) => setBalance(e.target.value))}
            />
            {errors.balance && (
              <p className="tx-error" role="alert" id={errorId('balance')}>
                {errors.balance}
              </p>
            )}
          </label>
          <label className="new-category-field">
            <span className="tx-label">Payment due date</span>
            {/* FINDING-009: a due date already in the past can never fall inside
                the 30-day commitment horizon, so the card would silently never
                count. The domain rejects it; `min` stops it being offered. */}
            <input
              type="date"
              className="tx-input"
              min={finance.todayIso}
              value={dueDate}
              {...field('dueDate', (e) => setDueDate(e.target.value))}
            />
            {errors.dueDate && (
              <p className="tx-error" role="alert" id={errorId('dueDate')}>
                {errors.dueDate}
              </p>
            )}
          </label>
          <label className="new-category-field">
            {/* Blank means zero, so it is labeled optional like its sibling. */}
            <span className="tx-label">Minimum payment (optional)</span>
            <input
              type="text"
              inputMode="decimal"
              className="tx-input"
              value={minPayment}
              placeholder="0.00"
              {...field('minPayment', (e) => setMinPayment(e.target.value))}
            />
            {errors.minPayment && (
              <p className="tx-error" role="alert" id={errorId('minPayment')}>
                {errors.minPayment}
              </p>
            )}
          </label>
          <p className="form-help">
            The due date and minimum payment are what let this card appear in your money position’s upcoming commitments — minimums due
            within the next 30 days are counted.
          </p>
        </>
      )}
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : editingCard ? 'Save changes' : 'Add card'}
        </button>
      </div>
    </form>
  )
}

export function Accounts() {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const { accounts, creditCards } = finance.state
  const [addingAccount, setAddingAccount] = useState<'bank' | 'wallet' | null>(null)
  const [addingCard, setAddingCard] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const bankFormId = useId()
  const walletFormId = useId()

  const banks = accounts.filter((a) => a.type === 'checking' || a.type === 'savings')
  const wallets = accounts.filter((a) => a.type === 'ewallet' || a.type === 'cash')
  const bankTotal = banks.reduce((s, a) => s + a.balance, 0)
  const walletTotal = wallets.reduce((s, a) => s + a.balance, 0)

  // Edit/archive are backend-only (see AddAccountForm/AddCardForm) — mirrors
  // the async-mode-only gate established by Goals.tsx.
  function handleEditAccount(id: string) {
    setAddingAccount(null)
    setEditingAccountId((current) => (current === id ? null : id))
  }
  function handleEditCard(id: string) {
    setAddingCard(false)
    setEditingCardId((current) => (current === id ? null : id))
  }
  async function handleArchiveAccount(id: string, name: string) {
    if (!asyncFinance) return
    if (!window.confirm(`Archive "${name}"? It will no longer appear in your accounts.`)) return
    await asyncFinance.archiveAccount(id)
  }
  async function handleArchiveCard(id: string, name: string) {
    if (!asyncFinance) return
    if (!window.confirm(`Archive "${name}"? It will no longer appear in your accounts.`)) return
    await asyncFinance.archiveCreditCard(id)
  }

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
              {finance.availableCashMonthlyChangePct}% in {finance.activePeriodLabel}
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
              <div key={a.id}>
                <div className="account-row">
                  <div>
                    <div className="acct-name">
                      {a.name}
                      {a.lastFour ? ` ••${a.lastFour}` : ''}
                    </div>
                    <div className="acct-meta">
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
                  {asyncFinance && (
                    <div className="rec-row-actions">
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleEditAccount(a.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleArchiveAccount(a.id, a.name)}>
                        Archive
                      </button>
                    </div>
                  )}
                </div>
                {editingAccountId === a.id && <AddAccountForm section="bank" editingId={a.id} onClose={() => setEditingAccountId(null)} />}
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
              <div key={a.id}>
                <div className="account-row">
                  <div>
                    <div className="acct-name">{a.name}</div>
                    <div className="acct-meta">{a.syncStatus}</div>
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
                  {asyncFinance && (
                    <div className="rec-row-actions">
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleEditAccount(a.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleArchiveAccount(a.id, a.name)}>
                        Archive
                      </button>
                    </div>
                  )}
                </div>
                {editingAccountId === a.id && <AddAccountForm section="wallet" editingId={a.id} onClose={() => setEditingAccountId(null)} />}
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
              <div key={c.id}>
                <div className="account-row">
                  <div>
                    <div className="acct-name">
                      {c.name} ••{c.lastFour}
                    </div>
                    <div className="acct-meta">
                      Due {formatDueDateLabel(c.dueDate)} · min {formatMoney(c.minPayment, { withCents: false })}
                    </div>
                  </div>
                  <div className="acct-amt">
                    <div className="num" style={{ color: 'var(--amber)' }}>
                      {formatMoney(c.balance)}
                    </div>
                    <div className="acct-meta">of {formatMoney(c.limit, { withCents: false })}</div>
                  </div>
                  {asyncFinance && (
                    <div className="rec-row-actions">
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleEditCard(c.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleArchiveCard(c.id, c.name)}>
                        Archive
                      </button>
                    </div>
                  )}
                </div>
                {editingCardId === c.id && <AddCardForm editingId={c.id} onClose={() => setEditingCardId(null)} />}
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
