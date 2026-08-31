import { describe, expect, it } from 'vitest'
import type { Account, Category, CreditCard, FinanceState, Goal, Transaction } from '../domain/finance'
import {
  activeReportingPeriod,
  budgetDaysRemaining,
  cardPaymentReconciliationLabel,
  cardsDueWithinHorizon,
  categoriesForTransactionType,
  expensesToday,
  expensesTrend,
  expensesTrendRangeLabel,
  expensesTrendTitle,
  netCashFlow,
  safeToSpendBreakdown,
  totalExpenses,
  totalIncome,
  transactionMatchesSearch,
  transactionSourceLabel,
  transferCount,
  transferFeeReconciliationLabel,
} from './financeSelectors'
import { DEMO_TODAY_ISO } from '../utils/clock'

// TR-001: every time-dependent selector takes an explicit `todayIso` (or a
// `ReportingPeriod` derived from one). These tests pin it to the demo clock
// rather than the machine's date, so they are timezone- and date-independent.
const TODAY = DEMO_TODAY_ISO
const PERIOD = activeReportingPeriod(TODAY)
function today() {
  return TODAY
}

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

describe('activeReportingPeriod', () => {
  it('is the calendar month containing the injected "today"', () => {
    expect(activeReportingPeriod(TODAY)).toEqual({ start: '2026-08-01', end: '2026-09-01' })
    expect(TODAY).toBe('2026-08-29')
  })
})

describe('period-scoped totals', () => {
  it('only counts income/expenses dated inside the active period', () => {
    const state = makeState([inMonth, inMonthExpense, outOfMonthExpense, outOfMonthIncome, transfer])
    expect(totalIncome(state, PERIOD)).toBe(1000)
    expect(totalExpenses(state, PERIOD)).toBe(200)
    expect(netCashFlow(state, PERIOD)).toBe(800)
  })

  it('excludes transfers from income, expenses, and net cash flow regardless of period', () => {
    const state = makeState([transfer])
    expect(totalIncome(state, PERIOD)).toBe(0)
    expect(totalExpenses(state, PERIOD)).toBe(0)
    expect(netCashFlow(state, PERIOD)).toBe(0)
  })

  it('counts transfers only when they fall inside the active period', () => {
    const outOfMonthTransfer: Transaction = { ...transfer, id: 'transfer-2', date: '2026-01-01' }
    const state = makeState([transfer, outOfMonthTransfer])
    expect(transferCount(state, PERIOD)).toBe(1)
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
    expect(totalIncome(state, PERIOD)).toBe(10)
  })
})

describe('budgetDaysRemaining', () => {
  it('counts the days left in the active period from the demo "today"', () => {
    // 2026-08-29 -> period end 2026-09-01 => 3 days remaining
    expect(budgetDaysRemaining(TODAY)).toBe(3)
  })
})

describe('expensesToday / expensesTrend (SR-004: transaction-derived)', () => {
  const todayExpense: Transaction = { ...inMonthExpense, id: 'today-expense', date: today(), amount: -75 }

  it('expensesToday sums only expense transactions dated today()', () => {
    const state = makeState([todayExpense, inMonthExpense, inMonth, transfer])
    expect(expensesToday(state, TODAY)).toBe(75)
  })

  it('expensesToday ignores income and transfers dated today, including goal-funding transfers', () => {
    const incomeToday: Transaction = { ...inMonth, id: 'income-today', date: today(), amount: 999 }
    const transferToday: Transaction = { ...transfer, id: 'transfer-today', date: today() }
    const goalTransferToday: Transaction = { ...transfer, id: 'goal-today', date: today(), goalId: 'travel' }
    const state = makeState([incomeToday, transferToday, goalTransferToday])
    expect(expensesToday(state, TODAY)).toBe(0)
  })

  it('adding a new expense dated today changes the daily bucket for today', () => {
    const before = makeState([inMonthExpense])
    const dailyBefore = expensesTrend(before, 'daily', TODAY)
    const todayBucketBefore = dailyBefore[dailyBefore.length - 1].amount

    const after = makeState([inMonthExpense, todayExpense])
    const dailyAfter = expensesTrend(after, 'daily', TODAY)
    const todayBucketAfter = dailyAfter[dailyAfter.length - 1].amount

    expect(todayBucketAfter).toBe(todayBucketBefore + 75)
  })

  it('daily/weekly/monthly views derive from the same transaction data and total consistently for a single-day dataset', () => {
    const state = makeState([todayExpense])
    const daily = expensesTrend(state, 'daily', TODAY)
    const weekly = expensesTrend(state, 'weekly', TODAY)
    const monthly = expensesTrend(state, 'monthly', TODAY)

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
    expect(expensesTrend(state, 'daily', TODAY).reduce((s, d) => s + d.amount, 0)).toBe(0)
    expect(expensesTrend(state, 'weekly', TODAY).reduce((s, d) => s + d.amount, 0)).toBe(0)
    expect(expensesTrend(state, 'monthly', TODAY).reduce((s, d) => s + d.amount, 0)).toBe(0)
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
    const breakdown = safeToSpendBreakdown(makeMoneyState(), TODAY)
    expect(breakdown.availableCash).toBe(10_000)
    expect(breakdown.upcomingCreditMinimums).toBe(300)
    expect(breakdown.plannedGoalContributions).toBe(500)
    expect(breakdown.safeToSpend).toBe(9200)
    expect(breakdown.safeToSpend).toBe(breakdown.availableCash - breakdown.upcomingCreditMinimums - breakdown.plannedGoalContributions)
  })

  it('ignores an inactive/completed goal’s monthlyContribution (SR-003 alignment)', () => {
    const breakdown = safeToSpendBreakdown(makeMoneyState(), TODAY)
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
    const breakdown = safeToSpendBreakdown(fundedState, TODAY)
    expect(breakdown.availableCash).toBe(9500)
    expect(breakdown.safeToSpend).toBe(9500 - 300 - 500)
  })

  it('floors at zero rather than going negative', () => {
    const breakdown = safeToSpendBreakdown(makeMoneyState({ accounts: [{ ...asset, balance: 100 }] }), TODAY)
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

// TR-005: a chart title must describe exactly the window its buckets cover.
describe('expense chart windows and titles (TR-005)', () => {
  it('titles name the real window, not a calendar period the buckets do not cover', () => {
    expect(expensesTrendTitle('daily')).toBe('Last 7 days')
    expect(expensesTrendTitle('weekly')).toBe('Last 4 weeks')
    expect(expensesTrendTitle('monthly')).toBe('Last 6 months')
  })

  it('daily buckets are the 7 calendar days ending today', () => {
    const points = expensesTrend(makeState([]), 'daily', '2026-08-29')
    expect(points).toHaveLength(7)
    expect(points[0].startIso).toBe('2026-08-23')
    expect(points[0].endIso).toBe('2026-08-23')
    expect(points[6].startIso).toBe('2026-08-29')
    expect(expensesTrendRangeLabel(points)).toBe('Aug 23 – Aug 29')
  })

  it('weekly buckets are four rolling 7-day windows — spanning a month boundary, not a calendar month', () => {
    const points = expensesTrend(makeState([]), 'weekly', '2026-09-03')
    expect(points).toHaveLength(4)
    expect(points[0].startIso).toBe('2026-08-07')
    expect(points[3].endIso).toBe('2026-09-03')
    // The oldest bucket starts in August even though "today" is September:
    // the title says "Last 4 weeks", and that is exactly what it covers.
    expect(expensesTrendRangeLabel(points)).toBe('Aug 7 – Sep 3')
    // Each bucket's own label is the exact window it sums — asserting the
    // literal strings, not merely that a dash is present somewhere.
    expect(points.map((p) => p.rangeLabel)).toEqual([
      'Aug 7 – Aug 13',
      'Aug 14 – Aug 20',
      'Aug 21 – Aug 27',
      'Aug 28 – Sep 3',
    ])
    expect(points.map((p) => p.day)).toEqual(['W1', 'W2', 'W3', 'W4'])
  })

  it('monthly buckets are the six calendar months ending with today’s month, across a year boundary', () => {
    const points = expensesTrend(makeState([]), 'monthly', '2027-02-10')
    expect(points).toHaveLength(6)
    expect(points.map((p) => p.day)).toEqual(['SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB'])
    expect(points[0].startIso).toBe('2026-09-01')
    expect(points[0].endIso).toBe('2026-09-30')
    expect(points[5].startIso).toBe('2027-02-01')
    expect(points[5].endIso).toBe('2027-02-28')
    expect(expensesTrendRangeLabel(points)).toBe('Sep 1 – Feb 28')
  })

  it('sums each expense into the bucket whose declared range contains it, at a month boundary', () => {
    const lastDayOfAugust: Transaction = { ...inMonthExpense, id: 'aug-31', date: '2026-08-31', amount: -10 }
    const firstDayOfSeptember: Transaction = { ...inMonthExpense, id: 'sep-01', date: '2026-09-01', amount: -20 }
    const state = makeState([lastDayOfAugust, firstDayOfSeptember])
    const points = expensesTrend(state, 'monthly', '2026-09-01')

    const august = points.find((p) => p.day === 'AUG')!
    const september = points.find((p) => p.day === 'SEP')!
    expect(august.amount).toBe(10)
    expect(september.amount).toBe(20)
    // Every bucket's own range brackets the transactions it counted.
    expect(august.startIso <= '2026-08-31' && '2026-08-31' <= august.endIso).toBe(true)
    expect(september.startIso <= '2026-09-01' && '2026-09-01' <= september.endIso).toBe(true)
  })

  it('handles a leap-February bucket range correctly', () => {
    const points = expensesTrend(makeState([]), 'monthly', '2028-02-15')
    expect(points[5].endIso).toBe('2028-02-29')
  })
})

// TR-003: "due soon" is a documented 30-day filter, not a figure of speech.
describe('Money Position commitment horizon (TR-003)', () => {
  const near: CreditCard = { id: 'near', name: 'Near', lastFour: '1111', network: 'visa', balance: 100, limit: 1000, dueDate: '2026-09-10', minPayment: 50 }
  const edge: CreditCard = { id: 'edge', name: 'Edge', lastFour: '2222', network: 'visa', balance: 100, limit: 1000, dueDate: '2026-09-28', minPayment: 25 }
  const far: CreditCard = { id: 'far', name: 'Far', lastFour: '3333', network: 'visa', balance: 100, limit: 1000, dueDate: '2026-12-01', minPayment: 500 }
  const past: CreditCard = { id: 'past', name: 'Past', lastFour: '4444', network: 'visa', balance: 100, limit: 1000, dueDate: '2026-08-01', minPayment: 700 }

  function horizonState(): FinanceState {
    return { ...makeState([]), creditCards: [near, edge, far, past] }
  }

  it('counts only minimums due within the next 30 days, inclusive of today and the last day', () => {
    // Horizon from 2026-08-29 runs through 2026-09-28.
    const cards = cardsDueWithinHorizon(horizonState(), TODAY)
    expect(cards.map((c) => c.id)).toEqual(['near', 'edge'])
  })

  it('subtracts exactly those minimums in the safe-to-spend breakdown', () => {
    const breakdown = safeToSpendBreakdown(horizonState(), TODAY)
    expect(breakdown.upcomingCreditMinimums).toBe(75)
    expect(breakdown.cardsDueCount).toBe(2)
  })

  it('ignores a card whose stored due date is not a real date', () => {
    const broken: CreditCard = { ...far, id: 'broken', dueDate: 'Not set', minPayment: 999 }
    const state: FinanceState = { ...makeState([]), creditCards: [broken] }
    expect(cardsDueWithinHorizon(state, TODAY)).toHaveLength(0)
    expect(safeToSpendBreakdown(state, TODAY).upcomingCreditMinimums).toBe(0)
  })
})

describe('cardPaymentReconciliationLabel (TR-003)', () => {
  function cardState(): FinanceState {
    return {
      ...makeState([]),
      accounts: [{ id: 'checking', name: 'Checking', type: 'checking', classification: 'asset', balance: 0, syncStatus: 'x' }] as Account[],
      creditCards: [
        { id: 'visa', name: 'Visa Platinum', lastFour: '2290', network: 'visa', balance: 1460, limit: 5000, dueDate: '2026-09-15', minPayment: 75 },
      ],
    }
  }

  const payment: Transaction = {
    id: 'pay',
    type: 'transfer',
    title: 'Card payment · Checking → Visa Platinum ••2290',
    fromAccountId: 'checking',
    toAccountId: 'visa',
    date: '2026-08-29',
    amount: 500,
    source: 'manual',
    status: 'cleared',
  }

  it('explains a card payment as a transfer that reduced the amount owed, not an expense', () => {
    const label = cardPaymentReconciliationLabel(cardState(), payment)
    expect(label).toContain('Credit card payment')
    expect(label).toContain('₱500.00')
    expect(label).toContain('Visa Platinum')
    expect(label).toContain('not an expense')
  })

  it('returns undefined for an account-to-account transfer and for a goal-funding transfer', () => {
    expect(cardPaymentReconciliationLabel(cardState(), { ...payment, toAccountId: 'checking' })).toBeUndefined()
    expect(cardPaymentReconciliationLabel(cardState(), { ...payment, goalId: 'travel' })).toBeUndefined()
  })
})
