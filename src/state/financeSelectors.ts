// Pure, independently-testable derived calculations over FinanceState.
// Nothing here mutates state or reads component props — every function
// takes a FinanceState (or a slice of it) and returns a value. Components
// call these through `useFinance()` rather than recomputing figures inline.

import type { Account, BudgetStatus, Category, CreditCard, FinanceState, Goal, ReportingPeriod, Transaction } from '../domain/finance'
import { DEMO_TODAY_ISO, isDateInPeriod, localDateFromIso, monthPeriodContaining } from '../utils/date'
import { formatMoney } from '../utils/currency'

// ---- Reporting period ---------------------------------------------------
// The single definition of "this month" / "today" used by every period-based
// calculation below. Nothing else in the app (component or selector) should
// define its own month boundary or compare ISO date strings directly.

/** The calendar month every "this month" KPI is computed over. */
export function activeReportingPeriod(): ReportingPeriod {
  return monthPeriodContaining(DEMO_TODAY_ISO)
}

/** The date every "today" figure refers to. */
export function today(): string {
  return DEMO_TODAY_ISO
}

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

/**
 * Categories selectable for a given transaction type (SR-006). Income and
 * expense have disjoint category lists (e.g. Salary is income-only, Housing
 * is expense-only) — this is the single place that rule is enforced so
 * components never duplicate it. Transfers never carry a category.
 */
export function categoriesForTransactionType(categories: Category[], type: 'income' | 'expense'): Category[] {
  return categories.filter((c) => c.transactionKinds.includes(type))
}

/** Human-readable label for an account or credit card id, e.g. "Checking ••1234". Pure — depends only on `FinanceState`, not on any repository implementation. */
export function accountLabel(state: FinanceState, id?: string): string {
  if (!id) return 'Unknown account'
  const account = state.accounts.find((a) => a.id === id)
  if (account) return account.lastFour ? `${account.name} ••${account.lastFour}` : account.name
  const card = state.creditCards.find((c) => c.id === id)
  if (card) return `${card.name} ••${card.lastFour}`
  return 'Unknown account'
}

export function findAccount(state: FinanceState, id?: string): Account | undefined {
  return state.accounts.find((a) => a.id === id)
}

export function findCreditCard(state: FinanceState, id?: string): CreditCard | undefined {
  return state.creditCards.find((c) => c.id === id)
}

// ---- Transactions / cash flow -----------------------------------------
// Rule: transfers never count toward income, expenses, or net cash flow.

export function totalIncome(state: FinanceState, period: ReportingPeriod = activeReportingPeriod()): number {
  return state.transactions
    .filter((t) => t.type === 'income' && isDateInPeriod(t.date, period))
    .reduce((s, t) => s + t.amount, 0)
}

export function totalExpenses(state: FinanceState, period: ReportingPeriod = activeReportingPeriod()): number {
  return Math.abs(
    state.transactions
      .filter((t) => t.type === 'expense' && isDateInPeriod(t.date, period))
      .reduce((s, t) => s + t.amount, 0),
  )
}

export function netCashFlow(state: FinanceState, period: ReportingPeriod = activeReportingPeriod()): number {
  return totalIncome(state, period) - totalExpenses(state, period)
}

/** Counts account-to-account transfers only — goal-funding transfers (see `Transaction.goalId`) are a different kind of movement and are surfaced on the Goals page instead. */
export function transferCount(state: FinanceState, period: ReportingPeriod = activeReportingPeriod()): number {
  return state.transactions.filter((t) => t.type === 'transfer' && !t.goalId && isDateInPeriod(t.date, period)).length
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

// ---- Expense trend (SR-004) --------------------------------------------
// The dashboard's expense chart, legend, and accessible table all read from
// `expensesTrend` below — there is no separate `expensesTrend` slice of
// `FinanceState` to drift out of sync with the transaction ledger. Every
// bucket is a live sum over `state.transactions`, so adding, in particular,
// an expense dated `today()` changes both `expensesToday` and the relevant
// chart bucket on the next render. Transfers (including goal-funding
// transfers, which carry a `goalId`) are never expenses and are excluded by
// the `type === 'expense'` filter shared by every helper here.

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Sum of expense amounts (as a positive figure) with a date in `[start, end)`, compared as local dates. */
function expenseAmountInRange(state: FinanceState, start: Date, end: Date): number {
  return Math.abs(
    state.transactions
      .filter((t) => t.type === 'expense')
      .filter((t) => {
        const d = localDateFromIso(t.date)
        return !!d && d.getTime() >= start.getTime() && d.getTime() < end.getTime()
      })
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

/** Total expenses posted on `today()` — the "today" figure shown next to the daily chart. */
export function expensesToday(state: FinanceState): number {
  const day = localDateFromIso(today())
  if (!day) return 0
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  return expenseAmountInRange(state, day, next)
}

export type ExpensesTrendUnit = 'daily' | 'weekly' | 'monthly'

/**
 * The single aggregation function backing every view of the Dashboard
 * expense trend chart. All three units bucket the same expense transactions,
 * anchored at `today()`, so switching the period control can never desync
 * the chart, its legend, or the accessible `<table>`/list built from the
 * same array:
 *   - `daily`: the 7 calendar days ending at (and including) `today()`.
 *   - `weekly`: the 4 rolling 7-day windows ending at `today()` (oldest
 *     first), labeled W1..W4.
 *   - `monthly`: the 6 calendar months ending with the month containing
 *     `today()`, labeled by month abbreviation.
 */
export function expensesTrend(state: FinanceState, unit: ExpensesTrendUnit): { day: string; amount: number }[] {
  const anchor = localDateFromIso(today())
  if (!anchor) return []

  if (unit === 'daily') {
    const points: { day: string; amount: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i)
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      points.push({ day: WEEKDAY_LABELS[day.getDay()], amount: expenseAmountInRange(state, day, next) })
    }
    return points
  }

  if (unit === 'weekly') {
    const points: { day: string; amount: number }[] = []
    for (let w = 3; w >= 0; w--) {
      const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - w * 7 + 1)
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7)
      points.push({ day: `W${4 - w}`, amount: expenseAmountInRange(state, start, end) })
    }
    return points
  }

  const points: { day: string; amount: number }[] = []
  for (let m = 5; m >= 0; m--) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - m, 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() - m + 1, 1)
    points.push({ day: MONTH_LABELS[start.getMonth()], amount: expenseAmountInRange(state, start, end) })
  }
  return points
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

export function budgetDaysRemaining(period: ReportingPeriod = activeReportingPeriod()): number {
  const now = localDateFromIso(today())
  const end = localDateFromIso(period.end)
  if (!now || !end) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.round((end.getTime() - now.getTime()) / msPerDay))
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

// ---- Money position / "Estimated safe to spend" (SR-008) ---------------

/**
 * Line-by-line breakdown behind the dashboard's "Estimated safe to spend"
 * figure. Every field here reconciles exactly:
 * `safeToSpend === max(0, availableCash - upcomingCreditMinimums - plannedGoalContributions)`.
 *
 * Goal-money accounting (verified against the SR-003 funded-savings model):
 * `addGoalFunds` debits a source account and credits `Goal.currentAmount`
 * immediately, in the same transaction — so money already funded into a
 * goal has already left `totalAvailableCash` via the reduced account
 * balance. It must NOT be subtracted again here, and this selector does
 * not touch `currentAmount`/`totalGoalSavings` at all.
 *
 * `plannedGoalContributions` (`monthlyContributionTotal`) is a different
 * number: a goal's *pledged pace* for the month (`Goal.monthlyContribution`),
 * which is not moved out of any account until the user actually calls
 * `addGoalFunds`. That money is still sitting in `totalAvailableCash`, so
 * subtracting it here is not a double-count — it is treating an intended,
 * not-yet-executed transfer the same way an upcoming credit card minimum
 * (also unpaid) is treated: a known near-term claim on today's cash.
 *
 * Deliberately excluded: recurring bills. Monikey has no recurring-bills
 * feature yet, so there is no data source for rent, subscriptions, or
 * utilities — the UI must say so rather than imply completeness.
 */
export interface SafeToSpendBreakdown {
  availableCash: number
  upcomingCreditMinimums: number
  plannedGoalContributions: number
  safeToSpend: number
}

export function safeToSpendBreakdown(state: FinanceState): SafeToSpendBreakdown {
  const availableCash = totalAvailableCash(state)
  const upcomingCreditMinimums = state.creditCards.reduce((sum, c) => sum + c.minPayment, 0)
  const plannedGoalContributions = monthlyContributionTotal(state)
  const safeToSpend = Math.max(0, availableCash - upcomingCreditMinimums - plannedGoalContributions)
  return { availableCash, upcomingCreditMinimums, plannedGoalContributions, safeToSpend }
}

/** True (uncapped) progress percentage, e.g. 107% for a goal exceeded past its target. */
export function goalRawProgressPct(goal: Goal): number {
  return Math.round((goal.currentAmount / goal.targetAmount) * 100)
}

// ---- Transaction list helpers ---------------------------------------------

export function transactionAccountLabel(state: FinanceState, t: Transaction): string {
  if (t.type === 'transfer') {
    if (t.goalId) {
      const goalName = state.goals.find((g) => g.id === t.goalId)?.name ?? 'goal'
      return `${accountLabel(state, t.fromAccountId)} → ${goalName}`
    }
    return `${accountLabel(state, t.fromAccountId)} → ${accountLabel(state, t.toAccountId)}`
  }
  return accountLabel(state, t.accountId)
}

export function transactionAccountDotColor(t: Transaction): string {
  return t.type === 'transfer' ? 'var(--text-faint)' : accountDotColor(t.accountId)
}

/**
 * Reconciliation rule (SR-010): a transfer fee is part of the transfer, not
 * a separate expense — it is debited from the source account alongside the
 * transferred amount (see `applyDelta(fromAccountId, -amount - fee)` in
 * `mockFinanceRepository.ts`). This is the single place that renders that
 * arithmetic back out for display, e.g. "₱100.00 transfer + ₱5.00 fee =
 * ₱105.00 from Checking", so the source-account delta is always visible and
 * reconcilable from the transaction row. Returns `undefined` for anything
 * that isn't a fee-bearing transfer.
 */
export function transferFeeReconciliationLabel(state: FinanceState, t: Transaction): string | undefined {
  if (t.type !== 'transfer' || !t.fee || t.fee <= 0) return undefined
  const total = t.amount + t.fee
  return `${formatMoney(t.amount)} transfer + ${formatMoney(t.fee)} fee = ${formatMoney(total)} from ${accountLabel(state, t.fromAccountId)}`
}

/** Source label for a transaction, distinguishing manual, OCR, and recurring entries (SR-010). Never collapse `recurring` into `manual`. */
export function transactionSourceLabel(t: Transaction): string {
  if (t.source === 'ocr') return 'OCR receipt'
  if (t.source === 'recurring') return 'Recurring'
  return 'Manual'
}

/**
 * Whether a transaction matches a free-text search term against its title,
 * category name, or the account/transfer label shown in its row (SR-010) —
 * not title alone.
 */
export function transactionMatchesSearch(state: FinanceState, t: Transaction, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystacks = [t.title, categoryName(state, t.categoryId), transactionAccountLabel(state, t)]
  return haystacks.some((h) => h?.toLowerCase().includes(q))
}
