// The only FinanceRepository implementation today: everything is in-memory
// and synchronous (no fake network delay — see coding constraints).
// `FinanceProvider` takes a `FinanceRepository` as an injectable prop and
// defaults to one built from the app clock. See `financeRepository.ts` for
// why a real backend-backed implementation is not a same-shape drop-in —
// that contract is synchronous and would need to become async first.
//
// TR-001: this repository is built around an injected `AppClock`, never a
// bare `new Date()` or a hardcoded date constant. The clock decides which
// reporting period a new expense counts toward, what date a goal-funding
// transfer is stamped with, and what date a goal completes on.
//
// TR-002: every mutation runs the shared domain validators in
// `domain/financeRules.ts` BEFORE building any new state object, so a
// rejected mutation leaves the caller's state completely untouched —
// the invariants hold whether or not the calling form validated first.

import type { Account, BudgetCategory, Category, CreditCard, FinanceState, Goal, Transaction } from '../domain/finance'
import type { FinanceRepository } from './financeRepository'
import type { AppClock } from '../utils/clock'
import { demoClock } from '../utils/clock'
import { isDateInPeriod, monthPeriodContaining } from '../utils/date'
import {
  validateAddBudgetCategory,
  validateAddGoalFunds,
  validateAddManualAccount,
  validateAddManualCreditCard,
  validateAddTransaction,
  validateCreateGoal,
} from '../domain/financeRules'

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

// TR-008: seed records use exactly the same storage formats as records the
// app creates — dates as strict `YYYY-MM-DD`, times as strict 24-hour
// `HH:mm`, goal target/completed dates and card due dates as real ISO dates
// rather than presentation strings like `'Mar 2027'` or `'Sep 15'`.
function initialState(): FinanceState {
  const accounts: Account[] = [
    { id: 'checking', name: 'Checking', institution: 'BPI', type: 'checking', classification: 'asset', balance: 4120, lastFour: '4471', syncStatus: 'Synced today', monthlyChangePct: 1.8 },
    { id: 'savings', name: 'Savings', institution: 'BDO', type: 'savings', classification: 'asset', balance: 2860, lastFour: '8830', syncStatus: 'Synced today', monthlyChangePct: 0.6 },
    { id: 'gcash', name: 'GCash', type: 'ewallet', classification: 'asset', balance: 640, syncStatus: 'Linked · synced today', monthlyChangePct: 4.2 },
    { id: 'maya', name: 'Maya', type: 'ewallet', classification: 'asset', balance: 300, syncStatus: 'Linked · synced yesterday', monthlyChangePct: -1.1 },
    { id: 'cash', name: 'Cash Wallet', type: 'cash', classification: 'asset', balance: 120, syncStatus: 'Manual · updated by you', manual: true },
  ]

  const creditCards: CreditCard[] = [
    { id: 'visa', name: 'Visa Platinum', lastFour: '2290', network: 'visa', balance: 1460, limit: 5000, dueDate: '2026-09-15', minPayment: 75 },
    { id: 'mastercard', name: 'Mastercard', lastFour: '7734', network: 'mastercard', balance: 610, limit: 2000, dueDate: '2026-09-22', minPayment: 30 },
  ]

  const transactions: Transaction[] = [
    { id: 'tx1', type: 'expense', title: 'Cafe Amoreza', categoryId: 'food', accountId: 'checking', date: '2026-08-29', time: '09:14', amount: -6.4, source: 'manual', status: 'cleared' },
    { id: 'tx2', type: 'expense', title: 'Grab Grocery', categoryId: 'shopping', accountId: 'gcash', date: '2026-08-29', time: '08:02', amount: -41.85, source: 'ocr', status: 'cleared' },
    { id: 'tx3', type: 'expense', title: 'Grab Ride', categoryId: 'transport', accountId: 'visa', date: '2026-08-29', time: '19:48', amount: -8.2, source: 'manual', status: 'cleared' },
    { id: 'tx4', type: 'income', title: 'Payroll Deposit', categoryId: 'salary', accountId: 'checking', date: '2026-08-28', time: '09:00', amount: 2150, source: 'manual', status: 'cleared' },
    { id: 'tx5', type: 'expense', title: 'Meralco Bill', categoryId: 'utilities', accountId: 'savings', date: '2026-08-27', time: '18:30', amount: -64.1, source: 'ocr', status: 'cleared' },
    { id: 'tx6', type: 'transfer', title: 'Checking → GCash', fromAccountId: 'checking', toAccountId: 'gcash', date: '2026-08-26', amount: 500, source: 'manual', status: 'cleared', note: 'No budget impact' },
    { id: 'tx7', type: 'expense', title: 'Netflix', categoryId: 'subscriptions', accountId: 'visa', date: '2026-08-25', source: 'recurring', status: 'pending', amount: -15 },
    { id: 'tx8', type: 'income', title: 'Freelance Payment', categoryId: 'salary', accountId: 'checking', date: '2026-08-24', time: '16:20', amount: 350, source: 'manual', status: 'cleared' },
    { id: 'tx9', type: 'expense', title: 'Grab Ride', categoryId: 'transport', accountId: 'mastercard', date: '2026-08-23', time: '08:05', amount: -9.1, source: 'manual', status: 'cleared' },
  ]

  const budgetCategories: BudgetCategory[] = [
    { id: 'housing', allocated: 3000, spent: 2729 },
    { id: 'food', allocated: 1600, spent: 1476, forecast: 1680 },
    { id: 'transport', allocated: 1300, spent: 1220 },
    { id: 'shopping', allocated: 1200, spent: 1460 },
    { id: 'utilities', allocated: 700, spent: 640 },
    { id: 'debt', allocated: 1800, spent: 1973 },
  ]

  // TR-004: `home` used to hold ₱3,743 against a ₱3,500 target, contradicting
  // the documented no-overfunding rule the repository enforces for
  // user-created goals. Seed data now satisfies the same invariant:
  // `currentAmount <= targetAmount` for every goal.
  const goals: Goal[] = [
    { id: 'travel', name: 'Travel', targetAmount: 4000, currentAmount: 2125, targetDate: '2027-03-01', monthlyContribution: 100, requiredContribution: 184, status: 'behind_pace', active: true },
    { id: 'laptop', name: 'New Laptop', targetAmount: 1300, currentAmount: 1179, targetDate: '2026-10-01', monthlyContribution: 60, status: 'on_track', active: true },
    { id: 'car', name: 'Car Down Payment', targetAmount: 5000, currentAmount: 13, targetDate: '2027-06-01', monthlyContribution: 200, status: 'just_started', active: true },
    { id: 'home', name: 'Home Fund', targetAmount: 3500, currentAmount: 3500, targetDate: '2026-11-01', completedDate: '2026-07-15', status: 'goal_reached', active: false },
    { id: 'emergency', name: 'Emergency Fund', targetAmount: 3700, currentAmount: 3700, targetDate: '2025-12-01', completedDate: '2026-01-15', status: 'completed', active: false },
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
    { ticker: 'BTC', name: 'Bitcoin', price: 61250.4, changePct: 1.8, units: 0.42, history: [58200, 59100, 57800, 60300, 59750, 60900, 60100, 61250.4] },
    { ticker: 'ETH', name: 'Ethereum', price: 3380.75, changePct: -1.1, units: 3.5, history: [3250, 3310, 3405, 3380, 3450, 3390, 3418, 3380.75] },
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

/**
 * Builds an in-memory repository bound to one application clock (TR-001).
 * Tests inject a `fixedClock(...)` to advance time explicitly; the app uses
 * the same clock the UI reads its reporting period from, so a saved
 * transaction and the KPI totals can never disagree about what "today" is.
 */
export function createMockFinanceRepository(clock: AppClock = demoClock): FinanceRepository {
  return {
    getInitialState: initialState,

    addTransaction(state, input) {
      // TR-002: validate first — nothing below runs for a rejected mutation,
      // so the caller keeps the exact state object it passed in.
      validateAddTransaction(state, input)

      const isTransfer = input.type === 'transfer'
      const signedAmount = isTransfer ? input.amount : input.type === 'income' ? input.amount : -input.amount

      const transaction: Transaction = {
        id: nextId('tx'),
        type: input.type,
        title: input.title.trim(),
        categoryId: isTransfer ? undefined : input.categoryId,
        accountId: isTransfer ? undefined : input.accountId,
        fromAccountId: isTransfer ? input.fromAccountId : undefined,
        toAccountId: isTransfer ? input.toAccountId : undefined,
        date: input.date,
        time: input.time || undefined,
        amount: signedAmount,
        fee: input.fee && input.fee > 0 ? input.fee : undefined,
        source: 'manual',
        status: 'cleared',
        note: input.note,
      }

      // Keep account/card balances consistent with the ledger. A positive
      // delta credits an asset account and REDUCES a credit card's amount
      // owed — which is what makes an asset → card transfer a card payment
      // (TR-003) with ordinary transfer semantics.
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
      // period. An expense dated outside the reporting month is still
      // recorded on the ledger (it shows up in transaction history) but must
      // not move a budget figure scoped to that month.
      let budgetCategories = state.budgetCategories
      const activePeriod = monthPeriodContaining(clock.todayIso())
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
      validateAddManualAccount(input)
      const account: Account = {
        id: nextId('acct'),
        name: input.name.trim(),
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
      validateAddManualCreditCard(input, clock.todayIso())
      const creditCard: CreditCard = {
        id: nextId('cc'),
        name: input.name.trim(),
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
      validateAddBudgetCategory(state, input)
      const id = nextId('cat')
      const color = input.color ?? NEW_CATEGORY_PALETTE[state.categories.length % NEW_CATEGORY_PALETTE.length]
      const category: Category = { id, name: input.name.trim(), color, budgetable: true, transactionKinds: ['expense'] }
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

    updateCategory(state, categoryId, updates) {
      const categoryIndex = state.categories.findIndex((c) => c.id === categoryId)
      if (categoryIndex === -1) throw new Error(`Category ${categoryId} not found`)

      const updatedCategory = { ...state.categories[categoryIndex], ...updates }
      const categories = [...state.categories]
      categories[categoryIndex] = updatedCategory

      const budgetCategoryIndex = state.budgetCategories.findIndex((bc) => bc.id === categoryId)
      let budgetCategories = state.budgetCategories
      if (budgetCategoryIndex !== -1 && updates.allocated !== undefined) {
        budgetCategories = [...state.budgetCategories]
        budgetCategories[budgetCategoryIndex] = { ...budgetCategories[budgetCategoryIndex], allocated: updates.allocated }
      }

      return {
        state: { ...state, categories, budgetCategories },
        category: budgetCategories[budgetCategoryIndex] || state.budgetCategories[budgetCategoryIndex],
      }
    },

    deleteCategory(state, categoryId) {
      const categories = state.categories.filter((c) => c.id !== categoryId)
      const budgetCategories = state.budgetCategories.filter((bc) => bc.id !== categoryId)
      return { ...state, categories, budgetCategories }
    },

    createGoal(state, input) {
      validateCreateGoal(input, clock.todayIso())
      const goal: Goal = {
        id: nextId('goal'),
        name: input.name.trim(),
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
      validateAddGoalFunds(state, goalId, sourceAccountId, amount)
      const goal = state.goals.find((g) => g.id === goalId)!
      const today = clock.todayIso()

      const accounts = state.accounts.map((a) => (a.id === sourceAccountId ? { ...a, balance: a.balance - amount } : a))

      const transaction: Transaction = {
        id: nextId('tx'),
        type: 'transfer',
        title: `Goal funding · ${goal.name}`,
        fromAccountId: sourceAccountId,
        goalId,
        date: today,
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
              ...(reachedTarget ? { status: 'goal_reached' as const, active: false, completedDate: today } : {}),
            }
          : g,
      )
      const updatedGoal = goals.find((g) => g.id === goalId)!

      return {
        state: { ...state, accounts, goals, transactions: [transaction, ...state.transactions] },
        goal: updatedGoal,
      }
    },

    updateGoal(state, goalId, input) {
      const goal = state.goals.find((g) => g.id === goalId)
      if (!goal) throw new Error('Goal not found.')

      const updated: Goal = {
        ...goal,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
        ...(input.targetDate !== undefined && { targetDate: input.targetDate }),
        ...(input.monthlyContribution !== undefined && { monthlyContribution: input.monthlyContribution ?? undefined }),
      }

      return {
        state: { ...state, goals: state.goals.map((g) => (g.id === goalId ? updated : g)) },
        goal: updated,
      }
    },

    deleteGoal(state, goalId) {
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== goalId),
      }
    },

    updateAccount(state, accountId, input) {
      const account = state.accounts.find((a) => a.id === accountId)
      if (!account) throw new Error('Account not found.')

      const updated: Account = {
        ...account,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.institution !== undefined && { institution: input.institution ?? undefined }),
        ...(input.lastFour !== undefined && { lastFour: input.lastFour ?? undefined }),
      }
      return {
        state: { ...state, accounts: state.accounts.map((a) => (a.id === accountId ? updated : a)) },
        account: updated,
      }
    },

    updateCreditCard(state, cardId, input) {
      const card = state.creditCards.find((c) => c.id === cardId)
      if (!card) throw new Error('Credit card not found.')

      const updated: CreditCard = { ...card, ...input }
      return {
        state: { ...state, creditCards: state.creditCards.map((c) => (c.id === cardId ? updated : c)) },
        card: updated,
      }
    },

    archiveAccount(state, accountId) {
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== accountId),
      }
    },

    archiveCreditCard(state, cardId) {
      return {
        ...state,
        creditCards: state.creditCards.filter((c) => c.id !== cardId),
      }
    },

    updateTransaction(state, transactionId, input) {
      const transaction = state.transactions.find((t) => t.id === transactionId)
      if (!transaction) {
        throw new Error('Transaction not found.')
      }

      const updatedTransaction: Transaction = {
        ...transaction,
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.date !== undefined && { date: input.date }),
        ...(input.time !== undefined && { time: input.time || undefined }),
        ...(input.amount !== undefined && input.type === transaction.type && { amount: input.type === 'transfer' ? input.amount : input.type === 'income' ? input.amount : -input.amount }),
        ...(input.fee !== undefined && { fee: input.fee && input.fee > 0 ? input.fee : undefined }),
        ...(input.note !== undefined && { note: input.note }),
      }

      const transactions = state.transactions.map((t) => (t.id === transactionId ? updatedTransaction : t))

      return {
        state: { ...state, transactions },
        transaction: updatedTransaction,
      }
    },

    reverseTransaction(state, transactionId) {
      const transaction = state.transactions.find((t) => t.id === transactionId)
      if (!transaction) {
        throw new Error('Transaction not found.')
      }

      const isTransfer = transaction.type === 'transfer'
      const reversalAmount = isTransfer ? transaction.amount : transaction.type === 'income' ? transaction.amount : -transaction.amount
      const compensatingTransaction: Transaction = {
        id: nextId('tx'),
        type: transaction.type,
        title: `Reversal: ${transaction.title}`,
        categoryId: transaction.categoryId,
        accountId: transaction.accountId,
        fromAccountId: transaction.fromAccountId,
        toAccountId: transaction.toAccountId,
        date: clock.todayIso(),
        amount: -reversalAmount,
        fee: transaction.fee,
        source: 'manual',
        status: 'cleared',
        note: `Reversal of transaction ${transaction.id}`,
      }

      let accounts = state.accounts
      let creditCards = state.creditCards
      const reverseAccountDelta = (id: string | undefined, delta: number) => {
        if (!id) return
        accounts = accounts.map((a) => (a.id === id ? { ...a, balance: a.balance - delta } : a))
        creditCards = creditCards.map((c) => (c.id === id ? { ...c, balance: c.balance + delta } : c))
      }

      if (isTransfer) {
        reverseAccountDelta(transaction.fromAccountId, reversalAmount + (transaction.fee ?? 0))
        reverseAccountDelta(transaction.toAccountId, reversalAmount)
      } else {
        reverseAccountDelta(transaction.accountId, reversalAmount)
      }

      return {
        state: {
          ...state,
          transactions: [compensatingTransaction, ...state.transactions],
          accounts,
          creditCards,
        },
        reversedTransaction: transaction,
      }
    },
  }
}

/** The app's default repository, bound to the demo clock. */
export const mockFinanceRepository: FinanceRepository = createMockFinanceRepository(demoClock)
