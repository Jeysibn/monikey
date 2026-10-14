import { describe, expect, it } from 'vitest'
import type { FinanceState, Transaction } from '../domain/finance'
import { mockFinanceRepository } from '../services/mockFinanceRepository'
import { activeTransactions, budgetSnapshot, favoriteAccounts, historyFromTracked, periodFlowMinor, positionMinor, recentActivity, spendingByCategory } from './overviewModel'

const base = (): FinanceState => mockFinanceRepository.getInitialState()
const period = { start: '2026-08-01', end: '2026-09-01' }
const tx = (over: Partial<Transaction>): Transaction => ({ id: 'x', type: 'expense', title: 't', date: '2026-08-10', amount: -10, amountMinor: '-1000', source: 'manual', status: 'cleared', ...over })

describe('positionMinor', () => {
  it('is liquid assets minus card debt, in exact minor units', () => {
    const p = positionMinor(base())
    expect(p.liquid).toBe(804000n)
    expect(p.cardDebt).toBe(207000n)
    expect(p.net).toBe(597000n)
  })
  it('excludes non-liquid asset types and does not use float math', () => {
    const s = base()
    s.accounts = [...s.accounts, { ...s.accounts[0]!, id: 'inv', type: 'investment' as never, balance: 0.1, balanceMinor: '10' }]
    expect(positionMinor(s).liquid).toBe(804000n)
    const t = base()
    t.accounts = [{ ...t.accounts[0]!, balanceMinor: '10', balance: 0.1 }, { ...t.accounts[1]!, balanceMinor: '20', balance: 0.2 }]
    t.creditCards = []
    expect(positionMinor(t).net).toBe(30n)
  })
})

describe('reversal pairs and flow', () => {
  it('hides both halves of a reversal pair from activity and totals', () => {
    const s = base()
    s.transactions = [tx({ id: 'a', amountMinor: '-5000', amount: -50, title: 'Orig', categoryId: 'food' }), tx({ id: 'b', amountMinor: '5000', amount: 50, title: 'Rev', reversedTransactionId: 'a', categoryId: 'food' }), tx({ id: 'c', amountMinor: '-1000', amount: -10, categoryId: 'food' })]
    expect(activeTransactions(s).map((t) => t.id)).toEqual(['c'])
    expect(periodFlowMinor(s, period).spending).toBe(1000n)
    expect(spendingByCategory(s, period)[0]?.amountMinor).toBe(1000n)
    expect(recentActivity(s, 5).map((t) => t.id)).toEqual(['c'])
  })
  it('excludes transfers and card repayments, counts card purchases once', () => {
    const s = base()
    s.transactions = [
      tx({ id: 'p', accountId: 'visa', amountMinor: '-2500', amount: -25 }),
      tx({ id: 'r', type: 'transfer', fromAccountId: 'checking', toAccountId: 'visa', amountMinor: '9000', amount: 90 }),
      tx({ id: 'i', type: 'income', amountMinor: '7000', amount: 70 }),
    ]
    const f = periodFlowMinor(s, period)
    expect(f.spending).toBe(2500n)
    expect(f.income).toBe(7000n)
  })
  it('keeps a genuine refund (independent income row) as income', () => {
    const s = base()
    s.transactions = [tx({ id: 'e', amountMinor: '-1000', amount: -10 }), tx({ id: 'f', type: 'income', amountMinor: '1000', amount: 10, title: 'Refund' })]
    const f = periodFlowMinor(s, period)
    expect(f.income).toBe(1000n)
    expect(f.spending).toBe(1000n)
  })
  it('respects the period (end exclusive) and sorts newest first', () => {
    const s = base()
    s.transactions = [tx({ id: 'old', date: '2026-08-01' }), tx({ id: 'edge', date: '2026-09-01' }), tx({ id: 'new', date: '2026-08-31', time: '10:00' })]
    expect(periodFlowMinor(s, period).spending).toBe(2000n)
    expect(recentActivity(s, 3).map((t) => t.id)).toEqual(['edge', 'new', 'old'])
  })
})

describe('budget snapshot', () => {
  it('sums category spent exactly and flags overspend', () => {
    const s = base()
    s.totalBudgetAllocatedMinor = '10000'
    s.budgetCategories = [{ id: 'food', allocated: 60, spent: 70, allocatedMinor: '6000', spentMinor: '7000' }, { id: 'x', allocated: 40, spent: 50, allocatedMinor: '4000', spentMinor: '5000' }]
    const b = budgetSnapshot(s)!
    expect(b.spent).toBe(12000n)
    expect(b.remaining).toBe(-2000n)
    expect(b.over).toBe(true)
    s.budgetCategories = []
    expect(budgetSnapshot(s)).toBeNull()
  })
})

describe('favoriteAccounts', () => {
  it('returns four cards: bank, e-wallet, cash, credit card', () => {
    const f = favoriteAccounts(base())
    expect(f).toHaveLength(4)
    expect(f.map((x) => x.kind)).toEqual(['bank', 'ewallet', 'cash', 'credit'])
  })
  it('fills with remaining accounts and never exceeds the count', () => {
    const s = base()
    s.creditCards = []
    expect(favoriteAccounts(s).map((x) => x.kind)).toEqual(['bank', 'ewallet', 'cash', 'bank'])
    s.accounts = []
    expect(favoriteAccounts(s)).toEqual([])
  })
})

describe('favoriteAccounts with a saved selection', () => {
  it('shows only the selection in rank order, fewer than four stays fewer, cards stay credit', () => {
    const s = base()
    const card = s.creditCards[0]!
    s.favoritesConfigured = true
    s.accounts = s.accounts.map((a, i) => (i === 1 ? { ...a, favoriteRank: 2 } : a))
    s.creditCards = [{ ...card, favoriteRank: 1 }]
    const f = favoriteAccounts(s)
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ kind: 'credit' })
    expect(f[1]).toMatchObject({ account: { id: s.accounts[1]!.id } })
  })
  it('configured-but-empty shows nothing instead of falling back to suggestions', () => {
    const s = base()
    s.favoritesConfigured = true
    expect(favoriteAccounts(s)).toEqual([])
  })
  it('ignores ranks while unconfigured and uses suggestions', () => {
    const s = base()
    s.accounts = s.accounts.map((a) => ({ ...a, favoriteRank: null }))
    expect(favoriteAccounts(s)).toHaveLength(4)
  })
})

describe('history', () => {
  it('maps only stored snapshots and keeps exact minor units', () => {
    expect(historyFromTracked([{ date: '2026-08-01', netTrackedPosition: '123456789012345678' }])).toEqual([{ date: '2026-08-01', netMinor: 123456789012345678n }])
    expect(historyFromTracked([])).toEqual([])
  })
})

describe('cleared-only semantics (matches reports API)', () => {
  it('excludes pending rows from spending, income and categories', () => {
    const s = { ...base(), transactions: [tx({ id: 'a', amountMinor: '-1000', amount: -10 }), tx({ id: 'b', amountMinor: '-5000', amount: -50, status: 'pending' }), tx({ id: 'c', type: 'income', amountMinor: '9000', amount: 90, status: 'pending' })] }
    expect(periodFlowMinor(s, period)).toEqual({ income: 0n, spending: 1000n })
    expect(spendingByCategory(s, period).reduce((n, c) => n + c.amountMinor, 0n)).toBe(1000n)
  })
})
