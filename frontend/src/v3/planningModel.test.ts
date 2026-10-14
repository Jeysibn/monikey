import { describe, expect, it } from 'vitest'
import type { Category } from '../domain/finance'
import type { RecurringItem } from '../domain/recurring'
import { billState, buildPlan, monthBounds, monthInRange, periodForMonth, shiftMonth, sortBills, statusOf } from './planningModel'

const cats: Category[] = [
  { id: 'food', name: 'Food', color: '#1', budgetable: true, transactionKinds: ['expense'] },
  { id: 'rent', name: 'Rent', color: '#2', budgetable: true, transactionKinds: ['expense'] },
  { id: 'fun', name: 'Fun', color: '#3', budgetable: true, transactionKinds: ['expense'] },
  { id: 'pay', name: 'Salary', color: '#4', budgetable: false, transactionKinds: ['income'] },
]

describe('month helpers', () => {
  it('computes inclusive calendar bounds, including leap February and December', () => {
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(monthBounds('2026-12').end).toBe('2026-12-31')
  })
  it('shifts across year boundaries and limits the supported window', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthInRange('2026-11', '2026-10')).toBe(true)
    expect(monthInRange('2026-12', '2026-10')).toBe(false)
    expect(monthInRange('2025-10', '2026-10')).toBe(true)
    expect(monthInRange('2025-09', '2026-10')).toBe(false)
  })
  it('prefers the exact month period and falls back to a covering one', () => {
    const exact = { id: 'm', periodStart: '2026-10-01', periodEnd: '2026-10-31', allocations: [] }
    const wide = { id: 'q', periodStart: '2026-10-01', periodEnd: '2026-12-31', allocations: [] }
    expect(periodForMonth([wide, exact], '2026-10')?.id).toBe('m')
    expect(periodForMonth([wide], '2026-11')?.id).toBe('q')
    expect(periodForMonth([exact], '2026-11')).toBeNull()
  })
})

describe('buildPlan', () => {
  it('uses exact minor units and separates budgeted from total spending', () => {
    const plan = buildPlan({
      categories: cats,
      allocations: [{ categoryId: 'food', allocatedMinor: 500000n, spentMinor: 410000n }, { categoryId: 'rent', allocatedMinor: 1000000n, spentMinor: 1000001n }],
      spendByCategory: new Map([['food', 410000n], ['rent', 1000001n], ['fun', 25050n]]),
      totalSpending: 1435051n,
    })
    expect(plan.allocated).toBe(1500000n)
    expect(plan.budgetedSpent).toBe(1410001n)
    expect(plan.remaining).toBe(89999n)
    expect(plan.totalSpending).toBe(1435051n)
    expect(plan.outsideBudget).toBe(25050n)
    expect(plan.rows.map((r) => [r.categoryId, r.status])).toEqual([['rent', 'over'], ['food', 'near']])
    expect(plan.unbudgeted.map((u) => [u.categoryId, u.spent])).toEqual([['fun', 25050n]])
  })
  it('treats a zero allocation as no allocation and never lists income-only categories', () => {
    const plan = buildPlan({ categories: cats, allocations: [{ categoryId: 'food', allocatedMinor: 0n, spentMinor: 100n }], spendByCategory: new Map([['food', 100n]]), totalSpending: 100n })
    expect(plan.hasBudget).toBe(false)
    expect(plan.rows).toEqual([])
    expect(plan.unbudgeted.map((u) => u.categoryId).sort()).toEqual(['food', 'fun', 'rent'])
    expect(plan.outsideBudget).toBe(100n)
  })
  it('has no outside-budget figure when total spending is unknown, and never goes negative', () => {
    expect(buildPlan({ categories: cats, allocations: [], spendByCategory: new Map(), totalSpending: null }).outsideBudget).toBeNull()
    expect(buildPlan({ categories: cats, allocations: [{ categoryId: 'food', allocatedMinor: 10n, spentMinor: 9n }], spendByCategory: new Map(), totalSpending: 5n }).outsideBudget).toBe(0n)
  })
  it('classifies near and over at exact boundaries', () => {
    expect(statusOf(79n, 100n)).toBe('ok')
    expect(statusOf(80n, 100n)).toBe('near')
    expect(statusOf(100n, 100n)).toBe('near')
    expect(statusOf(101n, 100n)).toBe('over')
  })
})

describe('recurring bill state', () => {
  const item = (over: Partial<RecurringItem>): RecurringItem => ({ id: 'r', merchant: 'Meralco', amount: 1, frequency: 'monthly', nextDueDate: '2026-10-20', accountId: 'a', categoryId: 'c', autopay: false, status: 'active', ...over })
  it('derives overdue, due today, due soon, upcoming and paused from the injected date', () => {
    expect(billState(item({ nextDueDate: '2026-10-13' }), '2026-10-14')).toBe('overdue')
    expect(billState(item({ nextDueDate: '2026-10-14' }), '2026-10-14')).toBe('due_today')
    expect(billState(item({ nextDueDate: '2026-10-21' }), '2026-10-14')).toBe('due_soon')
    expect(billState(item({ nextDueDate: '2026-10-22' }), '2026-10-14')).toBe('scheduled')
    expect(billState(item({ nextDueDate: '2026-10-01', status: 'paused' }), '2026-10-14')).toBe('paused')
  })
  it('sorts overdue first, paused last', () => {
    const sorted = sortBills([item({ id: 'p', status: 'paused' }), item({ id: 's', nextDueDate: '2026-12-01' }), item({ id: 'o', nextDueDate: '2026-10-01' })], '2026-10-14')
    expect(sorted.map((i) => i.id)).toEqual(['o', 's', 'p'])
  })
})
