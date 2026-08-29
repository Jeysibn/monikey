import { useMemo, useState } from 'react'
import { Card } from '../components/Card'
import { Tag } from '../components/StatusBadge'
import {
  formatMoney,
  netCashFlow,
  totalExpenses,
  totalIncome,
  transactions,
  transferCount,
  type TransactionType,
} from '../data/mockData'
import './Transactions.css'

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}

export function Transactions({ onAddTransaction }: { onAddTransaction: () => void }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [search, typeFilter])

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
          <div className="eyebrow">Income</div>
          <div className="num kpi-val">{formatMoney(totalIncome)}</div>
          <div className="faint">this month</div>
        </Card>
        <Card>
          <div className="eyebrow">Expenses</div>
          <div className="num kpi-val">{formatMoney(totalExpenses)}</div>
          <div className="faint">this month</div>
        </Card>
        <Card>
          <div className="eyebrow">Net Cash Flow</div>
          <div className="num kpi-val">{formatMoney(netCashFlow)}</div>
          <div className="faint">income − expenses</div>
        </Card>
        <Card>
          <div className="eyebrow">Transactions</div>
          <div className="num kpi-val">{transactions.length} total</div>
          <div className="faint">{transferCount} transfer excluded from cash flow</div>
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
          <table className="full-tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction</th>
                <th>Category</th>
                <th>Account</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="faint">{t.date}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="faint" style={{ fontSize: 10.5 }}>
                      {t.source === 'ocr' ? 'OCR receipt' : t.source === 'recurring' ? 'Recurring' : 'Manual'}
                      {t.time ? ` · ${t.time}` : ''}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                  </td>
                  <td>{t.category ? <Tag tone="neutral">{t.category}</Tag> : <span className="faint">—</span>}</td>
                  <td className="faint">{t.accountLabel}</td>
                  <td>
                    <Tag tone={t.type}>{TYPE_LABEL[t.type]}</Tag>
                  </td>
                  <td className={`num ${t.type === 'transfer' ? 'tx-amt-neutral' : t.amount < 0 ? 'tx-amt-out' : 'tx-amt-in'}`}>
                    {formatMoney(t.amount)}
                  </td>
                  <td>
                    <Tag tone={t.status}>{t.status === 'cleared' ? 'Cleared' : 'Pending'}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
