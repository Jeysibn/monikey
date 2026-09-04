// Pure, independently-testable derived calculations backing the Reports
// page. Same rules as `financeSelectors.ts`: nothing here mutates state,
// reads component props, or calls `new Date()` — every time-dependent
// function takes an explicit `todayIso`, and this module never imports
// React. It is additive to (never edits) `financeSelectors.ts`.
//
// Honesty rule (mirrors the "Money Position" / "Estimated" labeling
// elsewhere in the app): Monikey's mock dataset is a single point-in-time
// snapshot. It has no real month-over-month history for account balances,
// net worth, or credit card debt. Wherever a *trend* over time is shown for
// those figures, the historical points are clearly-labeled ILLUSTRATIVE
// sample data — deterministic curves anchored so the most recent point
// always equals the real "now" figure computed from `FinanceState`. Never
// call these trend functions without labeling their output as illustrative
// in the UI. Real point-in-time figures (current balances, budget spend,
// spend mix, goal progress, portfolio prices/history) are read straight from
// `FinanceState` via `financeSelectors.ts` and are NOT touched here.

import type { FinanceState, ReportingPeriod } from '../domain/finance'
import { isoFromLocalDate, localDateFromIso } from '../utils/date'
import { netCashFlow, totalAvailableCash, totalCreditOwed, totalIncome } from './financeSelectors'

// ---- Report view / period ------------------------------------------------

export type ReportView = 'monthly' | 'quarterly' | 'yearly'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The reporting window for a given view, anchored at `todayIso`:
 *   - `monthly`: the calendar month containing today.
 *   - `quarterly`: the calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) containing today.
 *   - `yearly`: the calendar year containing today.
 * `start` is inclusive, `end` is exclusive — same convention as `ReportingPeriod` everywhere else.
 */
export function reportingPeriodForView(todayIso: string, view: ReportView): ReportingPeriod {
  const date = localDateFromIso(todayIso)
  if (!date) {
    throw new Error(`reportingPeriodForView requires a valid YYYY-MM-DD anchor, received "${todayIso}".`)
  }
  const y = date.getFullYear()
  const m = date.getMonth()

  if (view === 'monthly') {
    return { start: isoFromLocalDate(new Date(y, m, 1)), end: isoFromLocalDate(new Date(y, m + 1, 1)) }
  }
  if (view === 'quarterly') {
    const quarterStartMonth = Math.floor(m / 3) * 3
    return {
      start: isoFromLocalDate(new Date(y, quarterStartMonth, 1)),
      end: isoFromLocalDate(new Date(y, quarterStartMonth + 3, 1)),
    }
  }
  return { start: isoFromLocalDate(new Date(y, 0, 1)), end: isoFromLocalDate(new Date(y + 1, 0, 1)) }
}

/** Human-readable label for the active view's window, e.g. `August 2026`, `Q3 2026 (Jul–Sep)`, `2026`. */
export function reportPeriodLabel(todayIso: string, view: ReportView): string {
  const date = localDateFromIso(todayIso)
  if (!date) return ''
  const y = date.getFullYear()
  const m = date.getMonth()

  if (view === 'monthly') return `${MONTH_NAMES[m]} ${y}`
  if (view === 'quarterly') {
    const quarterStartMonth = Math.floor(m / 3) * 3
    const quarterNumber = Math.floor(m / 3) + 1
    return `Q${quarterNumber} ${y} (${MONTH_ABBR[quarterStartMonth]}–${MONTH_ABBR[quarterStartMonth + 2]})`
  }
  return `${y}`
}

// ---- Savings rate ---------------------------------------------------------

/**
 * `netCashFlow / totalIncome` for the period, as a percentage rounded to one
 * decimal place. Guards divide-by-zero: a period with no recorded income
 * (rather than a fabricated positive/negative rate) reports `0`.
 */
export function savingsRate(state: FinanceState, period: ReportingPeriod): number {
  const income = totalIncome(state, period)
  if (income <= 0) return 0
  return Math.round((netCashFlow(state, period) / income) * 1000) / 10
}

// ---- Net worth (real, "as of now") ----------------------------------------

export interface NetWorthSnapshot {
  assets: number
  liabilities: number
  netWorth: number
}

/** Assets (asset accounts) minus liabilities (credit card balances), as of `todayIso` — a real, current figure. */
export function netWorthNow(state: FinanceState): NetWorthSnapshot {
  const assets = totalAvailableCash(state)
  const liabilities = totalCreditOwed(state)
  return { assets, liabilities, netWorth: assets - liabilities }
}

// ---- Illustrative trend samples --------------------------------------------
// See the module header: these are sample curves, not measured history. Each
// one is a deterministic function of the real "now" total (so re-rendering
// never changes the numbers) and its last point always equals that real
// total, so a chart built from it never contradicts the real KPI shown next
// to it.

export interface IllustrativeTrendPoint {
  label: string
  value: number
}

/** A gently-rising 6-month curve, e.g. for a balance or net worth that has been trending up toward today's real figure. */
const RISING_TREND_FACTORS = [0.82, 0.86, 0.9, 0.94, 0.97, 1]
/** A gently-falling 6-month curve, e.g. for debt that has been paid down toward today's real balance. */
const SETTLING_DEBT_FACTORS = [1.18, 1.13, 1.09, 1.05, 1.02, 1]

function trailingMonthLabels(todayIso: string): string[] {
  const anchor = localDateFromIso(todayIso)
  if (!anchor) {
    throw new Error(`trailingMonthLabels requires a valid YYYY-MM-DD anchor, received "${todayIso}".`)
  }
  const labels: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)
    labels.push(MONTH_ABBR[d.getMonth()])
  }
  return labels
}

function scaledTrend(finalValue: number, factors: number[], labels: string[]): IllustrativeTrendPoint[] {
  return factors.map((factor, i) => ({ label: labels[i] ?? '', value: Math.round(finalValue * factor) }))
}

/**
 * ILLUSTRATIVE sample trend for total available cash across accounts. The
 * mock dataset has no historical account-balance ledger, so every point but
 * the last is a sample curve anchored to `totalAvailableCash(state)`.
 */
export function accountBalanceTrendSample(state: FinanceState, todayIso: string): IllustrativeTrendPoint[] {
  return scaledTrend(totalAvailableCash(state), RISING_TREND_FACTORS, trailingMonthLabels(todayIso))
}

/** ILLUSTRATIVE sample trend for net worth (assets − liabilities), anchored to `netWorthNow(state).netWorth`. */
export function netWorthTrendSample(state: FinanceState, todayIso: string): IllustrativeTrendPoint[] {
  return scaledTrend(netWorthNow(state).netWorth, RISING_TREND_FACTORS, trailingMonthLabels(todayIso))
}

/** ILLUSTRATIVE sample trend for total credit card debt, anchored to `totalCreditOwed(state)`. */
export function debtTrendSample(state: FinanceState, todayIso: string): IllustrativeTrendPoint[] {
  return scaledTrend(totalCreditOwed(state), SETTLING_DEBT_FACTORS, trailingMonthLabels(todayIso))
}

// ---- Investment performance (real) -----------------------------------------

export interface PortfolioSummary {
  totalValue: number
  /** Value-weighted average of each holding's real `changePct`. */
  weightedChangePct: number
  holdingsCount: number
}

/** Aggregates `state.portfolio` — every input (`price`, `units`, `changePct`) is real seed data, not an invented trend. */
export function portfolioSummary(state: FinanceState): PortfolioSummary {
  const holdings = state.portfolio
  const totalValue = holdings.reduce((sum, h) => sum + h.price * h.units, 0)
  const weightedChangePct =
    totalValue > 0
      ? Math.round((holdings.reduce((sum, h) => sum + h.price * h.units * h.changePct, 0) / totalValue) * 10) / 10
      : 0
  return { totalValue, weightedChangePct, holdingsCount: holdings.length }
}
