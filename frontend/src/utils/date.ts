import type { ReportingPeriod } from '../domain/finance'

// TR-008: calendar values are STRICT at the storage boundary and only ever
// made human-readable at the rendering boundary.
//
// Storage formats (identical for seed data and newly-created records):
//   - dates: `YYYY-MM-DD`, syntactically exact and round-trip validated, so
//     an impossible date is rejected instead of silently rolling over
//     (`2026-02-31` is NOT accepted as March 3rd; `2026-13-01` is NOT
//     accepted as January 2027).
//   - times: 24-hour `HH:mm` with hours `00`–`23` and minutes `00`–`59`, so
//     `24:00` and `12:60` are rejected rather than reformatted.
//
// Nothing here reads a clock. "What day is it" comes from `AppClock`
// (`utils/clock.ts`) and is passed in — see TR-001.

const ISO_DATE_RE = /^\d{4}-(\d{2})-(\d{2})$/
const TIME_24_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Strict `YYYY-MM-DD` validation: exact syntax *and* a round-trip check that
 * the parsed calendar date is the same one the string named. This is what
 * rejects `2026-02-31` (JavaScript would otherwise normalize it to March 3)
 * and `2026-13-01` (which would become January 2027).
 */
export function isValidIsoDate(value: string): boolean {
  return localDateFromIso(value) !== undefined
}

/**
 * Parses a strict ISO (`YYYY-MM-DD`) date into a local-midnight `Date`.
 * Never use `new Date(iso)` directly for these — that parses as UTC and can
 * shift the calendar day depending on the viewer's timezone. Returns
 * `undefined` for anything that is not an exact, real calendar date.
 */
export function localDateFromIso(value: string): Date | undefined {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return undefined
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const d = Number(value.slice(8, 10))
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const date = new Date(y, m - 1, d)
  // Round-trip: JavaScript happily rolls impossible dates forward, so the
  // only reliable check is that the constructed date reports back exactly
  // the year/month/day that was asked for. This also handles leap years
  // (2027-02-29 fails, 2028-02-29 passes) without a separate table.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined
  return date
}

/** Formats a local `Date` back to `YYYY-MM-DD` — the inverse of `localDateFromIso`. */
export function isoFromLocalDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Strict 24-hour `HH:mm` validation — the one storage format for a transaction time. */
export function isValidTime24(value: string): boolean {
  return typeof value === 'string' && TIME_24_RE.test(value)
}

// ---- Rendering boundary ------------------------------------------------
// Everything below turns a validated stored value into display text. None of
// it is ever used to produce or normalize stored data.

/** `2026-08-29` → `Aug 29`. Returns the raw value if it isn't a valid stored date. */
export function formatDateLabel(iso: string): string {
  const date = localDateFromIso(iso)
  if (!date) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * `09:14` → `9:14 AM`. Storage is strict 24-hour `HH:mm` (seed data included
 * — TR-008 normalized the old mixed 12-hour seed strings), so anything else
 * is not a time this app stored and renders as nothing rather than being
 * guessed at (`99:99` used to render as `3:99 PM`).
 */
export function formatTimeLabel(time: string | undefined): string | undefined {
  if (!time || !isValidTime24(time)) return undefined
  const [h, m] = time.split(':')
  const hour24 = Number(h)
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${m} ${period}`
}

/** A goal's target/completed date (`2027-03-01`) → `Mar 2027`. */
export function formatGoalDate(value: string): string {
  const date = localDateFromIso(value)
  if (!date) return value
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** A credit card's stored due date (`2026-09-15`) → `Sep 15`. */
export function formatDueDateLabel(value: string): string {
  return formatDateLabel(value)
}

/** A reporting period rendered as the calendar month it spans, e.g. `August 2026`. */
export function formatPeriodLabel(period: ReportingPeriod): string {
  const start = localDateFromIso(period.start)
  if (!start) return ''
  return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ---- Comparison / period helpers ---------------------------------------

/** Whether an ISO date falls strictly before another ISO date, compared as local dates. */
export function isIsoDateBefore(iso: string, beforeIso: string): boolean {
  const date = localDateFromIso(iso)
  const before = localDateFromIso(beforeIso)
  if (!date || !before) return false
  return date.getTime() < before.getTime()
}

/** `iso` shifted by `days` (may be negative), returned as a stored ISO date. Throws on an invalid input date. */
export function addDaysToIso(iso: string, days: number): string {
  const date = localDateFromIso(iso)
  if (!date) throw new Error(`addDaysToIso received an invalid date: "${iso}".`)
  return isoFromLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/**
 * The calendar-month `ReportingPeriod` (local time) containing `iso`.
 *
 * TR-008: an invalid anchor is an explicit failure. This used to fall back
 * to `new Date()`, which silently swapped the app's reporting window for the
 * machine's real clock — exactly the second, invisible clock TR-001 exists
 * to eliminate.
 */
export function monthPeriodContaining(iso: string): ReportingPeriod {
  const date = localDateFromIso(iso)
  if (!date) {
    throw new Error(`monthPeriodContaining requires a valid YYYY-MM-DD anchor, received "${iso}".`)
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: isoFromLocalDate(start), end: isoFromLocalDate(end) }
}

/**
 * Whether an ISO date falls within a `ReportingPeriod` — `start` inclusive,
 * `end` exclusive — compared as local `Date` values, never as raw strings.
 * The single source of truth components and selectors use instead of
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

/** Whether `iso` falls in the inclusive window `[startIso, endIso]`. Used for the Money Position commitment horizon. */
export function isIsoDateWithinInclusive(iso: string, startIso: string, endIso: string): boolean {
  const date = localDateFromIso(iso)
  const start = localDateFromIso(startIso)
  const end = localDateFromIso(endIso)
  if (!date || !start || !end) return false
  const t = date.getTime()
  return t >= start.getTime() && t <= end.getTime()
}
