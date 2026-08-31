// The only FinanceRepository implementation today: everything is in-memory
// and synchronous (no fake network delay — see coding constraints).
// `FinanceProvider` takes a `FinanceRepository` as an injectable prop and
// defaults to this one. See `financeRepository.ts` for why a real
// backend-backed implementation is not a same-shape drop-in — that contract
// is synchronous and would need to become async first.

import type { Account, BudgetCategory, Category, CreditCard, FinanceState, Goal, Transaction } from '../domain/finance'
import type { FinanceRepository } from './financeRepository'
import { DEMO_TODAY_ISO, isDateInPeriod, isIsoDateBefore, monthPeriodContaining } from '../utils/date'
import { formatMoney } from '../utils/currency'

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
  { id: 'housing', name: 'Housing', color: 'var(--cyan)', budgetable: true, transactionKinds: ['expense'] },
  { id: 'food', name: 'Food & Groceries', color: 'var(--teal)', budgetable: true, transactionKinds: ['expense'] },
  { id: 'transport', name: 'Transport', color: 'var(--purple)', budgetable: true, transactionKinds: ['expense'] },
  { id: 'shopping', name: 'Shopping', color: 'var(--amber)', budgetable: true, transactionKinds: ['expense'] },
  { id: 'utilities', name: 'Utilities', color: 'var(--slate-lt-fg)', budgetable: true, transactionKinds: ['expense'] },
  { id: 'debt', name: 'Debt Payments', color: 'var(--slate-fg)', budgetable: true, transactionKinds: ['expense'] },
  { id: 'salary', name: 'Salary', color: 'var(--cyan)', budgetable: false, transactionKinds: ['income'] },
  { id: 'subscriptions', name: 'Subscriptions', color: 'var(--purple)', budgetable: false, transactionKinds: ['expense'] },
]

const NEW_CATEGORY_PALETTE = ['var(--cyan)', 'var(--teal)', 'var(--purple)', 'var(--amber)', 'var(--slate-lt-fg)']

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
    budgetVsActual,
  }
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

    // Keep the matching budget category's spend in sync for expenses — but
    // only when the transaction actually falls inside the active reporting
    // period. An expense dated outside "this month" is still recorded on
    // the ledger (it shows up in transaction history) but must not move a
    // budget figure that's labeled "this month".
    let budgetCategories = state.budgetCategories
    const activePeriod = monthPeriodContaining(DEMO_TODAY_ISO)
    if (input.type === 'expense' && input.categoryId && isDateInPeriod(input.date, activePeriod)) {
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
    // Documented rule (SR-007): a credit card's current balance may never
    // exceed its own credit limit — that combination isn't a valid card
    // state, so it's rejected here rather than allowed with a warning.
    if (input.balance > input.limit) {
      throw new Error(`Balance can’t exceed the ${formatMoney(input.limit, { withCents: false })} credit limit.`)
    }
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
    // `totalBudgetAllocated` is the fixed monthly envelope, not a running
    // sum that grows every time a category is created — see SR-002.
    // Unallocated money is the envelope minus what's already allocated to
    // existing categories, so a new category can only ever *consume* from
    // that remainder, never expand the envelope.
    const currentlyUnallocated = state.totalBudgetAllocated - state.budgetCategories.reduce((s, c) => s + c.allocated, 0)
    if (!Number.isFinite(input.allocated) || input.allocated <= 0) {
      throw new Error('Enter a budget amount greater than zero.')
    }
    if (input.allocated > currentlyUnallocated) {
      throw new Error(`Allocation can’t exceed the ${formatMoney(currentlyUnallocated, { withCents: false })} unallocated.`)
    }

    const id = nextId('cat')
    const color = input.color ?? NEW_CATEGORY_PALETTE[state.categories.length % NEW_CATEGORY_PALETTE.length]
    const category: Category = { id, name: input.name, color, budgetable: true, transactionKinds: ['expense'] }
    const budgetCategory: BudgetCategory = { id, allocated: input.allocated, spent: 0 }
    return {
      state: {
        ...state,
        categories: [...state.categories, category],
        budgetCategories: [...state.budgetCategories, budgetCategory],
      },
      category: budgetCategory,
    }
  },

  createGoal(state, input) {
    // A goal targeting a date already in the past can never be "on track" —
    // reject it here so the invariant holds regardless of which form calls
    // this (SR-007).
    if (isIsoDateBefore(input.targetDate, DEMO_TODAY_ISO)) {
      throw new Error('Target date can’t be in the past.')
    }
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

  addGoalFunds(state, goalId, sourceAccountId, amount) {
    const goal = state.goals.find((g) => g.id === goalId)
    if (!goal) {
      throw new Error('Goal not found.')
    }
    if (!goal.active) {
      throw new Error('This goal is already complete and can’t receive more funds.')
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Enter an amount greater than zero.')
    }
    const sourceAccount = state.accounts.find((a) => a.id === sourceAccountId && a.classification === 'asset')
    if (!sourceAccount) {
      throw new Error('Select an account to fund this goal from.')
    }
    const remaining = goal.targetAmount - goal.currentAmount
    if (amount > remaining) {
      throw new Error(`Enter at most ${formatMoney(remaining, { withCents: false })} — that’s all this goal needs to reach its target.`)
    }

    const accounts = state.accounts.map((a) => (a.id === sourceAccountId ? { ...a, balance: a.balance - amount } : a))

    const transaction: Transaction = {
      id: nextId('tx'),
      type: 'transfer',
      title: `Goal funding · ${goal.name}`,
      fromAccountId: sourceAccountId,
      goalId,
      date: DEMO_TODAY_ISO,
      amount,
      source: 'manual',
      status: 'cleared',
      note: 'No budget impact',
    }

    const newCurrentAmount = goal.currentAmount + amount
    const reachedTarget = newCurrentAmount >= goal.targetAmount
    const goals = state.goals.map((g) =>
      g.id === goalId
        ? {
            ...g,
            currentAmount: newCurrentAmount,
            ...(reachedTarget
              ? { status: 'goal_reached' as const, active: false, completedDate: DEMO_TODAY_ISO }
              : {}),
          }
        : g,
    )
    const updatedGoal = goals.find((g) => g.id === goalId)!

    return {
      state: { ...state, accounts, goals, transactions: [transaction, ...state.transactions] },
      goal: updatedGoal,
    }
  },
}
