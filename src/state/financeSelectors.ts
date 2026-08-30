// Pure, independently-testable derived calculations over FinanceState.
// Nothing here mutates state or reads component props — every function
// takes a FinanceState (or a slice of it) and returns a value. Components
// call these through `useFinance()` rather than recomputing figures inline.

import type { Account, BudgetStatus, CreditCard, FinanceState, Goal, Transaction } from '../domain/finance'
import { accountLabelForId } from '../services/mockFinanceRepository'

// ---- Accounts / credit ------------------------------------------------

export function totalAvailableCash(state: FinanceState): number {
  return state.accounts.filter((a) => a.classification === 'asset').reduce((sum, a) => sum + a.balance, 0)
}

export function totalCreditOwed(state: FinanceState): number {
  return state.creditCards.reduce((sum, c) => sum + c.balance, 0)
}

export function totalCreditLimit(state: FinanceState): number {
  return state.creditCards.reduce((sum, c) => sum + c.limit, 0)
}

/** Balance-weighted average of each asset account's own monthly change — not a fabricated flat figure. */
export function availableCashMonthlyChangePct(state: FinanceState): number | undefined {
  const assets = state.accounts.filter((a) => a.classification === 'asset' && typeof a.monthlyChangePct === 'number')
  const total = assets.reduce((sum, a) => sum + a.balance, 0)
  if (total === 0) return undefined
  const weighted = assets.reduce((sum, a) => sum + a.balance * (a.monthlyChangePct ?? 0), 0)
  return Math.round((weighted / total) * 10) / 10
}

export function accountLabel(state: FinanceState, accountId?: string): string {
  return accountLabelForId(state, accountId)
}

export function findAccount(state: FinanceState, id?: string): Account | undefined {
  return state.accounts.find((a) => a.id === id)
}

export function findCreditCard(state: FinanceState, id?: string): CreditCard | undefined {
  return state.creditCards.find((c) => c.id === id)
}

// ---- Transactions / cash flow -----------------------------------------
// Rule: transfers never count toward income, expenses, or net cash flow.

export function totalIncome(state: FinanceState): number {
  return state.transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
}

export function totalExpenses(state: FinanceState): number {
  return Math.abs(state.transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0))
}

export function netCashFlow(state: FinanceState): number {
  return totalIncome(state) - totalExpenses(state)
}

export function transferCount(state: FinanceState): number {
  return state.transactions.filter((t) => t.type === 'transfer').length
}

export function categoryName(state: FinanceState, categoryId?: string): string | undefined {
  return state.categories.find((c) => c.id === categoryId)?.name
}

export function categoryColor(state: FinanceState, categoryId?: string): string {
  return state.categories.find((c) => c.id === categoryId)?.color ?? 'var(--text-dim)'
}

/** Stable per-account color used for transaction-list account dots (falls back for unknown ids). */
const ACCOUNT_DOT_COLORS: Record<string, string> = {
  checking: 'var(--cyan)',
  savings: 'var(--teal)',
  gcash: 'var(--purple)',
  maya: 'var(--purple)',
  cash: 'var(--slate-lt)',
  visa: 'var(--amber)',
  mastercard: 'var(--amber)',
}

export function accountDotColor(accountId?: string): string {
  return (accountId && ACCOUNT_DOT_COLORS[accountId]) || 'var(--text-faint)'
}

export function expensesToday(state: FinanceState): number {
  const days = state.expensesByDay
  return days.length ? days[days.length - 1].amount : 0
}

// ---- Budget -------------------------------------------------------------

export function budgetStatus(allocated: number, spent: number): BudgetStatus {
  const pct = allocated > 0 ? (spent / allocated) * 100 : 0
  if (pct >= 100) return 'over_budget'
  if (pct >= 90) return 'near_limit'
  if (pct >= 75) return 'on_track'
  return 'safe'
}

export function totalBudgetSpent(state: FinanceState): number {
  return state.budgetCategories.reduce((s, c) => s + c.spent, 0)
}

export function totalBudgetRemaining(state: FinanceState): number {
  return state.totalBudgetAllocated - totalBudgetSpent(state)
}

export function budgetUsedPct(state: FinanceState): number {
  return state.totalBudgetAllocated > 0 ? Math.round((totalBudgetSpent(state) / state.totalBudgetAllocated) * 100) : 0
}

export function budgetUnallocated(state: FinanceState): number {
  return state.totalBudgetAllocated - state.budgetCategories.reduce((s, c) => s + c.allocated, 0)
}

function countByStatus(state: FinanceState, status: BudgetStatus): number {
  return state.budgetCategories.filter((c) => budgetStatus(c.allocated, c.spent) === status).length
}

export function budgetSafeCount(state: FinanceState): number {
  return countByStatus(state, 'safe')
}
export function budgetOnTrackCount(state: FinanceState): number {
  return countByStatus(state, 'on_track')
}
export function budgetNearLimitCount(state: FinanceState): number {
  return countByStatus(state, 'near_limit')
}
export function budgetOverCount(state: FinanceState): number {
  return countByStatus(state, 'over_budget')
}

export function budgetDaysRemaining(): number {
  // Sample data models "today" as Aug 29 in a 31-day month.
  return 3
}

/** Spend Mix derives directly from the same budget-category records as the Budget page's spent total, so the two totals can never drift apart. */
export function spendMix(state: FinanceState): { categoryId: string; category: string; amount: number; pct: number; color: string }[] {
  const total = totalBudgetSpent(state)
  return state.budgetCategories
    .map((c) => {
      const cat = state.categories.find((cc) => cc.id === c.id)
      return {
        categoryId: c.id,
        category: cat?.name ?? c.id,
        amount: c.spent,
        pct: total > 0 ? Math.round((c.spent / total) * 100) : 0,
        color: cat?.color ?? 'var(--text-dim)',
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

export function spendMixTotal(state: FinanceState): number {
  return totalBudgetSpent(state)
}

// ---- Goals ---------------------------------------------------------------

export function activeGoals(state: FinanceState): Goal[] {
  return state.goals.filter((g) => g.active)
}

export function completedGoals(state: FinanceState): Goal[] {
  return state.goals.filter((g) => !g.active)
}

export function totalGoalSavings(state: FinanceState): number {
  return state.goals.reduce((s, g) => s + g.currentAmount, 0)
}

export function monthlyContributionTotal(state: FinanceState): number {
  return activeGoals(state).reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
}

/** Average progress across ACTIVE goals only — a completed goal at 100%+ would otherwise inflate this. */
export function avgGoalProgressPct(state: FinanceState): number {
  const active = activeGoals(state)
  if (active.length === 0) return 0
  return Math.round((active.reduce((s, g) => s + g.currentAmount / g.targetAmount, 0) / active.length) * 100)
}

/** Progress percentage clamped to [0, 100] for rendering a fill bar. */
export function goalProgressPct(goal: Goal): number {
  return Math.max(0, Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)))
}

/** True (uncapped) progress percentage, e.g. 107% for a goal exceeded past its target. */
export function goalRawProgressPct(goal: Goal): number {
  return Math.round((goal.currentAmount / goal.targetAmount) * 100)
}

// ---- Transaction list helpers ---------------------------------------------

export function transactionAccountLabel(state: FinanceState, t: Transaction): string {
  if (t.type === 'transfer') {
    return `${accountLabel(state, t.fromAccountId)} → ${accountLabel(state, t.toAccountId)}`
  }
  return accountLabel(state, t.accountId)
}

export function transactionAccountDotColor(t: Transaction): string {
  return t.type === 'transfer' ? 'var(--text-faint)' : accountDotColor(t.accountId)
}
