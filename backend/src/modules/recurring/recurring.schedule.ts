import type { RecurringFrequency } from '@prisma/client'

const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

/**
 * Next due date after `due`. Monthly and yearly bills are clamped to the last day of a short month
 * and return to their anchor day afterwards (Jan 31 -> Feb 28 -> Mar 31; Feb 29 -> Feb 28 -> Feb 29
 * on the next leap year), unlike `setUTCMonth`, which overflows into the following month.
 * `anchorDay` is the bill's intended day of month; legacy rows without one use the due date's own day.
 */
export function advanceDueDate(due: Date, frequency: RecurringFrequency, anchorDay?: number | null): Date {
  const year = due.getUTCFullYear()
  const month = due.getUTCMonth()
  const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : due.getUTCDate()
  if (frequency === 'weekly') return new Date(Date.UTC(year, month, due.getUTCDate() + 7))
  const [targetYear, targetMonth] = frequency === 'monthly' ? (month === 11 ? [year + 1, 0] : [year, month + 1]) : [year + 1, month]
  return new Date(Date.UTC(targetYear!, targetMonth!, Math.min(day, daysInMonth(targetYear!, targetMonth!))))
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10)
export const addDaysIso = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return isoDate(d) }
