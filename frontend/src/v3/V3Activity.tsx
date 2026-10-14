import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useFinance } from '../hooks/useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { transactionAccountLabel } from '../state/financeSelectors'
import type { FinanceState, Transaction } from '../domain/finance'
import { formatDateLabel, formatTimeLabel } from '../utils/date'
import { formatMinorUnits } from '../utils/currency'
import { exactMinor } from '../utils/money'
import {
  activeFilterCount, activityKind, applyFilters, groupByDate, isReversalPart, KIND_LABEL, parseFilters,
  type ActivityFilters, type ActivityKind, type ActivitySort,
} from './activityModel'
import { useActivityFeed, useTransactionById } from './useActivityFeed'
import { useMediaQuery } from './useMediaQuery'
import { useQuickAdd } from './quickAddContext'
import { V3_ROUTES } from './v3Preview'
import './V3Activity.css'

const money = (minor: bigint) => formatMinorUnits(minor, { withCents: true })

const COLUMNS: { id: string; label: string; sort?: ActivitySort }[] = [
  { id: 'date', label: 'Date', sort: 'date' }, { id: 'description', label: 'Description' }, { id: 'category', label: 'Category' },
  { id: 'account', label: 'Account' }, { id: 'type', label: 'Type' }, { id: 'amount', label: 'Amount', sort: 'amount' },
]

/** Signed display. Transfers and card repayments move money between your own accounts, so they carry no +/- sign. */
function amountView(state: FinanceState, t: Transaction): { text: string; tone: string } {
  const m = exactMinor(t.amountMinor, t.amount)
  const kind = activityKind(state, t)
  if (kind === 'transfer' || kind === 'repayment') return { text: money(m < 0n ? -m : m), tone: '' }
  if (kind === 'income') return { text: `+${money(m < 0n ? -m : m)}`, tone: 'v3-figure--positive' }
  return { text: money(m > 0n ? -m : m), tone: '' }
}

function KindBadge({ kind, reversed }: { kind: ActivityKind; reversed: boolean }) {
  return (
    <span className="v3-act-badges">
      <span className={`v3-act-badge v3-act-badge--${kind}`}>{KIND_LABEL[kind]}</span>
      {reversed && <span className="v3-act-badge v3-act-badge--reversed">Reversed pair</span>}
    </span>
  )
}

function AccountRefs({ state, t }: { state: FinanceState; t: Transaction }) {
  const link = (id: string | undefined) => (id && (state.accounts.some((a) => a.id === id) || state.creditCards.some((c) => c.id === id))
    ? <Link className="v3-link" to={`${V3_ROUTES.accounts}?account=${id}`}>{transactionAccountLabel(state, { ...t, type: 'expense', accountId: id })}</Link>
    : <span>{transactionAccountLabel(state, { ...t, type: 'expense', accountId: id })}</span>)
  if (t.type === 'transfer') return <>{link(t.fromAccountId)} → {t.goalId ? <span>{state.goals.find((g) => g.id === t.goalId)?.name ?? 'goal'}</span> : link(t.toAccountId)}</>
  return link(t.accountId)
}

function Filters({ filters, state, onChange, onClear, open, id }: { filters: ActivityFilters; state: FinanceState; onChange: (next: ActivityFilters, push?: boolean) => void; onClear: () => void; open: boolean; id: string }) {
  if (!open) return null
  const set = (patch: Partial<ActivityFilters>) => onChange({ ...filters, ...patch })
  const accounts = [...state.accounts.map((a) => ({ id: a.id, label: a.name })), ...state.creditCards.map((c) => ({ id: c.id, label: `${c.name} (card)` }))]
  return (
    <div className="v3-card v3-act-filters" id={id} role="group" aria-label="Filters">
      <div className="v3-field"><label className="v3-label" htmlFor="v3-f-type">Type</label>
        <select id="v3-f-type" className="v3-input" value={filters.type} onChange={(e) => set({ type: e.target.value as ActivityFilters['type'] })}>
          <option value="">All types</option><option value="expense">Expenses (incl. card charges)</option><option value="income">Income</option><option value="transfer">Transfers (incl. card repayments)</option>
        </select></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-f-account">Account</label>
        <select id="v3-f-account" className="v3-input" value={filters.account} onChange={(e) => set({ account: e.target.value })}>
          <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-f-category">Category</label>
        <select id="v3-f-category" className="v3-input" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">All categories</option>{state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-f-from">From</label><input id="v3-f-from" type="date" className="v3-input" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-f-to">To</label><input id="v3-f-to" type="date" className="v3-input" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-f-sort">Sort by</label>
        <select id="v3-f-sort" className="v3-input" value={`${filters.sort}:${filters.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':') as [ActivitySort, 'asc' | 'desc']; set({ sort, dir }) }}>
          <option value="date:desc">Newest first</option><option value="date:asc">Oldest first</option>
          <option value="amount:desc">Amount: largest first</option><option value="amount:asc">Amount: smallest first</option>
        </select></div>
      <label className="v3-act-check"><input type="checkbox" checked={filters.showReversed} onChange={(e) => set({ showReversed: e.target.checked })} /> Show reversed transactions (audit trail)</label>
      <button type="button" className="v3-btn v3-btn--secondary" onClick={onClear}>Clear filters</button>
    </div>
  )
}

function Detail({ state, t, onClose, onEdit, onReverse, busy, error }: { state: FinanceState; t: Transaction; onClose: () => void; onEdit: () => void; onReverse: () => void; busy: boolean; error: string | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [t.id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const kind = activityKind(state, t)
  const amount = amountView(state, t)
  const reversed = isReversalPart(t)
  const category = t.type === 'transfer' ? null : state.categories.find((c) => c.id === t.categoryId)?.name ?? 'Uncategorized'
  return (
    <aside className="v3-card v3-act-detail" role="region" aria-labelledby="v3-act-detail-title" data-testid="v3-activity-detail">
      <div className="v3-act-detail__head">
        <h2 id="v3-act-detail-title" className="v3-h2" tabIndex={-1} ref={headingRef}>{t.title}</h2>
        <button type="button" className="v3-btn v3-btn--ghost" onClick={onClose} aria-label="Close transaction details">Close</button>
      </div>
      <p className={`v3-figure v3-figure--lg ${amount.tone}`}>{amount.text}</p>
      <KindBadge kind={kind} reversed={reversed} />
      <dl className="v3-act-dl">
        <div><dt>Date</dt><dd>{formatDateLabel(t.date)} {t.date.slice(0, 4)}{formatTimeLabel(t.time) ? ` · ${formatTimeLabel(t.time)}` : ''}</dd></div>
        <div><dt>Status</dt><dd>{t.status === 'pending' ? 'Pending (not yet counted in reports)' : 'Cleared'}</dd></div>
        {category && <div><dt>Category</dt><dd>{category}</dd></div>}
        <div><dt>{t.type === 'transfer' ? 'Accounts' : 'Account'}</dt><dd><AccountRefs state={state} t={t} /></dd></div>
        {t.fee ? <div><dt>Fee</dt><dd>{money(exactMinor(t.feeMinor, t.fee))}</dd></div> : null}
        {t.note && <div><dt>Note</dt><dd>{t.note}</dd></div>}
        {t.tags && t.tags.length > 0 && <div><dt>Tags</dt><dd>{t.tags.join(', ')}</dd></div>}
        <div><dt>Source</dt><dd>{t.source}</dd></div>
      </dl>
      {reversed && (
        <p className="v3-secondary" data-testid="v3-reversal-note">
          This entry is part of a reversal pair. Both entries stay on the ledger for audit and are excluded from spending and income.{' '}
          {t.reversedTransactionId && <Link className="v3-link" to={`?tx=${t.reversedTransactionId}`}>View the paired entry</Link>}
        </p>
      )}
      {error && <p role="alert" className="v3-secondary v3-act-error">{error}</p>}
      <div className="v3-page-actions">
        <button type="button" className="v3-btn v3-btn--secondary" onClick={onEdit} disabled={reversed || busy}>Edit</button>
        <button type="button" className="v3-btn v3-btn--secondary" onClick={onReverse} disabled={reversed || busy}>{busy ? 'Reversing…' : 'Reverse'}</button>
      </div>
    </aside>
  )
}

export function V3Activity({ onEditTransaction }: { onEditTransaction?: (tx: Transaction) => void }) {
  const finance = useFinance()
  const quickAdd = useQuickAdd()
  const { state } = finance
  const asyncFinance = useAsyncFinanceOptional()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(params), [params])
  const selectedId = params.get('tx')
  const wide = useMediaQuery('(min-width: 900px)')
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(parseFilters(params)) > 0)
  const [searchText, setSearchText] = useState(filters.q)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const feed = useActivityFeed(state, filters, state.transactions)
  const selected = useTransactionById(state, selectedId, feed.rows)

  // Keep the search box in step with Back/Forward and external links.
  useEffect(() => { setSearchText(filters.q) }, [filters.q])
  // Debounced search: typing replaces the current history entry; discrete filter changes push one.
  useEffect(() => {
    if (searchText.trim() === filters.q.trim()) return
    const handle = setTimeout(() => setParams(applyFilters(params, { ...filters, q: searchText }), { replace: true }), 300)
    return () => clearTimeout(handle)
  }, [searchText, filters, params, setParams])

  const update = (next: ActivityFilters) => setParams(applyFilters(params, next))
  const clear = () => { const keep = new URLSearchParams(); const tx = params.get('tx'); if (tx) keep.set('tx', tx); setSearchText(''); setParams(keep) }
  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('tx', id); else next.delete('tx')
    setActionError(null); setNotice(null)
    setParams(next)
  }

  const rows = feed.rows
  const groups = useMemo(() => (filters.sort === 'date' ? groupByDate(rows) : [{ date: '', rows }]), [rows, filters.sort])
  const count = activeFilterCount(filters)
  const detailTx = selected.tx

  async function reverse(t: Transaction) {
    if (!await confirm({ title: 'Reverse transaction?', message: 'A compensating entry is created. Both stay on the ledger for audit and are excluded from spending and income.', confirmLabel: 'Reverse transaction' })) return
    setBusy(true); setActionError(null)
    try {
      if (asyncFinance) await asyncFinance.reverseTransaction(t.id)
      else finance.reverseTransaction(t.id)
      setNotice(`“${t.title}” was reversed. Turn on “Show reversed” to see the audit trail.`)
      const next = new URLSearchParams(params); next.delete('tx'); setParams(next, { replace: true })
    } catch {
      setActionError('Could not reverse this transaction. Nothing was changed; please try again.')
    } finally { setBusy(false) }
  }

  const detail = selectedId && (
    selected.status === 'loading' ? <div className="v3-card v3-act-detail" role="status">Loading transaction…</div>
      : detailTx ? <Detail state={state} t={detailTx} onClose={() => select(null)} onEdit={() => onEditTransaction?.(detailTx)} onReverse={() => void reverse(detailTx)} busy={busy} error={actionError} />
        : <div className="v3-card v3-act-detail" role="alert"><p>This transaction could not be found. It may have been removed or belong to another account.</p><button type="button" className="v3-btn v3-btn--secondary" onClick={() => select(null)}>Close</button></div>
  )

  return (
    <>
      <div className="v3-page-head">
        <h1 className="v3-h1">Activity</h1>
        <p className="v3-secondary">Every movement in your ledger. Transfers and card repayments are shown but never counted as spending.</p>
      </div>
      {asyncFinance?.offline && <p className="v3-card v3-ov-banner" role="status">You are offline. Showing the last synced data; new changes are queued, not posted.</p>}
      <div className="v3-act-toolbar">
        <div className="v3-field v3-act-search">
          <label className="v3-label v3-visually-hidden" htmlFor="v3-act-q">Search transactions</label>
          <input id="v3-act-q" type="search" className="v3-input" placeholder="Search merchant or note" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <button type="button" className="v3-btn v3-btn--secondary" aria-expanded={filtersOpen} aria-controls="v3-act-filters" onClick={() => setFiltersOpen((o) => !o)}>
          Filters{count > 0 ? ` (${count})` : ''}
        </button>
      </div>
      <Filters filters={filters} state={state} onChange={update} onClear={clear} open={filtersOpen} id="v3-act-filters" />
      {filters.account && <p className="v3-secondary" data-testid="v3-act-account-chip">Showing activity for <strong>{state.accounts.find((a) => a.id === filters.account)?.name ?? state.creditCards.find((c) => c.id === filters.account)?.name ?? 'an unknown account'}</strong>. <Link className="v3-link" to={`${V3_ROUTES.accounts}?account=${filters.account}`}>Open account</Link></p>}
      {notice && <p className="v3-card v3-ov-banner" role="status">{notice}</p>}

      <div className={`v3-act-layout ${detail ? 'has-detail' : ''}`}>
        <section aria-label="Transactions" className="v3-act-main">
          {feed.status === 'loading' && <div className="v3-skeleton" role="status" aria-label="Loading transactions" />}
          {feed.status === 'error' && <div className="v3-card" role="alert"><p>Transactions could not be loaded. Your data is unchanged.</p><button type="button" className="v3-btn v3-btn--secondary" onClick={feed.retry}>Try again</button></div>}
          {feed.status === 'ready' && rows.length === 0 && (
            <div className="v3-card" data-testid="v3-act-empty">
              <p>{count > 0 ? 'No transactions match these filters.' : 'No transactions yet. Use Add to record your first one.'}</p>
              {count === 0 && <button type="button" className="v3-btn v3-btn--primary" onClick={() => quickAdd.open()}>Add a transaction</button>}
              {count > 0 && <button type="button" className="v3-btn v3-btn--secondary" onClick={clear}>Clear filters</button>}
            </div>
          )}
          {feed.status === 'ready' && rows.length > 0 && (wide
            ? <ActivityTable state={state} rows={rows} filters={filters} selectedId={selectedId} onSelect={select} onSort={(sort) => update({ ...filters, sort, dir: filters.sort === sort && filters.dir === 'desc' ? 'asc' : 'desc' })} onEdit={(t) => onEditTransaction?.(t)} onReverse={(t) => void reverse(t)} />
            : <ActivityList state={state} groups={groups} selectedId={selectedId} onSelect={select} />)}
          {feed.status === 'ready' && rows.length > 0 && (
            <div className="v3-act-foot">
              <p className="v3-secondary" data-testid="v3-act-count">{rows.length} {rows.length === 1 ? 'transaction' : 'transactions'} loaded{feed.hasMore ? ' · more available' : ' · end of history'}</p>
              {feed.moreError && <p role="alert" className="v3-secondary v3-act-error">Could not load more. Try again.</p>}
              {feed.hasMore && <button type="button" className="v3-btn v3-btn--secondary" onClick={feed.loadMore} disabled={feed.loadingMore}>{feed.loadingMore ? 'Loading…' : 'Load more'}</button>}
            </div>
          )}
        </section>
        {detail}
      </div>
      {dialog}
    </>
  )
}

function ActivityList({ state, groups, selectedId, onSelect }: { state: FinanceState; groups: { date: string; rows: Transaction[] }[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="v3-act-groups">
      {groups.map((g) => (
        <section key={g.date || 'all'} aria-label={g.date ? formatDateLabel(g.date) : 'Transactions by amount'}>
          {g.date && <h2 className="v3-h3 v3-act-date">{formatDateLabel(g.date)} {g.date.slice(0, 4)}</h2>}
          <ul className="v3-card v3-act-list">
            {g.rows.map((t) => {
              const kind = activityKind(state, t)
              const amount = amountView(state, t)
              const reversed = isReversalPart(t)
              const category = t.type === 'transfer' ? null : state.categories.find((c) => c.id === t.categoryId)?.name ?? 'Uncategorized'
              return (
                <li key={t.id}>
                  <button type="button" className={`v3-act-row ${reversed ? 'is-reversed' : ''}`} aria-current={selectedId === t.id ? 'true' : undefined} onClick={() => onSelect(t.id)} aria-label={`${t.title}, ${KIND_LABEL[kind]}${reversed ? ', reversed pair' : ''}, ${amount.text}. Open details`}>
                    <span className="v3-act-row__main">
                      <span className="v3-act-row__title">{t.title}</span>
                      <span className="v3-caption">{[g.date ? '' : formatDateLabel(t.date), category, transactionAccountLabel(state, t), t.status === 'pending' ? 'Pending' : ''].filter(Boolean).join(' · ')}</span>
                      <KindBadge kind={kind} reversed={reversed} />
                    </span>
                    <span className={`v3-figure v3-act-row__amt ${amount.tone}`}>{amount.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ActivityTable({ state, rows, filters, selectedId, onSelect, onSort, onEdit, onReverse }: {
  state: FinanceState; rows: Transaction[]; filters: ActivityFilters; selectedId: string | null
  onSelect: (id: string) => void; onSort: (s: ActivitySort) => void; onEdit: (t: Transaction) => void; onReverse: (t: Transaction) => void
}) {
  return (
    <div className="v3-card v3-act-tablewrap">
      <table className="v3-act-table">
        <caption className="v3-visually-hidden">Transactions, sortable by date and amount</caption>
        <thead>
          <tr>
            {COLUMNS.map((c) => c.sort
              ? (
                <th key={c.id} scope="col" className={c.id === 'amount' ? 'is-num' : undefined} aria-sort={filters.sort === c.sort ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="v3-act-sort" onClick={() => onSort(c.sort!)}>{c.label}{filters.sort === c.sort ? (filters.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
                </th>
              )
              : <th key={c.id} scope="col">{c.label}</th>)}
            <th scope="col"><span className="v3-visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const kind = activityKind(state, t)
            const amount = amountView(state, t)
            const reversed = isReversalPart(t)
            const category = t.type === 'transfer' ? '—' : state.categories.find((c) => c.id === t.categoryId)?.name ?? 'Uncategorized'
            return (
              <tr key={t.id} className={`${reversed ? 'is-reversed' : ''} ${selectedId === t.id ? 'is-selected' : ''}`} aria-current={selectedId === t.id ? 'true' : undefined}>
                <td>{formatDateLabel(t.date)} {t.date.slice(0, 4)}</td>
                <td><button type="button" className="v3-act-titlebtn" onClick={() => onSelect(t.id)}>{t.title}</button>{t.status === 'pending' && <span className="v3-caption"> · Pending</span>}</td>
                <td>{category}</td>
                <td><AccountRefs state={state} t={t} /></td>
                <td><KindBadge kind={kind} reversed={reversed} /></td>
                <td className={`is-num v3-figure ${amount.tone}`}>{amount.text}</td>
                <td className="v3-act-actions">
                  <button type="button" className="v3-btn v3-btn--ghost" onClick={() => onSelect(t.id)} aria-label={`Details for ${t.title}`}>Details</button>
                  <button type="button" className="v3-btn v3-btn--ghost" disabled={reversed} onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>Edit</button>
                  <button type="button" className="v3-btn v3-btn--ghost" disabled={reversed} onClick={() => onReverse(t)} aria-label={`Reverse ${t.title}`}>Reverse</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

