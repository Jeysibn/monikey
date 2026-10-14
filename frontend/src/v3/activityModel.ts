// Pure Activity-page helpers: URL filter state, transaction classification, local filtering,
// sorting and date grouping. Money stays exact minor-unit BigInt; nothing here changes ledger semantics.

import type { FinanceState, Transaction } from '../domain/finance'
import { exactMinor } from '../utils/money'

export type ActivityKind = 'expense' | 'income' | 'transfer' | 'card_charge' | 'repayment'
export type ActivityTypeFilter = '' | 'expense' | 'income' | 'transfer'
export type ActivitySort = 'date' | 'description' | 'category' | 'account' | 'type' | 'amount'

export interface ActivityFilters {
  q: string
  type: ActivityTypeFilter
  category: string
  account: string
  from: string
  to: string
  showReversed: boolean
  sort: ActivitySort
  dir: 'asc' | 'desc'
}

export const DEFAULT_FILTERS: ActivityFilters = { q: '', type: '', category: '', account: '', from: '', to: '', showReversed: false, sort: 'date', dir: 'desc' }

const SORTS: ActivitySort[] = ['date', 'description', 'category', 'account', 'type', 'amount']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Reads filters from the URL. Unknown or malformed values fall back to defaults instead of throwing. */
export function parseFilters(params: URLSearchParams): ActivityFilters {
  const type = params.get('type')
  const sort = params.get('sort') as ActivitySort | null
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  return {
    q: params.get('q') ?? '',
    type: type === 'expense' || type === 'income' || type === 'transfer' ? type : '',
    category: params.get('category') ?? '',
    account: params.get('account') ?? '',
    from: ISO_DATE.test(from) ? from : '',
    to: ISO_DATE.test(to) ? to : '',
    showReversed: params.get('reversed') === '1',
    sort: sort && SORTS.includes(sort) ? sort : 'date',
    dir: params.get('dir') === 'asc' ? 'asc' : 'desc',
  }
}

/** Serialises only non-default values so URLs stay short and shareable. Preserves unrelated params (e.g. `tx`). */
export function applyFilters(base: URLSearchParams, filters: ActivityFilters): URLSearchParams {
  const next = new URLSearchParams(base)
  const set = (key: string, value: string, fallback = '') => { if (value && value !== fallback) next.set(key, value); else next.delete(key) }
  set('q', filters.q.trim())
  set('type', filters.type)
  set('category', filters.category)
  set('account', filters.account)
  set('from', filters.from)
  set('to', filters.to)
  set('reversed', filters.showReversed ? '1' : '')
  set('sort', filters.sort, 'date')
  set('dir', filters.dir, 'desc')
  return next
}

export function activeFilterCount(f: ActivityFilters): number {
  return [f.q.trim(), f.type, f.category, f.account, f.from, f.to, f.showReversed ? '1' : ''].filter(Boolean).length
}

/** Server query for `/api/v1/transactions` (date-descending, cursor paged). */
export function serverQuery(f: ActivityFilters, cursor?: string, limit = 50): string {
  const p = new URLSearchParams({ limit: String(limit) })
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.type) p.set('type', f.type)
  if (f.category) p.set('categoryId', f.category)
  if (f.account) p.set('accountId', f.account)
  if (f.from) p.set('fromDate', f.from)
  if (f.to) p.set('toDate', f.to)
  if (cursor) p.set('cursor', cursor)
  return p.toString()
}

export const isReversalPart = (t: Transaction): boolean => Boolean(t.reversedTransactionId)

export function activityKind(state: FinanceState, t: Transaction): ActivityKind {
  const isCard = (id?: string) => Boolean(id) && state.creditCards.some((c) => c.id === id)
  if (t.type === 'income') return 'income'
  if (t.type === 'expense') return isCard(t.accountId ?? t.fromAccountId) ? 'card_charge' : 'expense'
  return isCard(t.toAccountId) ? 'repayment' : 'transfer'
}

export const KIND_LABEL: Record<ActivityKind, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', card_charge: 'Card charge', repayment: 'Card repayment' }

export const involvesAccount = (t: Transaction, accountId: string): boolean => t.accountId === accountId || t.fromAccountId === accountId || t.toAccountId === accountId

/** Mock-mode (and detail-lookup) filtering with the same semantics as the server query. */
export function filterLocal(_state: FinanceState, rows: Transaction[], f: ActivityFilters): Transaction[] {
  const q = f.q.trim().toLowerCase()
  return rows.filter((t) => {
    if (!f.showReversed && isReversalPart(t)) return false
    if (f.type && t.type !== f.type) return false
    if (f.category && t.categoryId !== f.category) return false
    if (f.account && !involvesAccount(t, f.account)) return false
    if (f.from && t.date < f.from) return false
    if (f.to && t.date > f.to) return false
    if (q && !`${t.title} ${t.note ?? ''}`.toLowerCase().includes(q)) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''))
}

const cmpBig = (a: bigint, b: bigint) => (a === b ? 0 : a > b ? 1 : -1)

export function sortRows(state: FinanceState, rows: Transaction[], f: ActivityFilters, labels: { category: (t: Transaction) => string; account: (t: Transaction) => string }): Transaction[] {
  const dir = f.dir === 'asc' ? 1 : -1
  const key = (a: Transaction, b: Transaction): number => {
    switch (f.sort) {
      case 'description': return a.title.localeCompare(b.title)
      case 'category': return labels.category(a).localeCompare(labels.category(b))
      case 'account': return labels.account(a).localeCompare(labels.account(b))
      case 'type': return KIND_LABEL[activityKind(state, a)].localeCompare(KIND_LABEL[activityKind(state, b)])
      case 'amount': return cmpBig(exactMinor(a.amountMinor, a.amount), exactMinor(b.amountMinor, b.amount))
      default: return a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')
    }
  }
  return rows.map((t, i) => ({ t, i })).sort((x, y) => dir * key(x.t, y.t) || x.i - y.i).map((x) => x.t)
}

export function groupByDate(rows: Transaction[]): { date: string; rows: Transaction[] }[] {
  const groups: { date: string; rows: Transaction[] }[] = []
  for (const t of rows) {
    const last = groups[groups.length - 1]
    if (last && last.date === t.date) last.rows.push(t)
    else groups.push({ date: t.date, rows: [t] })
  }
  return groups
}
