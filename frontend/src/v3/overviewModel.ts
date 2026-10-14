// Pure V3 Overview/Insights calculations over the existing FinanceState.
// Money is exact minor-unit BigInt end to end; nothing here uses floats and
// nothing is invented: missing history stays missing.

import type { Account, CreditCard, FinanceState, ReportingPeriod, Transaction } from '../domain/finance'
import { isDateInPeriod } from '../utils/date'
import { exactMinor } from '../utils/money'
import type { V3AccountKind } from './V3AccountCard'

/** In-scope liquid account types for the MVP net position. Investments/crypto are outside it. */
const LIQUID_TYPES: Account['type'][] = ['checking', 'savings', 'ewallet', 'cash']

const accountMinor = (a: Account | CreditCard): bigint => exactMinor(a.balanceMinor, a.balance)

/** Ids of transactions that are half of a reversal pair (original or compensating). They are hidden and never counted. */
export function reversalPairIds(transactions: Transaction[]): Set<string> {
  const ids = new Set<string>()
  for (const t of transactions) {
    if (t.reversedTransactionId) {
      ids.add(t.id)
      ids.add(t.reversedTransactionId)
    }
  }
  return ids
}

export function activeTransactions(state: FinanceState): Transaction[] {
  const pairs = reversalPairIds(state.transactions)
  return state.transactions.filter((t) => !pairs.has(t.id))
}

/** Newest first: date, then time, then original order. */
export function recentActivity(state: FinanceState, limit: number): Transaction[] {
  return activeTransactions(state)
    .map((t, index) => ({ t, index }))
    .sort((a, b) => b.t.date.localeCompare(a.t.date) || (b.t.time ?? '').localeCompare(a.t.time ?? '') || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.t)
}

export interface PositionMinor {
  liquid: bigint
  cardDebt: bigint
  net: bigint
}

/** MVP position: in-scope liquid holdings minus outstanding credit-card debt. Not safeToSpend. */
export function positionMinor(state: FinanceState): PositionMinor {
  const liquid = state.accounts
    .filter((a) => a.classification === 'asset' && LIQUID_TYPES.includes(a.type))
    .reduce((s, a) => s + accountMinor(a), 0n)
  const cardDebt = state.creditCards.reduce((s, c) => s + accountMinor(c), 0n)
  return { liquid, cardDebt, net: liquid - cardDebt }
}

/** Income/expense for a period from active (non-reversed) cleared income/expense rows only, matching the reports API. Pending, transfers and card repayments never count. */
export function periodFlowMinor(state: FinanceState, period: ReportingPeriod): { income: bigint; spending: bigint } {
  let income = 0n
  let spending = 0n
  for (const t of activeTransactions(state)) {
    if (t.status === 'pending' || !isDateInPeriod(t.date, period)) continue
    const m = exactMinor(t.amountMinor, t.amount)
    if (t.type === 'income') income += m
    else if (t.type === 'expense') spending += -m
  }
  return { income, spending }
}

export interface CategorySpend { categoryId: string; name: string; color: string; amountMinor: bigint; sharePct: number }

export function spendingByCategory(state: FinanceState, period: ReportingPeriod): CategorySpend[] {
  const totals = new Map<string, bigint>()
  for (const t of activeTransactions(state)) {
    if (t.type !== 'expense' || t.status === 'pending' || !isDateInPeriod(t.date, period)) continue
    const key = t.categoryId ?? ''
    totals.set(key, (totals.get(key) ?? 0n) + -exactMinor(t.amountMinor, t.amount))
  }
  const all = [...totals.values()].reduce((s, v) => s + v, 0n)
  return [...totals.entries()]
    .filter(([, v]) => v > 0n)
    .map(([id, amountMinor]) => {
      const cat = state.categories.find((c) => c.id === id)
      return { categoryId: id, name: cat?.name ?? 'Uncategorized', color: cat?.color ?? 'var(--v3-muted)', amountMinor, sharePct: all > 0n ? Number((amountMinor * 100n + all / 2n) / all) : 0 }
    })
    .sort((a, b) => (a.amountMinor === b.amountMinor ? 0 : a.amountMinor > b.amountMinor ? -1 : 1))
}

export interface BudgetSnapshot { allocated: bigint; spent: bigint; remaining: bigint; usedPct: number; over: boolean }

export function snapshotOf(allocated: bigint, spent: bigint): BudgetSnapshot {
  const usedPct = allocated > 0n ? Number((spent * 100n + allocated / 2n) / allocated) : 0
  return { allocated, spent, remaining: allocated - spent, usedPct, over: allocated > 0n && spent > allocated }
}

export function budgetSnapshot(state: FinanceState): BudgetSnapshot | null {
  if (state.budgetCategories.length === 0) return null
  const allocated = state.totalBudgetAllocatedMinor === undefined ? BigInt(Math.round(state.totalBudgetAllocated * 100)) : BigInt(state.totalBudgetAllocatedMinor)
  const spent = state.budgetCategories.reduce((s, c) => s + exactMinor(c.spentMinor, c.spent), 0n)
  const usedPct = allocated > 0n ? Number((spent * 100n + allocated / 2n) / allocated) : 0
  return { allocated, spent, remaining: allocated - spent, usedPct, over: allocated > 0n && spent > allocated }
}

export interface BudgetRow { categoryId: string; name: string; color: string; allocated: bigint; spent: bigint; over: boolean }

export function budgetRows(state: FinanceState): BudgetRow[] {
  return state.budgetCategories.map((b) => {
    const cat = state.categories.find((c) => c.id === b.id)
    const allocated = exactMinor(b.allocatedMinor, b.allocated)
    const spent = exactMinor(b.spentMinor, b.spent)
    return { categoryId: b.id, name: cat?.name ?? b.id, color: cat?.color ?? 'var(--v3-muted)', allocated, spent, over: allocated > 0n && spent > allocated }
  })
}

export type FavoriteItem =
  | { kind: Exclude<V3AccountKind, 'credit'>; account: Account }
  | { kind: 'credit'; card: CreditCard }

const bankLike = (a: Account) => a.type === 'checking' || a.type === 'savings'

/**
 * Overview cards. Once the user has configured favorites (even an empty list) only their
 * selection is shown, in rank order, and may be shorter than four. Until then the four
 * cards are suggested deterministically: first bank, e-wallet, cash and credit card in
 * list order (one per kind), then filled with remaining accounts/cards in list order.
 */
export function favoriteAccounts(state: FinanceState, count = 4): FavoriteItem[] {
  if (state.favoritesConfigured) return selectedFavorites(state).slice(0, count)
  return suggestedFavorites(state, count)
}

const kindOfAccount = (a: Account): Exclude<V3AccountKind, 'credit'> => (bankLike(a) ? 'bank' : (a.type as 'ewallet' | 'cash'))

/** The user's pinned accounts in rank order. Archived accounts are not in state, so they cannot appear. */
export function selectedFavorites(state: FinanceState): FavoriteItem[] {
  const items: { rank: number; item: FavoriteItem }[] = []
  for (const a of state.accounts) if (typeof a.favoriteRank === 'number' && a.type !== 'credit_card') items.push({ rank: a.favoriteRank, item: { kind: kindOfAccount(a), account: a } })
  for (const c of state.creditCards) if (typeof c.favoriteRank === 'number') items.push({ rank: c.favoriteRank, item: { kind: 'credit', card: c } })
  return items.sort((x, y) => x.rank - y.rank).map((x) => x.item)
}

export function suggestedFavorites(state: FinanceState, count = 4): FavoriteItem[] {
  const assets = state.accounts.filter((a) => a.classification === 'asset' && LIQUID_TYPES.includes(a.type))
  const kindOf = (a: Account): Exclude<V3AccountKind, 'credit'> => (bankLike(a) ? 'bank' : (a.type as 'ewallet' | 'cash'))
  const picked: FavoriteItem[] = []
  const used = new Set<string>()
  const take = (item: FavoriteItem, id: string) => { picked.push(item); used.add(id) }
  for (const kind of ['bank', 'ewallet', 'cash'] as const) {
    const a = assets.find((x) => kindOf(x) === kind)
    if (a) take({ kind, account: a }, a.id)
  }
  if (state.creditCards[0]) take({ kind: 'credit', card: state.creditCards[0] }, state.creditCards[0].id)
  for (const a of assets) if (picked.length < count && !used.has(a.id)) take({ kind: kindOf(a), account: a }, a.id)
  for (const c of state.creditCards) if (picked.length < count && !used.has(c.id)) take({ kind: 'credit', card: c }, c.id)
  return picked.slice(0, count)
}

export interface HistoryPoint { date: string; netMinor: bigint }

/** Ledger-derived daily points from `/reports/net-tracked-position`. Only what the server returns — never interpolated or backfilled. */
export function historyFromTracked(rows: { date: string; netTrackedPosition: string }[]): HistoryPoint[] {
  return rows.map((r) => ({ date: r.date, netMinor: BigInt(r.netTrackedPosition) }))
}
