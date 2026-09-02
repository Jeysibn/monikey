import { useMemo, useState } from 'react'
import { Card } from '../components/Card'
import { Tag } from '../components/StatusBadge'
import { useFinance } from '../hooks/useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { formatMoney } from '../utils/currency'
import { formatDateLabel, formatTimeLabel } from '../utils/date'
import type { TransactionType, Transaction } from '../domain/finance'
import './Transactions.css'

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}

export function Transactions({ onAddTransaction, onEditTransaction }: { onAddTransaction: () => void; onEditTransaction?: (tx: Transaction) => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const { transactions } = finance.state
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (search && !finance.transactionMatchesSearch(t, search)) return false
      return true
    })
  }, [transactions, search, typeFilter, finance])

  const handleEdit = (transaction: typeof transactions[0]) => {
    if (onEditTransaction) {
      onEditTransaction(transaction)
    }
  }

  const handleDelete = async (transactionId: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction? This action creates a reversal entry for audit purposes.')) {
      return
    }
    setBusyId(transactionId)
    try {
      if (asyncFinance) {
        await asyncFinance.reverseTransaction(transactionId)
      } else {
        finance.reverseTransaction(transactionId)
      }
    } catch (err) {
      console.error('Failed to delete transaction:', err)
      window.alert('Failed to delete transaction. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="transactions-page">
      <div className="page-head">
        <h1 className="page-title">Transactions</h1>
        <button type="button" className="btn btn--primary" onClick={onAddTransaction}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Transaction
        </button>
      </div>

      <div className="toolbar">
        <label className="search-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="visually-hidden">Search transactions</span>
          <input
            type="search"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          aria-label="Filter by type"
        >
          <option value="all">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Income · {finance.activePeriodLabel}</div>
          <div className="num kpi-val">{formatMoney(finance.totalIncome)}</div>
        </Card>
        <Card>
          <div className="eyebrow">Expenses · {finance.activePeriodLabel}</div>
          <div className="num kpi-val">{formatMoney(finance.totalExpenses)}</div>
        </Card>
        <Card>
          <div className="eyebrow">Net Cash Flow · {finance.activePeriodLabel}</div>
          <div className="num kpi-val">{formatMoney(finance.netCashFlow)}</div>
          <div className="faint">income − expenses</div>
        </Card>
        <Card>
          <div className="eyebrow">Transactions</div>
          <div className="num kpi-val">{transactions.length} total</div>
          <div className="faint">{finance.transferCount} transfer excluded from cash flow</div>
        </Card>
      </div>

      <Card className="tx-card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No matching transactions</p>
            <p className="faint">Try changing your filters or search terms.</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="full-tx-table" role="table" aria-label="Transactions">
            <div className="tx-grid-row tx-grid-head" role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Transaction</span>
              <span role="columnheader" className="tx-col-center">
                Category
              </span>
              <span role="columnheader">Account</span>
              <span role="columnheader">Type</span>
              <span role="columnheader" className="tx-col-right">
                Amount
              </span>
              <span role="columnheader">Status</span>
              <span role="columnheader" className="tx-col-center">Actions</span>
            </div>
            {filtered.map((t) => (
              <div className="tx-grid-row" role="row" key={t.id}>
                <span role="cell" className="faint">
                  {formatDateLabel(t.date)}
                </span>
                <span role="cell">
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div className="tx-meta">
                    {finance.transactionSourceLabel(t)}
                    {t.time ? ` · ${formatTimeLabel(t.time)}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                  {finance.transferFeeReconciliationLabel(t) && (
                    <div className="tx-meta">{finance.transferFeeReconciliationLabel(t)}</div>
                  )}
                  {finance.cardPaymentReconciliationLabel(t) && (
                    <div className="tx-meta">{finance.cardPaymentReconciliationLabel(t)}</div>
                  )}
                </span>
                <span role="cell" className="tx-col-center">
                  {t.categoryId ? (
                    <span
                      className="tx-tag"
                      style={{ color: finance.categoryColor(t.categoryId), background: `color-mix(in oklch, ${finance.categoryColor(t.categoryId)} 16%, transparent)` }}
                    >
                      {finance.categoryName(t.categoryId)}
                    </span>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </span>
                <span role="cell">
                  <span className="tx-acct">
                    <span className="tx-acct-dot" style={{ background: finance.transactionAccountDotColor(t) }} />
                    <span className="faint">{finance.transactionAccountLabel(t)}</span>
                  </span>
                </span>
                <span role="cell">
                  <Tag tone={t.type}>{TYPE_LABEL[t.type]}</Tag>
                </span>
                <span role="cell" className={`num tx-col-right ${t.type === 'transfer' ? 'tx-amt-neutral' : t.amount < 0 ? 'tx-amt-out' : 'tx-amt-in'}`}>
                  {formatMoney(t.amount)}
                </span>
                <span role="cell">
                  <Tag tone={t.status}>{t.status === 'cleared' ? 'Cleared' : 'Pending'}</Tag>
                </span>
                <span role="cell" className="tx-col-center">
                  <div className="rec-row-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--compact"
                      disabled={busyId === t.id}
                      onClick={() => handleEdit(t)}
                      title="Edit transaction"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94m-4.75-4.75L19.5 3.5c.39-.39 1.02-.39 1.41 0l2.59 2.59c.39.39.39 1.02 0 1.41L14.5 10.94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--compact"
                      disabled={busyId === t.id}
                      onClick={() => handleDelete(t.id)}
                      title="Delete transaction"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Below the tablet breakpoint the grid/table above is hidden by CSS
          and this stacked card list is shown instead — FR-007 explicitly
          rules out a horizontally-scrolling table as the only mobile
          experience. */}
      {filtered.length > 0 && (
        <ul className="tx-mobile-list">
          {filtered.map((t) => (
            <li className="tx-mobile-card" key={t.id}>
              <div className="tx-mobile-top">
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div className="tx-meta">
                    {formatDateLabel(t.date)}
                    {t.time ? ` · ${formatTimeLabel(t.time)}` : ''}
                    {' · '}
                    {finance.transactionSourceLabel(t)}
                  </div>
                  {finance.transferFeeReconciliationLabel(t) && (
                    <div className="tx-meta">{finance.transferFeeReconciliationLabel(t)}</div>
                  )}
                  {finance.cardPaymentReconciliationLabel(t) && (
                    <div className="tx-meta">{finance.cardPaymentReconciliationLabel(t)}</div>
                  )}
                </div>
                <span className={`num tx-mobile-amt ${t.type === 'transfer' ? 'tx-amt-neutral' : t.amount < 0 ? 'tx-amt-out' : 'tx-amt-in'}`}>
                  {formatMoney(t.amount)}
                </span>
              </div>
              <div className="tx-mobile-meta">
                {t.categoryId && (
                  <span
                    className="tx-tag"
                    style={{ color: finance.categoryColor(t.categoryId), background: `color-mix(in oklch, ${finance.categoryColor(t.categoryId)} 16%, transparent)` }}
                  >
                    {finance.categoryName(t.categoryId)}
                  </span>
                )}
                <Tag tone={t.type}>{TYPE_LABEL[t.type]}</Tag>
                <Tag tone={t.status}>{t.status === 'cleared' ? 'Cleared' : 'Pending'}</Tag>
              </div>
              <div className="tx-acct">
                <span className="tx-acct-dot" style={{ background: finance.transactionAccountDotColor(t) }} />
                <span className="faint">{finance.transactionAccountLabel(t)}</span>
              </div>
              <div className="rec-row-actions" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  disabled={busyId === t.id}
                  onClick={() => handleEdit(t)}
                  title="Edit transaction"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.81 9.94m-4.75-4.75L19.5 3.5c.39-.39 1.02-.39 1.41 0l2.59 2.59c.39.39.39 1.02 0 1.41L14.5 10.94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  disabled={busyId === t.id}
                  onClick={() => handleDelete(t.id)}
                  title="Delete transaction"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
                  </svg>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
