import type { Category, FinanceState } from '../domain/finance'
import type { RecurringDueState, RecurringItem } from '../domain/recurring'
import { addDaysToIso, isIsoDateBefore } from '../utils/date'
import { exactMinor } from '../utils/money'

/* Pure Planning logic. Money is BigInt minor units throughout; the server already decided what counts as spending. */

export const NEAR_LIMIT_PCT = 80
/** How many months back and forward the month picker may go. */
export const MONTHS_BACK = 12
export const MONTHS_AHEAD = 1

export type MonthKey = string // YYYY-MM

export const monthKeyOf = (iso: string): MonthKey => iso.slice(0, 7)

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const total = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Calendar bounds of a month, end INCLUSIVE (the Stage 2b budget-date contract). */
export function monthBounds(key: MonthKey): { start: string; end: string } {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, '0')}` }
}

export function monthLabel(key: MonthKey): string {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Supported window relative to the current month. */
export function monthInRange(key: MonthKey, todayKey: MonthKey): boolean {
  return key >= shiftMonth(todayKey, -MONTHS_BACK) && key <= shiftMonth(todayKey, MONTHS_AHEAD)
}

export interface PeriodAllocation { categoryId: string; allocatedMinor: bigint; spentMinor: bigint }
export interface BudgetPeriodView { id: string; periodStart: string; periodEnd: string; allocations: PeriodAllocation[] }

/**
 * The period that budgets this month. An exact calendar-month period wins; otherwise a period that fully covers the month
 * (the same rule as the budget-performance report, so Planning and Overview agree).
 */
export function periodForMonth(periods: BudgetPeriodView[], key: MonthKey): BudgetPeriodView | null {
  const { start, end } = monthBounds(key)
  const exact = periods.find((p) => p.periodStart === start && p.periodEnd === end)
  if (exact) return exact
  return periods.find((p) => p.periodStart <= start && p.periodEnd >= end) ?? null
}

export type RowStatus = 'ok' | 'near' | 'over'

export interface PlanRow {
  categoryId: string
  name: string
  color: string
  allocated: bigint
  spent: bigint
  remaining: bigint
  /** Rounded whole percent of the allocation used (may exceed 100). 0 when nothing is allocated. */
  usedPct: number
  status: RowStatus
}

export interface UnbudgetedRow { categoryId: string; name: string; color: string; spent: bigint }

export interface Plan {
  rows: PlanRow[]
  unbudgeted: UnbudgetedRow[]
  allocated: bigint
  /** Spending inside categories that have an allocation. */
  budgetedSpent: bigint
  remaining: bigint
  usedPct: number
  status: RowStatus
  /** Every cleared expense this month (all categories, uncategorized included) when known. */
  totalSpending: bigint | null
  /** Spending that no allocation covers: total spending minus budgeted-category spending. */
  outsideBudget: bigint | null
  hasBudget: boolean
}

export const pctOf = (part: bigint, whole: bigint): number => (whole > 0n ? Number((part * 100n + whole / 2n) / whole) : 0)
export const statusOf = (spent: bigint, allocated: bigint): RowStatus => (allocated <= 0n ? 'ok' : spent > allocated ? 'over' : pctOf(spent, allocated) >= NEAR_LIMIT_PCT ? 'near' : 'ok')

const RANK: Record<RowStatus, number> = { over: 0, near: 1, ok: 2 }

export const isBudgetableCategory = (c: Category) => c.budgetable && c.transactionKinds.includes('expense')

export function buildPlan(input: {
  categories: Category[]
  allocations: PeriodAllocation[]
  /** Cleared spending per category for the month, from the report endpoint (or local state in demo mode). */
  spendByCategory: Map<string, bigint>
  totalSpending: bigint | null
}): Plan {
  const byId = new Map(input.categories.map((c) => [c.id, c]))
  const rows: PlanRow[] = input.allocations
    .filter((a) => a.allocatedMinor > 0n)
    .map((a) => {
      const cat = byId.get(a.categoryId)
      return { categoryId: a.categoryId, name: cat?.name ?? 'Unknown category', color: cat?.color ?? 'var(--v3-muted)', allocated: a.allocatedMinor, spent: a.spentMinor, remaining: a.allocatedMinor - a.spentMinor, usedPct: pctOf(a.spentMinor, a.allocatedMinor), status: statusOf(a.spentMinor, a.allocatedMinor) }
    })
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.usedPct - a.usedPct || a.name.localeCompare(b.name))
  const budgeted = new Set(rows.map((r) => r.categoryId))
  const unbudgeted: UnbudgetedRow[] = input.categories
    .filter((c) => isBudgetableCategory(c) && !budgeted.has(c.id))
    .map((c) => ({ categoryId: c.id, name: c.name, color: c.color, spent: input.spendByCategory.get(c.id) ?? 0n }))
    .sort((a, b) => (a.spent === b.spent ? a.name.localeCompare(b.name) : a.spent > b.spent ? -1 : 1))
  const allocated = rows.reduce((s, r) => s + r.allocated, 0n)
  const budgetedSpent = rows.reduce((s, r) => s + r.spent, 0n)
  const outside = input.totalSpending === null ? null : input.totalSpending - budgetedSpent
  return {
    rows, unbudgeted, allocated, budgetedSpent, remaining: allocated - budgetedSpent, usedPct: pctOf(budgetedSpent, allocated), status: statusOf(budgetedSpent, allocated),
    totalSpending: input.totalSpending, outsideBudget: outside === null ? null : outside < 0n ? 0n : outside, hasBudget: rows.length > 0,
  }
}

/** Demo-mode allocations come from the in-memory state. */
export function allocationsFromState(state: FinanceState): PeriodAllocation[] {
  return state.budgetCategories.map((b) => ({ categoryId: b.id, allocatedMinor: exactMinor(b.allocatedMinor, b.allocated), spentMinor: exactMinor(b.spentMinor, b.spent) }))
}

export type BillState = RecurringDueState | 'due_today'

/** Display state of a recurring bill. Purely informational: nothing here posts or advances anything. */
export function billState(item: RecurringItem, todayIso: string): BillState {
  if (item.status === 'paused') return 'paused'
  if (item.nextDueDate === todayIso) return 'due_today'
  if (isIsoDateBefore(item.nextDueDate, todayIso)) return 'overdue'
  return item.nextDueDate <= addDaysToIso(todayIso, 7) ? 'due_soon' : 'scheduled'
}

export const BILL_STATE_LABEL: Record<BillState, string> = { overdue: 'Overdue', due_today: 'Due today', due_soon: 'Due soon', scheduled: 'Upcoming', paused: 'Paused' }
const BILL_ORDER: Record<BillState, number> = { overdue: 0, due_today: 1, due_soon: 2, scheduled: 3, paused: 4 }

export function sortBills(items: RecurringItem[], todayIso: string): RecurringItem[] {
  return [...items].sort((a, b) => BILL_ORDER[billState(a, todayIso)] - BILL_ORDER[billState(b, todayIso)] || a.nextDueDate.localeCompare(b.nextDueDate) || a.merchant.localeCompare(b.merchant))
}
