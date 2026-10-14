import { describe, expect, it } from 'vitest'
import type { Transaction } from '../domain/finance'
import { mockFinanceRepository } from '../services/mockFinanceRepository'
import { activityKind, applyFilters, activeFilterCount, DEFAULT_FILTERS, filterLocal, groupByDate, parseFilters, serverQuery } from './activityModel'

const state = mockFinanceRepository.getInitialState()
const card = state.creditCards[0]!
const bank = state.accounts[0]!
const tx = (over: Partial<Transaction>): Transaction => ({ id: 'x', type: 'expense', title: 't', date: '2026-08-10', amount: -10, amountMinor: '-1000', source: 'manual', status: 'cleared', ...over })

describe('filters <-> URL', () => {
  it('round-trips and omits defaults', () => {
    const f = { ...DEFAULT_FILTERS, q: ' cafe ', type: 'expense' as const, account: 'a1', from: '2026-08-01', sort: 'amount' as const, dir: 'asc' as const, showReversed: true }
    const params = applyFilters(new URLSearchParams('tx=9'), f)
    expect(params.toString()).toBe('tx=9&q=cafe&type=expense&account=a1&from=2026-08-01&reversed=1&sort=amount&dir=asc')
    expect(parseFilters(params)).toEqual({ ...f, q: 'cafe' })
    expect(applyFilters(params, DEFAULT_FILTERS).toString()).toBe('tx=9')
  })
  it('falls back on malformed values', () => {
    expect(parseFilters(new URLSearchParams('type=bogus&from=yesterday&sort=drop&dir=x'))).toEqual(DEFAULT_FILTERS)
  })
  it('counts active filters and builds the server query', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    const f = { ...DEFAULT_FILTERS, q: 'a b', category: 'c', account: 'a', from: '2026-01-01', to: '2026-02-01', type: 'income' as const }
    expect(activeFilterCount(f)).toBe(6)
    expect(serverQuery(f, 'cur')).toBe('limit=50&q=a+b&type=income&categoryId=c&accountId=a&fromDate=2026-01-01&toDate=2026-02-01&cursor=cur')
  })
})

describe('classification', () => {
  it('separates card charges and repayments from expenses and transfers', () => {
    expect(activityKind(state, tx({ accountId: bank.id }))).toBe('expense')
    expect(activityKind(state, tx({ accountId: card.id }))).toBe('card_charge')
    expect(activityKind(state, tx({ type: 'transfer', fromAccountId: bank.id, toAccountId: card.id }))).toBe('repayment')
    expect(activityKind(state, tx({ type: 'transfer', fromAccountId: bank.id, toAccountId: 'other' }))).toBe('transfer')
    expect(activityKind(state, tx({ type: 'income' }))).toBe('income')
  })
})

describe('local filtering, sorting, grouping', () => {
  const rows = [
    tx({ id: '1', title: 'Cafe', date: '2026-08-02', accountId: 'a', amountMinor: '-500', amount: -5 }),
    tx({ id: '2', title: 'Rent', date: '2026-08-01', accountId: 'b', amountMinor: '-900000', amount: -9000, note: 'monthly' }),
    tx({ id: '3', title: 'Oops', date: '2026-08-02', accountId: 'a', reversedTransactionId: '4' }),
    tx({ id: '4', title: 'Oops reversal', date: '2026-08-03', type: 'income', reversedTransactionId: '3' }),
    tx({ id: '5', title: 'Move', type: 'transfer', fromAccountId: 'a', toAccountId: 'b', date: '2026-08-02' }),
  ]
  it('hides reversal pairs by default and keeps them for the audit view', () => {
    expect(filterLocal(state, rows, DEFAULT_FILTERS).map((t) => t.id)).toEqual(['1', '5', '2'])
    expect(filterLocal(state, rows, { ...DEFAULT_FILTERS, showReversed: true })).toHaveLength(5)
  })
  it('matches either side of a transfer for an account filter, and searches title and note', () => {
    expect(filterLocal(state, rows, { ...DEFAULT_FILTERS, account: 'b' }).map((t) => t.id)).toEqual(['5', '2'])
    expect(filterLocal(state, rows, { ...DEFAULT_FILTERS, q: 'MONTHLY' }).map((t) => t.id)).toEqual(['2'])
    expect(filterLocal(state, rows, { ...DEFAULT_FILTERS, from: '2026-08-02', to: '2026-08-02' })).toHaveLength(2)
  })
  it('mock sort mirrors the backend: exact BigInt magnitude, date tie-break, id last', () => {
    expect(filterLocal(state, rows.slice(0, 2), { ...DEFAULT_FILTERS, sort: 'amount', dir: 'asc' }).map((t) => t.id)).toEqual(['1', '2'])
    const big = [tx({ id: 'a', amountMinor: '-9007199254740993' }), tx({ id: 'b', amountMinor: '-9007199254740992' })]
    expect(filterLocal(state, big, { ...DEFAULT_FILTERS, sort: 'amount', dir: 'desc' }).map((t) => t.id)).toEqual(['a', 'b'])
    expect(filterLocal(state, rows, { ...DEFAULT_FILTERS, dir: 'asc' }).map((t) => t.id)[0]).toBe('2')
  })
  it('sends sort and dir to the server only when non-default and drops unsupported sorts from the URL', () => {
    expect(serverQuery({ ...DEFAULT_FILTERS, sort: 'amount', dir: 'asc' })).toContain('sort=amount&dir=asc')
    expect(serverQuery(DEFAULT_FILTERS)).not.toContain('sort')
    expect(parseFilters(new URLSearchParams('sort=description')).sort).toBe('date')
  })
  it('groups consecutive rows by date', () => {
    expect(groupByDate(filterLocal(state, rows, DEFAULT_FILTERS)).map((g) => [g.date, g.rows.length])).toEqual([['2026-08-02', 2], ['2026-08-01', 1]])
  })
})
