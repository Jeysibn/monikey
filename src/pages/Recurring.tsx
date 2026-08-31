import { useMemo, useState, type FormEvent } from 'react'
import { Card } from '../components/Card'
import { Tag } from '../components/StatusBadge'
import { useFinance } from '../hooks/useFinance'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { dueStateOf, monthlyEquivalent, useRecurring } from '../hooks/useRecurring'
import { formatMoney } from '../utils/currency'
import { parseMoneyInput } from '../utils/money'
import { formatDateLabel, isIsoDateBefore, isValidIsoDate } from '../utils/date'
import type { AddRecurringItemInput, RecurringDueState, RecurringFrequency } from '../domain/recurring'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import './Recurring.css'

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

const FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'yearly']

// Due-date urgency reuses the existing status/tag tone classes from
// StatusBadge.css/global.css (safe/near_limit/over_budget teal-amber-red,
// and the neutral tag tone for a paused item) rather than inventing new
// colors — only the label text is specific to this page, so the badge is
// built directly instead of through the `StatusBadge` component (whose
// labels are fixed to Safe/On Track/Near Limit/Over Budget).
const DUE_STATE_LABEL: Record<RecurringDueState, string> = {
  overdue: 'Overdue',
  due_soon: 'Due Soon',
  scheduled: 'Active',
  paused: 'Paused',
}
const DUE_STATE_CLASS: Record<RecurringDueState, string> = {
  overdue: 'status-badge status-badge--over_budget',
  due_soon: 'status-badge status-badge--near_limit',
  scheduled: 'status-badge status-badge--safe',
  paused: 'tag tag--neutral',
}

function DueBadge({ state }: { state: RecurringDueState }) {
  return <span className={DUE_STATE_CLASS[state]}>{DUE_STATE_LABEL[state]}</span>
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function ResumeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const ITEM_FIELDS = ['merchant', 'amount', 'nextDueDate', 'accountId', 'categoryId'] as const
type ItemField = (typeof ITEM_FIELDS)[number]

function AddRecurringItemForm({
  todayIso,
  onAdd,
  onClose,
}: {
  todayIso: string
  onAdd: (input: AddRecurringItemInput) => void | Promise<void>
  onClose: () => void
}) {
  const finance = useFinance()
  const linkedAccountOptions = [...finance.state.accounts, ...finance.state.creditCards].map((a) => ({
    id: a.id,
    label: finance.accountLabel(a.id),
  }))
  const budgetableCategories = finance.state.categories.filter((c) => c.transactionKinds.includes('expense'))

  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDueDate, setNextDueDate] = useState('')
  const [accountId, setAccountId] = useState(linkedAccountOptions[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(budgetableCategories[0]?.id ?? '')
  const [autopay, setAutopay] = useState(false)
  const { errors, field, errorId, fail, clear } = useFieldErrors<ItemField>(ITEM_FIELDS)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedMerchant = merchant.trim()
    if (!trimmedMerchant) {
      fail({ merchant: 'Merchant name is required.' })
      return
    }
    if (!amount.trim()) {
      fail({ amount: 'Enter an amount greater than zero.' })
      return
    }
    const amountResult = parseMoneyInput(amount)
    if (!amountResult.ok) {
      fail({ amount: amountResult.error })
      return
    }
    if (amountResult.value <= 0) {
      fail({ amount: 'Enter an amount greater than zero.' })
      return
    }
    if (!nextDueDate) {
      fail({ nextDueDate: 'Next due date is required.' })
      return
    }
    if (!isValidIsoDate(nextDueDate)) {
      fail({ nextDueDate: 'Enter a real date.' })
      return
    }
    if (isIsoDateBefore(nextDueDate, todayIso)) {
      fail({ nextDueDate: 'Next due date can’t be in the past.' })
      return
    }
    if (!accountId) {
      fail({ accountId: 'Select a linked account.' })
      return
    }
    if (!categoryId) {
      fail({ categoryId: 'Select a category.' })
      return
    }
    try {
      setSubmitting(true)
      const pending = onAdd({ merchant: trimmedMerchant, amount: amountResult.value, frequency, nextDueDate, accountId, categoryId, autopay })
      if (pending) await pending
      setMerchant('')
      setAmount('')
      setFrequency('monthly')
      setNextDueDate('')
      setAutopay(false)
      clear()
      onClose()
    } catch (err) {
      fail({ merchant: err instanceof Error ? err.message : 'Could not save recurring item.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="new-category-form" onSubmit={handleSubmit} noValidate>
      <label className="new-category-field">
        <span className="tx-label">Merchant</span>
        <input
          type="text"
          className="tx-input"
          value={merchant}
          placeholder="e.g. Netflix"
          autoFocus
          {...field('merchant', (e) => setMerchant(e.target.value))}
        />
        {errors.merchant && (
          <p className="tx-error" role="alert" id={errorId('merchant')}>
            {errors.merchant}
          </p>
        )}
      </label>

      <div className="rec-form-row">
        <label className="new-category-field">
          <span className="tx-label">Amount</span>
          <input
            type="text"
            inputMode="decimal"
            className="tx-input"
            value={amount}
            placeholder="0.00"
            {...field('amount', (e) => setAmount(e.target.value))}
          />
          {errors.amount && (
            <p className="tx-error" role="alert" id={errorId('amount')}>
              {errors.amount}
            </p>
          )}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Frequency</span>
          <select className="tx-input" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="new-category-field">
        <span className="tx-label">Next due date</span>
        <input
          type="date"
          className="tx-input"
          min={todayIso}
          value={nextDueDate}
          {...field('nextDueDate', (e) => setNextDueDate(e.target.value))}
        />
        {errors.nextDueDate && (
          <p className="tx-error" role="alert" id={errorId('nextDueDate')}>
            {errors.nextDueDate}
          </p>
        )}
      </label>

      <div className="rec-form-row">
        <label className="new-category-field">
          <span className="tx-label">Linked account</span>
          <select
            className="tx-input"
            value={accountId}
            aria-label="Linked account"
            {...field('accountId', (e) => setAccountId(e.target.value))}
          >
            {linkedAccountOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <p className="tx-error" role="alert" id={errorId('accountId')}>
              {errors.accountId}
            </p>
          )}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Category</span>
          <select
            className="tx-input"
            value={categoryId}
            aria-label="Category"
            {...field('categoryId', (e) => setCategoryId(e.target.value))}
          >
            {budgetableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="tx-error" role="alert" id={errorId('categoryId')}>
              {errors.categoryId}
            </p>
          )}
        </label>
      </div>

      <label className="rec-autopay-field">
        <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
        <span className="tx-label">Autopay — charged automatically, no manual action needed</span>
      </label>

      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Add recurring item'}
        </button>
      </div>
    </form>
  )
}

export function Recurring() {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const localRecurring = useRecurring()
  const items = asyncFinance ? asyncFinance.recurringItems : localRecurring.items
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const todayIso = finance.todayIso

  const handleAdd = (input: AddRecurringItemInput) => {
    setActionError(null)
    if (asyncFinance) return asyncFinance.addRecurringItem(input).then(() => undefined)
    localRecurring.addItem(input)
  }
  const handleStatus = async (id: string, status: 'active' | 'paused') => {
    setBusyId(id)
    setActionError(null)
    try {
      if (asyncFinance) await asyncFinance.setRecurringStatus(id, status)
      else if (status === 'active') localRecurring.resumeItem(id)
      else localRecurring.pauseItem(id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update recurring item.')
    } finally { setBusyId(null) }
  }
  const handlePaid = async (id: string) => {
    setBusyId(id)
    setActionError(null)
    try {
      if (asyncFinance) await asyncFinance.markRecurringPaid(id)
      else localRecurring.markAsPaid(id, todayIso)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not mark recurring item as paid.')
    } finally { setBusyId(null) }
  }

  const rows = useMemo(
    () =>
      items
        .map((item) => ({ item, dueState: dueStateOf(item, todayIso) }))
        .sort((a, b) => (a.item.nextDueDate < b.item.nextDueDate ? -1 : a.item.nextDueDate > b.item.nextDueDate ? 1 : 0)),
    [items, todayIso],
  )

  const activeItems = items.filter((i) => i.status === 'active')
  const pausedCount = items.length - activeItems.length
  const monthlyTotal = activeItems.reduce((sum, i) => sum + monthlyEquivalent(i.amount, i.frequency), 0)
  const dueSoonCount = activeItems.filter((i) => {
    const state = dueStateOf(i, todayIso)
    return state === 'due_soon' || state === 'overdue'
  }).length

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Recurring &amp; Bills</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Monthly Recurring Spend</div>
          <div className="num kpi-val">{formatMoney(monthlyTotal, { withCents: false })}</div>
          <div className="budget-meta">Weekly and yearly items normalized to a monthly equivalent</div>
        </Card>
        <Card>
          <div className="eyebrow">Due in Next 7 Days</div>
          <div className="num kpi-val">{dueSoonCount} items</div>
          <div className="budget-meta">Includes anything already overdue</div>
        </Card>
        <Card>
          <div className="eyebrow">Active</div>
          <div className="num kpi-val">{activeItems.length} items</div>
        </Card>
        <Card>
          <div className="eyebrow">Paused</div>
          <div className="num kpi-val">{pausedCount} items</div>
        </Card>
      </div>

      <Card>
        <div className="section-head">
          <span className="card-title-text">Recurring Items</span>
          <button type="button" className="add-link" aria-expanded={formOpen} onClick={() => setFormOpen((v) => !v)}>
            <PlusIcon /> New recurring item
          </button>
        </div>

        {actionError && <p className="tx-error" role="alert">{actionError}</p>}

        {formOpen && (
          <AddRecurringItemForm todayIso={todayIso} onAdd={handleAdd} onClose={() => setFormOpen(false)} />
        )}

        {rows.length === 0 ? (
          <p className="faint">No recurring items yet.</p>
        ) : (
          <ul className="rec-list">
            {rows.map(({ item, dueState }) => (
              <li className="rec-row" key={item.id}>
                <div className="rec-row-main">
                  <div className="rec-row-top">
                    <span className="rec-merchant">{item.merchant}</span>
                    <span
                      className="tx-tag"
                      style={{
                        color: finance.categoryColor(item.categoryId),
                        background: `color-mix(in oklch, ${finance.categoryColor(item.categoryId)} 16%, transparent)`,
                      }}
                    >
                      {finance.categoryName(item.categoryId)}
                    </span>
                    {item.autopay && <Tag tone="cleared">Autopay</Tag>}
                  </div>
                  <div className="rec-row-meta">
                    <span className="tx-acct">
                      <span className="tx-acct-dot" style={{ background: finance.accountDotColor(item.accountId) }} />
                      <span className="faint">{finance.accountLabel(item.accountId)}</span>
                    </span>
                    <span className="faint">{FREQUENCY_LABEL[item.frequency]}</span>
                    <span className="faint">Next due {formatDateLabel(item.nextDueDate)}</span>
                    {item.lastPaidDate && <span className="faint">Last paid {formatDateLabel(item.lastPaidDate)}</span>}
                  </div>
                </div>

                <div className="num rec-row-amt">{formatMoney(item.amount)}</div>

                <DueBadge state={dueState} />

                <div className="rec-row-actions">
                  {item.status === 'active' ? (
                    <button type="button" className="btn btn--ghost btn--compact" disabled={busyId === item.id} onClick={() => void handleStatus(item.id, 'paused')}>
                      <PauseIcon /> Pause
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--compact" disabled={busyId === item.id} onClick={() => void handleStatus(item.id, 'active')}>
                      <ResumeIcon /> Resume
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--primary btn--compact"
                    disabled={item.status === 'paused' || busyId === item.id}
                    onClick={() => void handlePaid(item.id)}
                  >
                    <CheckIcon /> Mark as paid
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
