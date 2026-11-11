import { monthOf } from './finance.ts'

/*
 * The Dashboard's two independent date scopes (ADR-025), as pure functions so they can be tested.
 *  - Reporting Month: one calendar month. Its request is a month-aligned run of months that ENDS at that month
 *    (the monthly income-versus-expenses chart); the current month stops at today and is "month to date".
 *  - Analysis range: a preset or a custom inclusive range; it never reads or changes the reporting month.
 * All dates are Asia/Manila calendar dates written "YYYY-MM-DD" and moved with UTC arithmetic, so a time zone
 * or daylight-saving change can never shift a day. Today comes from the data source, never the browser clock.
 */
export const MAX_RANGE_DAYS = 366
export const REPORT_MONTHS = 6 // how many months the monthly chart shows, ending at the reporting month

export type AnalysisPreset = 'this-month' | 'last-month' | '7-days' | '30-days' | '3-months' | 'this-year' | 'custom'
export const ANALYSIS_PRESETS: { value: AnalysisPreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: '7-days', label: 'Last 7 days' },
  { value: '30-days', label: 'Last 30 days' },
  { value: '3-months', label: 'Last 3 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

const DAY = 86_400_000
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (date: string, days: number): string => iso(parse(date) + days * DAY)
export const daysBetween = (start: string, end: string): number => Math.round((parse(end) - parse(start)) / DAY) + 1 // inclusive

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year!, number! - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
export const firstDayOf = (month: string): string => `${month}-01`
export const lastDayOf = (month: string): string => addDays(firstDayOf(shiftMonth(month, 1)), -1)

/** A real calendar date, in the form a date input produces. */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  return y >= 1900 && check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d
}

export interface DateRange { startDate: string; endDate: string }

/** What is wrong with a range, in words for the screen, or null when it can be requested. Checked BEFORE any request. */
export function rangeProblem(range: DateRange, today: string): string | null {
  if (!isCalendarDate(range.startDate) || !isCalendarDate(range.endDate)) return 'Enter a valid start and end date.'
  if (range.endDate < range.startDate) return 'Choose a start date on or before the end date.'
  if (range.endDate > today) return 'The end date can’t be in the future.'
  if (daysBetween(range.startDate, range.endDate) > MAX_RANGE_DAYS) return `Choose a range of ${MAX_RANGE_DAYS} days or fewer.`
  return null
}

export function presetRange(preset: Exclude<AnalysisPreset, 'custom'>, today: string): DateRange {
  const month = monthOf(today)
  switch (preset) {
    case 'this-month': return { startDate: firstDayOf(month), endDate: today }
    case 'last-month': return { startDate: firstDayOf(shiftMonth(month, -1)), endDate: lastDayOf(shiftMonth(month, -1)) }
    case '7-days': return { startDate: addDays(today, -6), endDate: today }
    case '30-days': return { startDate: addDays(today, -29), endDate: today }
    case '3-months': return { startDate: firstDayOf(shiftMonth(month, -2)), endDate: today } // this month and the two before; this month only through today
    case 'this-year': return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today }
  }
}

export function analysisRange(preset: AnalysisPreset, custom: DateRange, today: string): DateRange {
  return preset === 'custom' ? custom : presetRange(preset, today)
}

/** Whether the reporting month is the current one (so it is month to date). Months after it do not exist for reporting. */
export const isCurrentMonth = (month: string, today: string): boolean => month === monthOf(today)

/** The request for the Reporting Month: REPORT_MONTHS whole months ending at it, stopping at today for the current month. */
export function reportingRange(month: string, today: string): DateRange {
  return { startDate: firstDayOf(shiftMonth(month, 1 - REPORT_MONTHS)), endDate: isCurrentMonth(month, today) ? today : lastDayOf(month) }
}

/** Months a person may report on: the current month and earlier. Used to stop the "next month" step at today. */
export const canStepToNextMonth = (month: string, today: string): boolean => month < monthOf(today)

export function describeRange(range: DateRange): string {
  return `${range.startDate} to ${range.endDate}`
}

export type CategorySort = 'high' | 'low' | 'az'
export function sortRows<T extends { name: string; amount: number }>(rows: T[], sort: CategorySort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return [...rows].sort(sort === 'az' ? byName : sort === 'low' ? (a, b) => a.amount - b.amount || byName(a, b) : (a, b) => b.amount - a.amount || byName(a, b))
}
