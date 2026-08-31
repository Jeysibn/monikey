import { describe, expect, it } from 'vitest'
import type { Account, Category, CreditCard, FinanceState, Goal, Transaction } from '../domain/finance'
import {
  activeReportingPeriod,
  budgetDaysRemaining,
  categoriesForTransactionType,
  expensesToday,
  expensesTrend,
  netCashFlow,
  safeToSpendBreakdown,
  today,
  totalExpenses,
  totalIncome,
  transactionMatchesSearch,
  transactionSourceLabel,
  transferCount,
  transferFeeReconciliationLabel,
} from './financeSelectors'

function makeState(transactions: Transaction[]): FinanceState {
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

const inMonth: Transaction = {
  id: 'in-month-income',
  type: 'income',
  title: 'Payroll',
  date: '2026-08-15',
  amount: 1000,
  source: 'manual',
  status: 'cleared',
}

const inMonthExpense: Transaction = {
  id: 'in-month-expense',
  type: 'expense',
  title: 'Groceries',
  date: '2026-08-20',
  amount: -200,
  source: 'manual',
  status: 'cleared',
}

const outOfMonthExpense: Transaction = {
  id: 'past-month-expense',
  type: 'expense',
  title: 'Old rent',
  date: '2026-06-01',
  amount: -500,
  source: 'manual',
  status: 'cleared',
}

const outOfMonthIncome: Transaction = {
  id: 'future-month-income',
  type: 'income',
  title: 'Bonus',
  date: '2026-12-01',
  amount: 5000,
  source: 'manual',
  status: 'cleared',
}

const transfer: Transaction = {
  id: 'transfer-1',
  type: 'transfer',
  title: 'Checking -> Savings',
  fromAccountId: 'checking',
  toAccountId: 'savings',
  date: '2026-08-10',
  amount: 300,
  source: 'manual',
  status: 'cleared',
}

describe('activeReportingPeriod / today', () => {
  it('is the calendar month containing the demo "today"', () => {
    const period = activeReportingPeriod()
    expect(period).toEqual({ start: '2026-08-01', end: '2026-09-01' })
    expect(today()).toBe('2026-08-29')
  })
})

describe('period-scoped totals', () => {
  it('only counts income/expenses dated inside the active period', () => {
    const state = makeState([inMonth, inMonthExpense, outOfMonthExpense, outOfMonthIncome, transfer])
    expect(totalIncome(state)).toBe(1000)
    expect(totalExpenses(state)).toBe(200)
    expect(netCashFlow(state)).toBe(800)
  })

  it('excludes transfers from income, expenses, and net cash flow regardless of period', () => {
    const state = makeState([transfer])
    expect(totalIncome(state)).toBe(0)
    expect(totalExpenses(state)).toBe(0)
    expect(netCashFlow(state)).toBe(0)
  })

  it('counts transfers only when they fall inside the active period', () => {
    const outOfMonthTransfer: Transaction = { ...transfer, id: 'transfer-2', date: '2026-01-01' }
    const state = makeState([transfer, outOfMonthTransfer])
    expect(transferCount(state)).toBe(1)
  })

  it('accepts an explicit period instead of the default active one', () => {
    const state = makeState([inMonth, outOfMonthExpense])
    const june = { start: '2026-06-01', end: '2026-07-01' }
    expect(totalIncome(state, june)).toBe(0)
    expect(totalExpenses(state, june)).toBe(500)
  })

  it('treats boundary dates deterministically: start of month included, next month excluded', () => {
    const startOfMonth: Transaction = { ...inMonth, id: 'start', date: '2026-08-01', amount: 10 }
    const startOfNextMonth: Transaction = { ...inMonth, id: 'next', date: '2026-09-01', amount: 20 }
    const state = makeState([startOfMonth, startOfNextMonth])
    expect(totalIncome(state)).toBe(10)
  })
})

describe('budgetDaysRemaining', () => {
  it('counts the days left in the active period from the demo "today"', () => {
    // 2026-08-29 -> period end 2026-09-01 => 3 days remaining
    expect(budgetDaysRemaining()).toBe(3)
  })
})

describe('expensesToday / expensesTrend (SR-004: transaction-derived)', () => {
  const todayExpense: Transaction = { ...inMonthExpense, id: 'today-expense', date: today(), amount: -75 }

  it('expensesToday sums only expense transactions dated today()', () => {
    const state = makeState([todayExpense, inMonthExpense, inMonth, transfer])
    expect(expensesToday(state)).toBe(75)
  })

  it('expensesToday ignores income and transfers dated today, including goal-funding transfers', () => {
    const incomeToday: Transaction = { ...inMonth, id: 'income-today', date: today(), amount: 999 }
    const transferToday: Transaction = { ...transfer, id: 'transfer-today', date: today() }
    const goalTransferToday: Transaction = { ...transfer, id: 'goal-today', date: today(), goalId: 'travel' }
    const state = makeState([incomeToday, transferToday, goalTransferToday])
    expect(expensesToday(state)).toBe(0)
  })

  it('adding a new expense dated today changes the daily bucket for today', () => {
    const before = makeState([inMonthExpense])
    const dailyBefore = expensesTrend(before, 'daily')
    const todayBucketBefore = dailyBefore[dailyBefore.length - 1].amount

    const after = makeState([inMonthExpense, todayExpense])
    const dailyAfter = expensesTrend(after, 'daily')
    const todayBucketAfter = dailyAfter[dailyAfter.length - 1].amount

    expect(todayBucketAfter).toBe(todayBucketBefore + 75)
  })

  it('daily/weekly/monthly views derive from the same transaction data and total consistently for a single-day dataset', () => {
    const state = makeState([todayExpense])
    const daily = expensesTrend(state, 'daily')
    const weekly = expensesTrend(state, 'weekly')
    const monthly = expensesTrend(state, 'monthly')

    expect(daily.reduce((s, d) => s + d.amount, 0)).toBe(75)
    expect(weekly.reduce((s, d) => s + d.amount, 0)).toBe(75)
    expect(monthly.reduce((s, d) => s + d.amount, 0)).toBe(75)
    expect(daily).toHaveLength(7)
    expect(weekly).toHaveLength(4)
    expect(monthly).toHaveLength(6)
  })

  it('excludes transfers (including goal-funding transfers) from every trend view', () => {
    const goalTransferToday: Transaction = { ...transfer, id: 'goal-today', date: today(), goalId: 'travel', amount: 500 }
    const state = makeState([goalTransferToday])
    expect(expensesTrend(state, 'daily').reduce((s, d) => s + d.amount, 0)).toBe(0)
    expect(expensesTrend(state, 'weekly').reduce((s, d) => s + d.amount, 0)).toBe(0)
    expect(expensesTrend(state, 'monthly').reduce((s, d) => s + d.amount, 0)).toBe(0)
  })
})

describe('categoriesForTransactionType (SR-006)', () => {
  const categories: Category[] = [
    { id: 'housing', name: 'Housing', color: '#fff', budgetable: true, transactionKinds: ['expense'] },
    { id: 'salary', name: 'Salary', color: '#fff', budgetable: false, transactionKinds: ['income'] },
    { id: 'refund', name: 'Refund', color: '#fff', budgetable: false, transactionKinds: ['income', 'expense'] },
  ]

  it('excludes Salary from expense options and Housing from income options', () => {
    const expenseOptions = categoriesForTransactionType(categories, 'expense')
    const incomeOptions = categoriesForTransactionType(categories, 'income')

    expect(expenseOptions.map((c) => c.id)).toEqual(['housing', 'refund'])
    expect(expenseOptions.find((c) => c.id === 'salary')).toBeUndefined()

    expect(incomeOptions.map((c) => c.id)).toEqual(['salary', 'refund'])
    expect(incomeOptions.find((c) => c.id === 'housing')).toBeUndefined()
  })

  it('includes categories applicable to both kinds in either list', () => {
    expect(categoriesForTransactionType(categories, 'expense').some((c) => c.id === 'refund')).toBe(true)
    expect(categoriesForTransactionType(categories, 'income').some((c) => c.id === 'refund')).toBe(true)
  })
})

describe('safeToSpendBreakdown (SR-008)', () => {
  const asset: Account = {
    id: 'checking',
    name: 'Checking',
    type: 'checking',
    classification: 'asset',
    balance: 10_000,
    syncStatus: 'synced',
  }

  const card: CreditCard = {
    id: 'card-1',
    name: 'Visa',
    lastFour: '1234',
    network: 'visa',
    balance: 2000,
    limit: 5000,
    dueDate: '2026-09-05',
    minPayment: 300,
  }

  const activeGoal: Goal = {
    id: 'goal-1',
    name: 'Emergency fund',
    targetAmount: 20_000,
    currentAmount: 5000,
    targetDate: '2027-01-01',
    monthlyContribution: 500,
    status: 'on_track',
    active: true,
  }

  const completedGoal: Goal = {
    id: 'goal-2',
    name: 'Laptop',
    targetAmount: 1000,
    currentAmount: 1000,
    targetDate: '2026-01-01',
    completedDate: '2026-06-01',
    monthlyContribution: 999,
    status: 'goal_reached',
    active: false,
  }

  function makeMoneyState(overrides: Partial<FinanceState> = {}): FinanceState {
    return { ...makeState([]), accounts: [asset], creditCards: [card], goals: [activeGoal, completedGoal], ...overrides }
  }

  it('reconciles exactly: safeToSpend = availableCash - upcomingCreditMinimums - plannedGoalContributions', () => {
    const breakdown = safeToSpendBreakdown(makeMoneyState())
    expect(breakdown.availableCash).toBe(10_000)
    expect(breakdown.upcomingCreditMinimums).toBe(300)
    expect(breakdown.plannedGoalContributions).toBe(500)
    expect(breakdown.safeToSpend).toBe(9200)
    expect(breakdown.safeToSpend).toBe(breakdown.availableCash - breakdown.upcomingCreditMinimums - breakdown.plannedGoalContributions)
  })

  it('ignores an inactive/completed goal’s monthlyContribution (SR-003 alignment)', () => {
    const breakdown = safeToSpendBreakdown(makeMoneyState())
    // Only the active goal's 500 is counted, not the completed goal's 999.
    expect(breakdown.plannedGoalContributions).toBe(500)
  })

  it('does not subtract a funded goal’s currentAmount a second time — that money already left an account balance', () => {
    // A goal funded via addGoalFunds reduces the source account's balance
    // directly, so availableCash already reflects it. Funding more should
    // reduce availableCash (through the account) without any separate
    // deduction for currentAmount/totalGoalSavings.
    const fundedState = makeMoneyState({
      accounts: [{ ...asset, balance: 9500 }], // as if 500 was just moved out
      goals: [{ ...activeGoal, currentAmount: 5500 }, completedGoal],
    })
    const breakdown = safeToSpendBreakdown(fundedState)
    expect(breakdown.availableCash).toBe(9500)
    expect(breakdown.safeToSpend).toBe(9500 - 300 - 500)
  })

  it('floors at zero rather than going negative', () => {
    const breakdown = safeToSpendBreakdown(
      makeMoneyState({ accounts: [{ ...asset, balance: 100 }] }),
    )
    expect(breakdown.safeToSpend).toBe(0)
  })
})

describe('transferFeeReconciliationLabel (SR-010)', () => {
  function makeTransferState(): FinanceState {
    return {
      ...makeState([]),
      accounts: [
        { id: 'checking', name: 'Checking', type: 'checking', classification: 'asset', balance: 0 },
        { id: 'gcash', name: 'GCash', type: 'e-wallet', classification: 'asset', balance: 0 },
      ] as Account[],
    }
  }

  it('explains a ₱100 transfer + ₱5 fee as a ₱105 reduction from the source account', () => {
    const state = makeTransferState()
    const tx: Transaction = {
      id: 'tx-fee',
      type: 'transfer',
      title: 'Checking → GCash',
      fromAccountId: 'checking',
      toAccountId: 'gcash',
      date: '2026-08-15',
      amount: 100,
      fee: 5,
      source: 'manual',
      status: 'cleared',
    }
    const label = transferFeeReconciliationLabel(state, tx)
    expect(label).toContain('₱100.00')
    expect(label).toContain('₱5.00')
    expect(label).toContain('₱105.00')
    expect(label).toContain('Checking')
  })

  it('returns undefined for a transfer with no fee', () => {
    const state = makeTransferState()
    const tx: Transaction = {
      id: 'tx-no-fee',
      type: 'transfer',
      title: 'Checking → GCash',
      fromAccountId: 'checking',
      toAccountId: 'gcash',
      date: '2026-08-15',
      amount: 100,
      source: 'manual',
      status: 'cleared',
    }
    expect(transferFeeReconciliationLabel(state, tx)).toBeUndefined()
  })

  it('returns undefined for a non-transfer transaction', () => {
    expect(transferFeeReconciliationLabel(makeTransferState(), inMonthExpense)).toBeUndefined()
  })
})

describe('transactionSourceLabel (SR-010)', () => {
  it('distinguishes manual, ocr, and recurring — never collapses recurring into manual', () => {
    expect(transactionSourceLabel({ ...inMonthExpense, source: 'manual' })).toBe('Manual')
    expect(transactionSourceLabel({ ...inMonthExpense, source: 'ocr' })).toBe('OCR receipt')
    expect(transactionSourceLabel({ ...inMonthExpense, source: 'recurring' })).toBe('Recurring')
  })
})

describe('transactionMatchesSearch (SR-010)', () => {
  function makeSearchState(): FinanceState {
    return {
      ...makeState([]),
      accounts: [{ id: 'checking', name: 'Checking', type: 'checking', classification: 'asset', balance: 0 }] as Account[],
      categories: [{ id: 'food', name: 'Food & Dining', color: '#fff', budgetable: true, transactionKinds: ['expense'] }] as Category[],
    }
  }

  const tx: Transaction = {
    id: 'tx-search',
    type: 'expense',
    title: 'Cafe Amoreza',
    categoryId: 'food',
    accountId: 'checking',
    date: '2026-08-15',
    amount: -10,
    source: 'manual',
    status: 'cleared',
  }

  it('matches by title', () => {
    expect(transactionMatchesSearch(makeSearchState(), tx, 'amoreza')).toBe(true)
  })

  it('matches by category name', () => {
    expect(transactionMatchesSearch(makeSearchState(), tx, 'food')).toBe(true)
  })

  it('matches by account label', () => {
    expect(transactionMatchesSearch(makeSearchState(), tx, 'checking')).toBe(true)
  })

  it('does not match an unrelated term', () => {
    expect(transactionMatchesSearch(makeSearchState(), tx, 'utilities')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(transactionMatchesSearch(makeSearchState(), tx, '')).toBe(true)
  })
})
