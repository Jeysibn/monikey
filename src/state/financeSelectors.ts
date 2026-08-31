// Pure, independently-testable derived calculations over FinanceState.
// Nothing here mutates state, reads component props, or asks the machine
// what day it is — every function takes a FinanceState (or a slice of it),
// plus an explicit `todayIso`/`ReportingPeriod` where the calculation is
// time-dependent, and returns a value. Components call these through
// `useFinance()`, which resolves `todayIso` once from the injected
// `AppClock` (TR-001) and passes it down, rather than recomputing figures
// inline or calling `new Date()`.

import type { Account, BudgetStatus, Category, CreditCard, FinanceState, Goal, ReportingPeriod, Transaction } from '../domain/finance'
import {
  addDaysToIso,
  formatDateLabel,
  isDateInPeriod,
  isIsoDateWithinInclusive,
  isoFromLocalDate,
  localDateFromIso,
  monthPeriodContaining,
} from '../utils/date'
import { formatMoney } from '../utils/currency'

// ---- Reporting period ---------------------------------------------------
// The single definition of "this reporting month" used by every period-based
// calculation below. Nothing else in the app (component or selector) should
// define its own month boundary or compare ISO date strings directly.

/** The calendar month every period-scoped KPI is computed over, for a given "today". */
export function activeReportingPeriod(todayIso: string): ReportingPeriod {
  return monthPeriodContaining(todayIso)
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

/** True when the id names a credit card rather than an asset account — the transfer form uses this to switch to card-payment wording (TR-003). */
export function isCreditCardId(state: FinanceState, id?: string): boolean {
  return !!id && state.creditCards.some((c) => c.id === id)
}

// ---- Transactions / cash flow -----------------------------------------
// Rule: transfers never count toward income, expenses, or net cash flow.
// That includes a credit-card payment (an asset → card transfer, TR-003),
// which moves money between two things the user already owns/owes and so
// must not change either cash-flow total.

export function totalIncome(state: FinanceState, period: ReportingPeriod): number {
  return state.transactions
    .filter((t) => t.type === 'income' && isDateInPeriod(t.date, period))
    .reduce((s, t) => s + t.amount, 0)
}

export function totalExpenses(state: FinanceState, period: ReportingPeriod): number {
  return Math.abs(
    state.transactions
      .filter((t) => t.type === 'expense' && isDateInPeriod(t.date, period))
      .reduce((s, t) => s + t.amount, 0),
  )
}

export function netCashFlow(state: FinanceState, period: ReportingPeriod): number {
  return totalIncome(state, period) - totalExpenses(state, period)
}

/** Counts account-to-account transfers only — goal-funding transfers (see `Transaction.goalId`) are a different kind of movement and are surfaced on the Goals page instead. */
export function transferCount(state: FinanceState, period: ReportingPeriod): number {
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

// ---- Expense trend (SR-004 / TR-005) -----------------------------------
// The dashboard's expense chart, legend, and accessible table all read from
// `expensesTrend` below — there is no separate `expensesTrend` slice of
// `FinanceState` to drift out of sync with the transaction ledger. Every
// bucket is a live sum over `state.transactions`, so adding an expense dated
// `todayIso` changes both `expensesToday` and the relevant chart bucket on
// the next render. Transfers (including goal-funding transfers, which carry
// a `goalId`) are never expenses and are excluded by the
// `type === 'expense'` filter shared by every helper here.
//
// TR-005: each bucket now carries its own inclusive date range, and
// `expensesTrendTitle` derives the chart's title from the same definition
// the buckets are built from — so a title can never claim a window the data
// doesn't cover (the old map said Weekly = "this month" while the buckets
// were four rolling 7-day windows, and Monthly = "this year" over six
// calendar months).

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

/** Total expenses posted on `todayIso` — the "today" figure shown next to the daily chart. */
export function expensesToday(state: FinanceState, todayIso: string): number {
  const day = localDateFromIso(todayIso)
  if (!day) return 0
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  return expenseAmountInRange(state, day, next)
}

export type ExpensesTrendUnit = 'daily' | 'weekly' | 'monthly'

/** One bucket of the expense trend chart, carrying the exact window it sums. */
export interface ExpenseTrendPoint {
  /** Short axis label (`MON`, `W1`, `AUG`) — display only, never parsed. */
  day: string
  amount: number
  /** Inclusive first day of the bucket (`YYYY-MM-DD`). */
  startIso: string
  /** Inclusive last day of the bucket (`YYYY-MM-DD`). */
  endIso: string
  /** Human-readable range, e.g. `Aug 23 – Aug 29`, for tooltips and assistive technology. */
  rangeLabel: string
}

function rangeLabel(startIso: string, endIso: string): string {
  return startIso === endIso ? formatDateLabel(startIso) : `${formatDateLabel(startIso)} – ${formatDateLabel(endIso)}`
}

function point(state: FinanceState, label: string, start: Date, endExclusive: Date): ExpenseTrendPoint {
  const startIso = isoFromLocalDate(start)
  const endIso = isoFromLocalDate(new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1))
  return {
    day: label,
    amount: expenseAmountInRange(state, start, endExclusive),
    startIso,
    endIso,
    rangeLabel: rangeLabel(startIso, endIso),
  }
}

/**
 * The single aggregation function backing every view of the Dashboard
 * expense trend chart. All three units bucket the same expense transactions,
 * anchored at `todayIso`, so switching the period control can never desync
 * the chart, its legend, or the accessible list built from the same array:
 *   - `daily`: the 7 calendar days ending at (and including) today.
 *   - `weekly`: the 4 rolling 7-day windows ending today (oldest first),
 *     labeled W1..W4 — NOT calendar weeks and NOT the calendar month.
 *   - `monthly`: the 6 calendar months ending with the month containing
 *     today, labeled by month abbreviation — NOT the calendar year.
 */
export function expensesTrend(state: FinanceState, unit: ExpensesTrendUnit, todayIso: string): ExpenseTrendPoint[] {
  const anchor = localDateFromIso(todayIso)
  if (!anchor) return []
  const y = anchor.getFullYear()
  const mo = anchor.getMonth()
  const d = anchor.getDate()

  if (unit === 'daily') {
    const points: ExpenseTrendPoint[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(y, mo, d - i)
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      points.push(point(state, WEEKDAY_LABELS[day.getDay()], day, next))
    }
    return points
  }

  if (unit === 'weekly') {
    const points: ExpenseTrendPoint[] = []
    for (let w = 3; w >= 0; w--) {
      const end = new Date(y, mo, d - w * 7 + 1)
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7)
      points.push(point(state, `W${4 - w}`, start, end))
    }
    return points
  }

  const points: ExpenseTrendPoint[] = []
  for (let m = 5; m >= 0; m--) {
    const start = new Date(y, mo - m, 1)
    const end = new Date(y, mo - m + 1, 1)
    points.push(point(state, MONTH_LABELS[start.getMonth()], start, end))
  }
  return points
}

/**
 * The chart title for a unit — derived from the same bucket definition
 * above, so the words and the data can't drift apart (TR-005).
 */
export function expensesTrendTitle(unit: ExpensesTrendUnit): string {
  if (unit === 'daily') return 'Last 7 days'
  if (unit === 'weekly') return 'Last 4 weeks'
  return 'Last 6 months'
}

/** The full range the chart currently covers, e.g. `Aug 2 – Aug 29`, for the title's range caption. */
export function expensesTrendRangeLabel(points: ExpenseTrendPoint[]): string {
  if (points.length === 0) return ''
  return rangeLabel(points[0].startIso, points[points.length - 1].endIso)
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

export function budgetDaysRemaining(todayIso: string, period: ReportingPeriod = activeReportingPeriod(todayIso)): number {
  const now = localDateFromIso(todayIso)
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

/** Total of every ACTIVE goal's *planned* monthly contribution. Planned, not automated: nothing moves this money until the user funds the goal (TR-004). */
export function plannedMonthlyContributionTotal(state: FinanceState): number {
  return activeGoals(state).reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
}

/** Average progress across ACTIVE goals only — a completed goal at 100% would otherwise inflate this. */
export function avgGoalProgressPct(state: FinanceState): number {
  const active = activeGoals(state)
  if (active.length === 0) return 0
  return Math.round((active.reduce((s, g) => s + g.currentAmount / g.targetAmount, 0) / active.length) * 100)
}

/** Progress percentage clamped to [0, 100] for rendering a fill bar. */
export function goalProgressPct(goal: Goal): number {
  return Math.max(0, Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)))
}

/** True (uncapped) progress percentage. With overfunding unsupported (TR-004) this never exceeds 100 for valid state. */
export function goalRawProgressPct(goal: Goal): number {
  return Math.round((goal.currentAmount / goal.targetAmount) * 100)
}

// ---- Money position / "Estimated safe to spend" (SR-008 / TR-003) -------

/**
 * The documented commitment horizon for Money Position: a credit card's
 * minimum payment counts as an upcoming commitment only when its due date
 * falls within the next 30 days, inclusive of today (TR-003). "Due soon" is
 * therefore a real date filter, not a figure of speech — a card due in four
 * months is not a claim on this month's cash, and a card with no valid
 * stored due date contributes nothing.
 */
export const COMMITMENT_HORIZON_DAYS = 30

/** The credit cards whose minimum payment falls inside the commitment horizon. */
export function cardsDueWithinHorizon(state: FinanceState, todayIso: string): CreditCard[] {
  const horizonEnd = addDaysToIso(todayIso, COMMITMENT_HORIZON_DAYS)
  return state.creditCards.filter((c) => isIsoDateWithinInclusive(c.dueDate, todayIso, horizonEnd))
}

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
 * `plannedGoalContributions` is a different number: a goal's *planned* pace
 * for the month (`Goal.monthlyContribution`), which is not moved out of any
 * account until the user actually calls `addGoalFunds` — there is no
 * automation behind it (TR-004). That money is still sitting in
 * `totalAvailableCash`, so subtracting it here is not a double-count — it is
 * treating an intended, not-yet-executed transfer the same way an upcoming
 * credit card minimum (also unpaid) is treated: a known near-term claim on
 * today's cash.
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
  /** How many cards contributed a minimum payment inside the horizon. */
  cardsDueCount: number
}

export function safeToSpendBreakdown(state: FinanceState, todayIso: string): SafeToSpendBreakdown {
  const availableCash = totalAvailableCash(state)
  const dueCards = cardsDueWithinHorizon(state, todayIso)
  const upcomingCreditMinimums = dueCards.reduce((sum, c) => sum + c.minPayment, 0)
  const plannedGoalContributions = plannedMonthlyContributionTotal(state)
  const safeToSpend = Math.max(0, availableCash - upcomingCreditMinimums - plannedGoalContributions)
  return { availableCash, upcomingCreditMinimums, plannedGoalContributions, safeToSpend, cardsDueCount: dueCards.length }
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

/**
 * A credit-card payment is an asset → card transfer (TR-003). It keeps full
 * transfer semantics — excluded from income, expenses, and net cash flow —
 * so the ledger row explains what it did to both balances rather than
 * looking like an unexplained outflow.
 */
export function cardPaymentReconciliationLabel(state: FinanceState, t: Transaction): string | undefined {
  if (t.type !== 'transfer' || t.goalId || !isCreditCardId(state, t.toAccountId)) return undefined
  return `Credit card payment · ${formatMoney(t.amount)} from ${accountLabel(state, t.fromAccountId)} reduced ${accountLabel(state, t.toAccountId)} owed by the same amount (not an expense)`
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
