import { describe, expect, it } from 'vitest'
import { fixedClock } from '../utils/clock'
import { isDateInPeriod } from '../utils/date'
import { createMockFinanceRepository } from '../services/mockFinanceRepository'
import {
  activeReportingPeriod,
  budgetDaysRemaining,
  expensesToday,
  expensesTrend,
  totalExpenses,
  totalIncome,
} from './financeSelectors'
import type { FinanceState, Transaction } from '../domain/finance'

// TR-001: ONE clock. Advancing it must move the reporting period, KPI
// totals, chart buckets, budget days remaining, goal validation, and the
// dates stamped on funding/completion together — nothing may keep its own
// idea of "today". Every test here freezes time explicitly, so none of them
// depends on the machine's real date or timezone.

function stateWith(transactions: Transaction[]): FinanceState {
  return {
    accounts: [],
    creditCards: [],
    categories: [],
    transactions,
    budgetCategories: [],
    totalBudgetAllocated: 0,
    goals: [],
    attentionItems: [],
    portfolio: [],
    budgetVsActual: [],
  }
}

const augExpense: Transaction = { id: 'aug', type: 'expense', title: 'Aug', date: '2026-08-20', amount: -100, source: 'manual', status: 'cleared' }
const sepExpense: Transaction = { id: 'sep', type: 'expense', title: 'Sep', date: '2026-09-05', amount: -250, source: 'manual', status: 'cleared' }
const decIncome: Transaction = { id: 'dec', type: 'income', title: 'Dec', date: '2026-12-31', amount: 900, source: 'manual', status: 'cleared' }
const janIncome: Transaction = { id: 'jan', type: 'income', title: 'Jan', date: '2027-01-02', amount: 400, source: 'manual', status: 'cleared' }

describe('advancing the clock across a month boundary', () => {
  const state = stateWith([augExpense, sepExpense])

  it('moves the active reporting period and its totals together', () => {
    const august = fixedClock('2026-08-29').todayIso()
    const september = fixedClock('2026-09-05').todayIso()

    expect(activeReportingPeriod(august)).toEqual({ start: '2026-08-01', end: '2026-09-01' })
    expect(activeReportingPeriod(september)).toEqual({ start: '2026-09-01', end: '2026-10-01' })

    expect(totalExpenses(state, activeReportingPeriod(august))).toBe(100)
    expect(totalExpenses(state, activeReportingPeriod(september))).toBe(250)
  })

  it('moves budget days remaining with the period', () => {
    expect(budgetDaysRemaining('2026-08-29')).toBe(3) // -> 2026-09-01
    expect(budgetDaysRemaining('2026-09-05')).toBe(26) // -> 2026-10-01
  })

  it('moves the "today" figure and the daily chart bucket together', () => {
    const todayExpense: Transaction = { ...augExpense, id: 'today', date: '2026-09-05', amount: -33 }
    const s = stateWith([todayExpense])

    expect(expensesToday(s, '2026-09-05')).toBe(33)
    expect(expensesToday(s, '2026-08-29')).toBe(0)

    const sepDaily = expensesTrend(s, 'daily', '2026-09-05')
    expect(sepDaily[sepDaily.length - 1].amount).toBe(33)
    const augDaily = expensesTrend(s, 'daily', '2026-08-29')
    expect(augDaily.every((p) => p.amount === 0)).toBe(true)
  })
})

describe('advancing the clock across a year boundary', () => {
  const state = stateWith([decIncome, janIncome])

  it('rolls the reporting period into the next year', () => {
    expect(activeReportingPeriod('2026-12-31')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
    expect(activeReportingPeriod('2027-01-02')).toEqual({ start: '2027-01-01', end: '2027-02-01' })
    expect(totalIncome(state, activeReportingPeriod('2026-12-31'))).toBe(900)
    expect(totalIncome(state, activeReportingPeriod('2027-01-02'))).toBe(400)
  })

  it('rolls the monthly chart buckets into the next year', () => {
    const points = expensesTrend(stateWith([]), 'monthly', '2027-01-02')
    expect(points).toHaveLength(6)
    expect(points[0].startIso).toBe('2026-08-01')
    expect(points[5].startIso).toBe('2027-01-01')
    expect(points[5].endIso).toBe('2027-01-31')
  })
})

describe('activeReportingPeriod always contains its own anchor date', () => {
  // Narrow, honestly-titled property of the period constructor itself: the
  // month window built from a date contains that date, including at month
  // ends and on a leap day. It says NOTHING about the Add Transaction form —
  // that the form's default date is the clock's today, and lands inside this
  // window, is asserted against the rendered DOM input in
  // `components/AddTransactionModal.test.tsx`.
  it.each(['2026-01-01', '2026-02-28', '2026-08-29', '2026-12-31', '2028-02-29'])('holds at %s', (iso) => {
    const today = fixedClock(iso).todayIso()
    expect(isDateInPeriod(today, activeReportingPeriod(today))).toBe(true)
  })

  it('does not contain a date from the neighbouring month', () => {
    const period = activeReportingPeriod('2026-08-29')
    expect(isDateInPeriod('2026-07-31', period)).toBe(false)
    expect(isDateInPeriod('2026-09-01', period)).toBe(false)
  })
})

describe('the repository reads dates from the injected clock, never a hardcoded one', () => {
  it('stamps a goal-funding transfer and completion with the injected date', () => {
    const repository = createMockFinanceRepository(fixedClock('2027-05-04'))
    const initial = repository.getInitialState()
    // laptop: target 1300, current 1179 -> remaining 121, completes exactly.
    const { state: next, goal } = repository.addGoalFunds(initial, 'laptop', 'checking', 121)

    expect(next.transactions[0].date).toBe('2027-05-04')
    expect(goal.completedDate).toBe('2027-05-04')
  })

  it('gates budget spend against the injected clock’s month', () => {
    const august = createMockFinanceRepository(fixedClock('2026-08-29'))
    const october = createMockFinanceRepository(fixedClock('2026-10-15'))
    const initial = august.getInitialState()
    const foodBefore = initial.budgetCategories.find((c) => c.id === 'food')!.spent

    const input = {
      type: 'expense' as const,
      title: 'Snack',
      categoryId: 'food',
      accountId: 'checking',
      date: '2026-08-30',
      amount: 25,
    }

    // Dated in August: inside the August clock's period, outside October's.
    expect(august.addTransaction(initial, input).state.budgetCategories.find((c) => c.id === 'food')!.spent).toBe(foodBefore + 25)
    expect(october.addTransaction(initial, input).state.budgetCategories.find((c) => c.id === 'food')!.spent).toBe(foodBefore)
  })

  it('validates a goal target date against the injected clock', () => {
    const initial = createMockFinanceRepository(fixedClock('2026-08-29')).getInitialState()
    const august = createMockFinanceRepository(fixedClock('2026-08-29'))
    const december = createMockFinanceRepository(fixedClock('2026-12-01'))
    const input = { name: 'Trip', targetAmount: 500, targetDate: '2026-10-01' }

    expect(() => august.createGoal(initial, input)).not.toThrow()
    expect(() => december.createGoal(initial, input)).toThrow(/past/i)
  })
})
