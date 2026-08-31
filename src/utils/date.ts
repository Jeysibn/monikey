import type { ReportingPeriod } from '../domain/finance'

/**
 * The demo "today" the seed data is built around (see `budgetDaysRemaining`
 * and `activeReportingPeriod` in `financeSelectors.ts`, and the transaction
 * dates in `mockFinanceRepository.ts`, which cluster around late August
 * 2026). The active reporting period — "this month" in every KPI label — is
 * the calendar month containing this date. Lives here (a pure domain util)
 * rather than in the mock repository so selectors don't depend on a mock
 * implementation to know what day it is.
 */
export const DEMO_TODAY_ISO = '2026-08-29'

// Transactions store a real ISO (`YYYY-MM-DD`) date so they sort and compare
// correctly; this is the one place that formats it for display, so seed
// data and newly-added transactions always render identically.
export function formatDateLabel(iso: string): string {
  const date = localDateFromIso(iso)
  if (!date) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Parses an ISO (`YYYY-MM-DD`) date into a local-midnight `Date`. Never use
 * `new Date(iso)` directly for these — that parses as UTC and can shift the
 * calendar day depending on the viewer's timezone. Returns `undefined` for
 * an invalid/empty string rather than an "Invalid Date".
 */
export function localDateFromIso(iso: string): Date | undefined {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

/** Formats a local `Date` back to `YYYY-MM-DD` — the inverse of `localDateFromIso`. */
export function isoFromLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Formats a transaction time for display. Seed data stores 12-hour strings
 * (`'9:14 AM'`), while the `<input type="time">` on the Add Transaction
 * form yields 24-hour `HH:mm`. Rather than rewriting either source, this is
 * the one place that normalizes both into the same `h:mm AM/PM` label, so
 * seeded and newly-added transactions always render identically (SR-007).
 */
export function formatTimeLabel(time: string | undefined): string | undefined {
  if (!time) return undefined
  const trimmed = time.trim()
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampm) {
    const hour = String(Number(ampm[1]))
    return `${hour}:${ampm[2]} ${ampm[3].toUpperCase()}`
  }
  const hm = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (hm) {
    let hour = Number(hm[1])
    const period = hour >= 12 ? 'PM' : 'AM'
    hour = hour % 12 || 12
    return `${hour}:${hm[2]} ${period}`
  }
  return trimmed
}

/**
 * Formats a goal target/completed date for display. New goals store a real
 * ISO date (from the `<input type="date">`); seed goals store a
 * hand-written `'Mon YYYY'` string. Both render as `'Mon YYYY'` — an ISO
 * date is reduced to month + year, and a non-ISO string (already in that
 * shape) passes through unchanged — so seeded and newly-created goals are
 * indistinguishable in the UI (SR-007).
 */
export function formatGoalDate(value: string): string {
  const date = localDateFromIso(value)
  if (!date) return value
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Whether an ISO (`YYYY-MM-DD`) date falls strictly before another ISO date, compared as local dates. */
export function isIsoDateBefore(iso: string, beforeIso: string): boolean {
  const date = localDateFromIso(iso)
  const before = localDateFromIso(beforeIso)
  if (!date || !before) return false
  return date.getTime() < before.getTime()
}

/** The calendar-month `ReportingPeriod` (local time) that contains the given ISO date. */
export function monthPeriodContaining(iso: string): ReportingPeriod {
  const date = localDateFromIso(iso) ?? new Date()
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: isoFromLocalDate(start), end: isoFromLocalDate(end) }
}

/**
 * Whether an ISO date falls within a `ReportingPeriod` — `start` inclusive,
 * `end` exclusive — compared as local `Date` values, never as raw strings.
 * The single source of truth components and selectors should use instead of
 * inlining their own date-range logic.
 */
export function isDateInPeriod(iso: string, period: ReportingPeriod): boolean {
  const date = localDateFromIso(iso)
  const start = localDateFromIso(period.start)
  const end = localDateFromIso(period.end)
  if (!date || !start || !end) return false
  const t = date.getTime()
  return t >= start.getTime() && t < end.getTime()
}
