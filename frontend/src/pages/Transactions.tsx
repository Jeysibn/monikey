import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import { TagPicker } from '../components/TagPicker'
import { useConfirm } from '../hooks/useConfirm'
import { Tag } from '../components/StatusBadge'
import { useFinance } from '../hooks/useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { formatMoney, formatMoneyValue } from '../utils/currency'
import { formatDateLabel, formatTimeLabel } from '../utils/date'
import type { TransactionType, Transaction } from '../domain/finance'
import type { paths } from '../api.generated'
import './Transactions.css'

const TYPE_LABEL: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}
type ApiTag = paths['/tags']['get']['responses'][200]['content']['application/json'][number]

export function Transactions({ onAddTransaction, onEditTransaction }: { onAddTransaction: () => void; onEditTransaction?: (tx: Transaction) => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const { transactions } = finance.state
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>((searchParams.get('type') as 'all' | TransactionType | null) ?? 'all')
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') ?? '')
  const [accountFilter, setAccountFilter] = useState(searchParams.get('account') ?? '')
  const [fromFilter, setFromFilter] = useState(searchParams.get('from') ?? '')
  const [toFilter, setToFilter] = useState(searchParams.get('to') ?? '')
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') ?? '')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<ApiTag[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [tagEditor, setTagEditor] = useState<Transaction | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  useEffect(() => {
    if (!asyncFinance) return
    fetch('/api/v1/tags', { credentials: 'include' }).then((response) => response.ok ? response.json() as Promise<ApiTag[]> : Promise.reject(new Error('tags unavailable'))).then(setAvailableTags).catch(() => undefined)
  }, [asyncFinance])

  // A "deleted" transaction isn't hard-removed on the backend — it's reversed
  // by creating a compensating entry that nets it to zero (audit trail). Hide
  // both the now-reversed original and its compensating entry from the
  // active list so a delete reads as "gone", not as a duplicated row.
  const reversalPairIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of transactions) {
      if (t.reversedTransactionId) {
        ids.add(t.id)
        ids.add(t.reversedTransactionId)
      }
    }
    return ids
  }, [transactions])

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (reversalPairIds.has(t.id)) return false
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter && t.categoryId !== categoryFilter) return false
      if (accountFilter && t.accountId !== accountFilter) return false
      if (fromFilter && t.date < fromFilter) return false
      if (toFilter && t.date > toFilter) return false
      if (tagFilter && !(t.tags ?? []).includes(tagFilter)) return false
      if (search && !finance.transactionMatchesSearch(t, search)) return false
      return true
    })
  }, [transactions, search, typeFilter, categoryFilter, accountFilter, fromFilter, toFilter, tagFilter, finance, reversalPairIds])

  function updateUrl(name: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value); else next.delete(name)
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    setSearch(''); setTypeFilter('all'); setCategoryFilter(''); setAccountFilter(''); setFromFilter(''); setToFilter(''); setTagFilter('')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const handleEdit = (transaction: typeof transactions[0]) => {
    if (onEditTransaction) {
      onEditTransaction(transaction)
    }
  }

  const handleDelete = async (transactionId: string) => {
    if (!await confirm({ title: 'Delete transaction?', message: 'The transaction will be reversed for audit purposes and removed from this active list.', confirmLabel: 'Delete transaction' })) {
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
      setActionError('Failed to delete transaction. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleTags(transaction: Transaction, value: string) {
    if (!asyncFinance) return
    const names = [...new Set(value.split(',').map((name) => name.trim()).filter(Boolean))]
    const tagIds = names.map((name) => availableTags.find((tag) => tag.name === name)?.id).filter((id): id is string => Boolean(id))
    if (tagIds.length !== names.length) throw new Error('Create each tag first from the Tags page.')
    setBusyId(transaction.id)
    try {
      const response = await fetch(`/api/v1/transactions/${transaction.id}/tags`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tagIds }) })
      if (!response.ok) throw new Error('Could not update tags')
      window.location.reload()
    } finally { setBusyId(null) }
  }

  return (
    <div className="transactions-page">
      <PageHeader title="Transactions" description="Review, filter, and reconcile every movement in your ledger." action={<button type="button" className="btn btn--primary" onClick={onAddTransaction}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Transaction
        </button>} />

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
            onChange={(e) => { setSearch(e.target.value); updateUrl('q', e.target.value) }}
          />
        </label>
        <label className="filter-control"><span>Type</span><select aria-label="Filter by type" className="filter-select" value={typeFilter} onChange={(e) => { const value = e.target.value as typeof typeFilter; setTypeFilter(value); updateUrl('type', value === 'all' ? '' : value) }}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select></label>
        <label className="filter-control"><span>Category</span><select aria-label="Transaction category filter" className="filter-select" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); updateUrl('category', e.target.value) }}><option value="">All categories</option>{finance.state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="filter-control"><span>Account</span><select aria-label="Transaction account filter" className="filter-select" value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); updateUrl('account', e.target.value) }}><option value="">All accounts</option>{finance.state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="filter-control filter-date"><span>From</span><input aria-label="Transaction from date" type="date" value={fromFilter} onChange={(e) => { setFromFilter(e.target.value); updateUrl('from', e.target.value) }} /></label>
        <label className="filter-control filter-date"><span>To</span><input aria-label="Transaction to date" type="date" value={toFilter} onChange={(e) => { setToFilter(e.target.value); updateUrl('to', e.target.value) }} /></label>
        <label className="filter-control"><span>Tag</span><input aria-label="Transaction tag filter" value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); updateUrl('tag', e.target.value) }} placeholder="Any tag" /></label>
      </div>

      {(search || typeFilter !== 'all' || categoryFilter || accountFilter || fromFilter || toFilter || tagFilter) && <div className="active-filters" aria-label="Active transaction filters"><span className="active-filters-label">Filtered by</span>{search && <button type="button" className="filter-chip" onClick={() => { setSearch(''); updateUrl('q', '') }}>Search: {search} ×</button>}{typeFilter !== 'all' && <button type="button" className="filter-chip" onClick={() => { setTypeFilter('all'); updateUrl('type', '') }}>Type: {TYPE_LABEL[typeFilter]} ×</button>}{categoryFilter && <button type="button" className="filter-chip" onClick={() => { setCategoryFilter(''); updateUrl('category', '') }}>Category: {finance.state.categories.find((category) => category.id === categoryFilter)?.name ?? categoryFilter} ×</button>}{accountFilter && <button type="button" className="filter-chip" onClick={() => { setAccountFilter(''); updateUrl('account', '') }}>Account: {finance.state.accounts.find((account) => account.id === accountFilter)?.name ?? accountFilter} ×</button>}{fromFilter && <button type="button" className="filter-chip" onClick={() => { setFromFilter(''); updateUrl('from', '') }}>From: {fromFilter} ×</button>}{toFilter && <button type="button" className="filter-chip" onClick={() => { setToFilter(''); updateUrl('to', '') }}>To: {toFilter} ×</button>}{tagFilter && <button type="button" className="filter-chip" onClick={() => { setTagFilter(''); updateUrl('tag', '') }}>Tag: {tagFilter} ×</button>}<button type="button" className="clear-filters" onClick={clearFilters}>Clear all</button></div>}
      {actionError && <p className="tx-error" role="alert">{actionError}</p>}

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
                clearFilters()
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
                  {formatMoneyValue(t.amount, t.amountMinor)}
                </span>
                <span role="cell">
                  <Tag tone={t.status}>{t.status === 'cleared' ? 'Cleared' : 'Pending'}</Tag>
                </span>
                <span role="cell" className="tx-col-center">
                  <div className="tx-row-actions">
                    {asyncFinance && <button type="button" className="btn btn--ghost btn--compact tx-icon-btn" disabled={busyId === t.id} onClick={() => setTagEditor(t)} title="Edit tags" aria-label="Edit tags">#</button>}
                    <button
                      type="button"
                      className="btn btn--ghost btn--compact tx-icon-btn"
                      disabled={busyId === t.id}
                      onClick={() => handleEdit(t)}
                      title="Edit transaction"
                      aria-label="Edit transaction"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94m-4.75-4.75L19.5 3.5c.39-.39 1.02-.39 1.41 0l2.59 2.59c.39.39.39 1.02 0 1.41L14.5 10.94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--compact tx-icon-btn tx-icon-btn--danger"
                      disabled={busyId === t.id}
                      onClick={() => handleDelete(t.id)}
                      title="Delete transaction"
                      aria-label="Delete transaction"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
                      </svg>
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
                  {formatMoneyValue(t.amount, t.amountMinor)}
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
              <div className="tx-mobile-actions">
                {asyncFinance && <button type="button" className="btn btn--ghost btn--compact" disabled={busyId === t.id} onClick={() => setTagEditor(t)}>Edit tags</button>}
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
                  className="btn btn--ghost btn--compact btn--danger-ghost"
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
      {tagEditor && <TagPicker key={tagEditor.id} transaction={tagEditor} initialValue={(tagEditor.tags ?? []).map((tag) => availableTags.find((item) => item.id === tag)?.name ?? tag).join(', ')} open onSave={(value) => handleTags(tagEditor, value)} onClose={() => setTagEditor(null)} />}
      {confirmDialog}
    </div>
  )
}
