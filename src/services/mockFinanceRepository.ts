// The only FinanceRepository implementation today: everything is in-memory
// and synchronous (no fake network delay — see coding constraints). A real
// backend-backed repository would implement the same `FinanceRepository`
// contract; the provider and components would not need to change.

import type { Account, BudgetCategory, Category, CreditCard, FinanceState, Goal, Transaction } from '../domain/finance'
import type { FinanceRepository } from './financeRepository'

let idCounter = 0
/** Stable, unique-enough ids for a mock/in-memory session (not persisted). */
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

// ---- Shared category directory ---------------------------------------
// The single authoritative list of categories. Budget rows and
// transactions reference a category by id — nothing else stores a
// category's display name or color a second time.
const CATEGORIES: Category[] = [
  { id: 'housing', name: 'Housing', color: 'var(--cyan)', budgetable: true },
  { id: 'food', name: 'Food & Groceries', color: 'var(--teal)', budgetable: true },
  { id: 'transport', name: 'Transport', color: 'var(--purple)', budgetable: true },
  { id: 'shopping', name: 'Shopping', color: 'var(--amber)', budgetable: true },
  { id: 'utilities', name: 'Utilities', color: 'var(--slate-lt)', budgetable: true },
  { id: 'debt', name: 'Debt Payments', color: 'var(--slate)', budgetable: true },
  { id: 'salary', name: 'Salary', color: 'var(--cyan)', budgetable: false },
  { id: 'subscriptions', name: 'Subscriptions', color: 'var(--purple)', budgetable: false },
]

const NEW_CATEGORY_PALETTE = ['var(--cyan)', 'var(--teal)', 'var(--purple)', 'var(--amber)', 'var(--slate-lt)']

function initialState(): FinanceState {
  const accounts: Account[] = [
    { id: 'checking', name: 'Checking', institution: 'BPI', type: 'checking', classification: 'asset', balance: 4120, lastFour: '4471', syncStatus: 'Synced today', monthlyChangePct: 1.8 },
    { id: 'savings', name: 'Savings', institution: 'BDO', type: 'savings', classification: 'asset', balance: 2860, lastFour: '8830', syncStatus: 'Synced today', monthlyChangePct: 0.6 },
    { id: 'gcash', name: 'GCash', type: 'ewallet', classification: 'asset', balance: 640, syncStatus: 'Linked · synced today', monthlyChangePct: 4.2 },
    { id: 'maya', name: 'Maya', type: 'ewallet', classification: 'asset', balance: 300, syncStatus: 'Linked · synced yesterday', monthlyChangePct: -1.1 },
    { id: 'cash', name: 'Cash Wallet', type: 'cash', classification: 'asset', balance: 120, syncStatus: 'Manual · updated by you', manual: true },
  ]

  const creditCards: CreditCard[] = [
    { id: 'visa', name: 'Visa Platinum', lastFour: '2290', network: 'visa', balance: 1460, limit: 5000, dueDate: 'Sep 15', minPayment: 75 },
    { id: 'mastercard', name: 'Mastercard', lastFour: '7734', network: 'mastercard', balance: 610, limit: 2000, dueDate: 'Sep 22', minPayment: 30 },
  ]

  const transactions: Transaction[] = [
    { id: 'tx1', type: 'expense', title: 'Cafe Amoreza', categoryId: 'food', accountId: 'checking', date: '2026-08-29', time: '9:14 AM', amount: -6.4, source: 'manual', status: 'cleared' },
    { id: 'tx2', type: 'expense', title: 'Grab Grocery', categoryId: 'shopping', accountId: 'gcash', date: '2026-08-29', time: '8:02 AM', amount: -41.85, source: 'ocr', status: 'cleared' },
    { id: 'tx3', type: 'expense', title: 'Grab Ride', categoryId: 'transport', accountId: 'visa', date: '2026-08-29', time: '7:48 PM', amount: -8.2, source: 'manual', status: 'cleared' },
    { id: 'tx4', type: 'income', title: 'Payroll Deposit', categoryId: 'salary', accountId: 'checking', date: '2026-08-28', time: '9:00 AM', amount: 2150, source: 'manual', status: 'cleared' },
    { id: 'tx5', type: 'expense', title: 'Meralco Bill', categoryId: 'utilities', accountId: 'savings', date: '2026-08-27', time: '6:30 PM', amount: -64.1, source: 'ocr', status: 'cleared' },
    { id: 'tx6', type: 'transfer', title: 'Checking → GCash', fromAccountId: 'checking', toAccountId: 'gcash', date: '2026-08-26', amount: 500, source: 'manual', status: 'cleared', note: 'No budget impact' },
    { id: 'tx7', type: 'expense', title: 'Netflix', categoryId: 'subscriptions', accountId: 'visa', date: '2026-08-25', source: 'recurring', status: 'pending', amount: -15 },
    { id: 'tx8', type: 'income', title: 'Freelance Payment', categoryId: 'salary', accountId: 'checking', date: '2026-08-24', time: '4:20 PM', amount: 350, source: 'manual', status: 'cleared' },
    { id: 'tx9', type: 'expense', title: 'Grab Ride', categoryId: 'transport', accountId: 'mastercard', date: '2026-08-23', time: '8:05 AM', amount: -9.1, source: 'manual', status: 'cleared' },
  ]

  const budgetCategories: BudgetCategory[] = [
    { id: 'housing', allocated: 3000, spent: 2729 },
    { id: 'food', allocated: 1600, spent: 1476, forecast: 1680 },
    { id: 'transport', allocated: 1300, spent: 1220 },
    { id: 'shopping', allocated: 1200, spent: 1460 },
    { id: 'utilities', allocated: 700, spent: 640 },
    { id: 'debt', allocated: 1800, spent: 1973 },
  ]

  const goals: Goal[] = [
    { id: 'travel', name: 'Travel', targetAmount: 4000, currentAmount: 2125, targetDate: 'Mar 2027', monthlyContribution: 100, requiredContribution: 184, status: 'behind_pace', active: true },
    { id: 'laptop', name: 'New Laptop', targetAmount: 1300, currentAmount: 1179, targetDate: 'Oct 2026', monthlyContribution: 60, status: 'on_track', active: true },
    { id: 'car', name: 'Car Down Payment', targetAmount: 5000, currentAmount: 13, targetDate: 'Jun 2027', monthlyContribution: 200, status: 'just_started', active: true },
    { id: 'home', name: 'Home Fund', targetAmount: 3500, currentAmount: 3743, targetDate: 'Nov 2026', completedDate: 'Jul 2026', status: 'goal_reached', active: false },
    { id: 'emergency', name: 'Emergency Fund', targetAmount: 3700, currentAmount: 3700, targetDate: 'Dec 2025', completedDate: 'Jan 2026', status: 'completed', active: false },
  ]

  const attentionItems = [
    { id: 'a1', type: 'payment_due' as const, title: 'Visa payment due in 3 days', severity: 'warning' as const },
    { id: 'a2', type: 'budget_warning' as const, title: 'Food & Groceries budget is near its limit', severity: 'warning' as const },
    { id: 'a3', type: 'uncategorized_transaction' as const, title: '3 transactions need categorization', severity: 'info' as const },
  ]

  const portfolio = [
    { ticker: 'AAPL', name: 'Apple', price: 1721.3, changePct: 0.7, units: 104, history: [1602, 1618, 1596, 1640, 1671, 1655, 1698, 1721.3] },
    { ticker: 'AMZN', name: 'Amazon', price: 986.45, changePct: -0.4, units: 12, history: [1010, 1005, 992, 998, 975, 981, 970, 986.45] },
    { ticker: 'MSFT', name: 'Microsoft', price: 2140.8, changePct: 1.2, units: 41, history: [1980, 2005, 2032, 2018, 2065, 2098, 2110, 2140.8] },
    { ticker: 'NVDA', name: 'Nvidia', price: 3402.15, changePct: 2.6, units: 16, history: [3020, 3105, 3180, 3160, 3255, 3298, 3350, 3402.15] },
  ]

  const expensesByDay = [
    { day: 'MON', amount: 180 },
    { day: 'TUE', amount: 240 },
    { day: 'WED', amount: 95 },
    { day: 'THU', amount: 410 },
    { day: 'FRI', amount: 150 },
    { day: 'SAT', amount: 205 },
    { day: 'SUN', amount: 312 },
  ]

  const budgetVsActual = [
    { month: 'MAR', budget: 70, actual: 62 },
    { month: 'APR', budget: 70, actual: 75 },
    { month: 'MAY', budget: 70, actual: 58 },
    { month: 'JUN', budget: 70, actual: 80 },
    { month: 'JUL', budget: 70, actual: 66 },
    { month: 'AUG', budget: 70, actual: 82 },
  ]

  return {
    accounts,
    creditCards,
    categories: CATEGORIES,
    transactions,
    budgetCategories,
    totalBudgetAllocated: 11600,
    goals,
    attentionItems,
    portfolio,
    expensesByDay,
    budgetVsActual,
  }
}

function accountLabelForId(state: FinanceState, id?: string): string {
  if (!id) return 'Unknown account'
  const account = state.accounts.find((a) => a.id === id)
  if (account) return account.lastFour ? `${account.name} ••${account.lastFour}` : account.name
  const card = state.creditCards.find((c) => c.id === id)
  if (card) return `${card.name} ••${card.lastFour}`
  return 'Unknown account'
}

export const mockFinanceRepository: FinanceRepository = {
  getInitialState: initialState,

  addTransaction(state, input) {
    const isTransfer = input.type === 'transfer'
    const signedAmount = isTransfer ? input.amount : input.type === 'income' ? input.amount : -input.amount

    const transaction: Transaction = {
      id: nextId('tx'),
      type: input.type,
      title: input.title,
      categoryId: isTransfer ? undefined : input.categoryId,
      accountId: isTransfer ? undefined : input.accountId,
      fromAccountId: isTransfer ? input.fromAccountId : undefined,
      toAccountId: isTransfer ? input.toAccountId : undefined,
      date: input.date,
      time: input.time,
      amount: signedAmount,
      fee: input.fee && input.fee > 0 ? input.fee : undefined,
      source: 'manual',
      status: 'cleared',
      note: input.note,
    }

    // Keep account/card balances consistent with the ledger.
    let accounts = state.accounts
    let creditCards = state.creditCards
    const applyDelta = (id: string | undefined, delta: number) => {
      if (!id) return
      accounts = accounts.map((a) => (a.id === id ? { ...a, balance: a.balance + delta } : a))
      creditCards = creditCards.map((c) => (c.id === id ? { ...c, balance: c.balance - delta } : c))
    }

    if (isTransfer) {
      applyDelta(input.fromAccountId, -input.amount - (input.fee ?? 0))
      applyDelta(input.toAccountId, input.amount)
    } else {
      applyDelta(input.accountId, signedAmount)
    }

    // Keep the matching budget category's spend in sync for expenses.
    let budgetCategories = state.budgetCategories
    if (input.type === 'expense' && input.categoryId) {
      budgetCategories = budgetCategories.map((c) =>
        c.id === input.categoryId ? { ...c, spent: c.spent + input.amount } : c,
      )
    }

    return {
      state: { ...state, transactions: [transaction, ...state.transactions], accounts, creditCards, budgetCategories },
      transaction,
    }
  },

  addManualAccount(state, input) {
    const account: Account = {
      id: nextId('acct'),
      name: input.name,
      institution: input.institution,
      type: input.type,
      classification: 'asset',
      balance: input.balance,
      lastFour: input.lastFour,
      syncStatus: 'Manual · updated by you',
      manual: true,
    }
    return { state: { ...state, accounts: [...state.accounts, account] }, account }
  },

  addManualCreditCard(state, input) {
    const creditCard: CreditCard = {
      id: nextId('cc'),
      name: input.name,
      lastFour: input.lastFour,
      network: input.network,
      balance: input.balance,
      limit: input.limit,
      dueDate: input.dueDate,
      minPayment: input.minPayment,
      manual: true,
    }
    return { state: { ...state, creditCards: [...state.creditCards, creditCard] }, creditCard }
  },

  addBudgetCategory(state, input) {
    const id = nextId('cat')
    const color = input.color ?? NEW_CATEGORY_PALETTE[state.categories.length % NEW_CATEGORY_PALETTE.length]
    const category: Category = { id, name: input.name, color, budgetable: true }
    const budgetCategory: BudgetCategory = { id, allocated: input.allocated, spent: 0 }
    return {
      state: {
        ...state,
        categories: [...state.categories, category],
        budgetCategories: [...state.budgetCategories, budgetCategory],
        totalBudgetAllocated: state.totalBudgetAllocated + input.allocated,
      },
      category: budgetCategory,
    }
  },

  createGoal(state, input) {
    const goal: Goal = {
      id: nextId('goal'),
      name: input.name,
      targetAmount: input.targetAmount,
      currentAmount: 0,
      targetDate: input.targetDate,
      monthlyContribution: input.monthlyContribution,
      status: 'just_started',
      active: true,
    }
    return { state: { ...state, goals: [...state.goals, goal] }, goal }
  },

  addGoalFunds(state, goalId, amount) {
    return {
      ...state,
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, currentAmount: g.currentAmount + amount } : g)),
    }
  },
}

export { accountLabelForId }
