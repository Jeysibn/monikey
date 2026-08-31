import { describe, expect, it } from 'vitest'
import {
  addDaysToIso,
  formatDateLabel,
  formatGoalDate,
  formatPeriodLabel,
  formatTimeLabel,
  isDateInPeriod,
  isIsoDateWithinInclusive,
  isValidIsoDate,
  isValidTime24,
  isoFromLocalDate,
  localDateFromIso,
  monthPeriodContaining,
} from './date'

describe('localDateFromIso / isoFromLocalDate', () => {
  it('round-trips an ISO date without a timezone shift', () => {
    const date = localDateFromIso('2026-08-29')
    expect(date).toBeDefined()
    expect(date!.getFullYear()).toBe(2026)
    expect(date!.getMonth()).toBe(7) // August, 0-indexed
    expect(date!.getDate()).toBe(29)
    expect(isoFromLocalDate(date!)).toBe('2026-08-29')
  })

  it('returns undefined for empty or non-date input', () => {
    expect(localDateFromIso('')).toBeUndefined()
    expect(localDateFromIso('not-a-date')).toBeUndefined()
  })
})

// TR-008: impossible dates must be REJECTED, not silently rolled over.
describe('strict calendar-date validation (TR-008)', () => {
  it('rejects a day that does not exist in the given month instead of rolling it forward', () => {
    // JavaScript would turn 2026-02-31 into March 3rd.
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(localDateFromIso('2026-02-31')).toBeUndefined()
    expect(isValidIsoDate('2026-04-31')).toBe(false)
    expect(isValidIsoDate('2026-06-31')).toBe(false)
  })

  it('rejects month 13 instead of rolling it into the next year', () => {
    // JavaScript would turn 2026-13-01 into January 2027.
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(localDateFromIso('2026-13-01')).toBeUndefined()
  })

  it('rejects month 0 and day 0', () => {
    expect(isValidIsoDate('2026-00-10')).toBe(false)
    expect(isValidIsoDate('2026-08-00')).toBe(false)
  })

  it('handles leap years exactly', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true) // leap year
    expect(isValidIsoDate('2027-02-29')).toBe(false) // not a leap year
    expect(isValidIsoDate('2100-02-29')).toBe(false) // century, not a leap year
    expect(isValidIsoDate('2000-02-29')).toBe(true) // divisible by 400
  })

  it('rejects loose syntax that is not exactly YYYY-MM-DD', () => {
    expect(isValidIsoDate('2026-8-29')).toBe(false)
    expect(isValidIsoDate('2026/08/29')).toBe(false)
    expect(isValidIsoDate('2026-08-29T10:00:00Z')).toBe(false)
    expect(isValidIsoDate(' 2026-08-29 ')).toBe(false)
    expect(isValidIsoDate('Mar 2027')).toBe(false)
  })

  it('accepts real dates at month and year boundaries', () => {
    expect(isValidIsoDate('2026-01-01')).toBe(true)
    expect(isValidIsoDate('2026-12-31')).toBe(true)
    expect(isValidIsoDate('2026-08-31')).toBe(true)
  })
})

describe('strict time validation (TR-008)', () => {
  it('accepts 24-hour HH:mm within range', () => {
    expect(isValidTime24('00:00')).toBe(true)
    expect(isValidTime24('09:14')).toBe(true)
    expect(isValidTime24('23:59')).toBe(true)
  })

  it('rejects 24:00, minute 60, and out-of-range values instead of reformatting them', () => {
    expect(isValidTime24('24:00')).toBe(false)
    expect(isValidTime24('12:60')).toBe(false)
    expect(isValidTime24('99:99')).toBe(false)
    expect(isValidTime24('7:5')).toBe(false)
    expect(isValidTime24('9:14 AM')).toBe(false) // 12-hour display text is not a storage format
  })

  it('formatTimeLabel renders a stored time and refuses to guess at an invalid one', () => {
    expect(formatTimeLabel('09:14')).toBe('9:14 AM')
    expect(formatTimeLabel('19:48')).toBe('7:48 PM')
    expect(formatTimeLabel('00:05')).toBe('12:05 AM')
    expect(formatTimeLabel('12:00')).toBe('12:00 PM')
    // Previously this returned "3:99 PM".
    expect(formatTimeLabel('99:99')).toBeUndefined()
    expect(formatTimeLabel(undefined)).toBeUndefined()
  })
})

describe('rendering-boundary formatters', () => {
  it('formats a stored date, goal date, and period label', () => {
    expect(formatDateLabel('2026-08-29')).toBe('Aug 29')
    expect(formatGoalDate('2027-03-01')).toBe('Mar 2027')
    expect(formatPeriodLabel({ start: '2026-08-01', end: '2026-09-01' })).toBe('August 2026')
  })
})

describe('monthPeriodContaining', () => {
  it('produces an inclusive start and exclusive end spanning the whole calendar month', () => {
    expect(monthPeriodContaining('2026-08-29')).toEqual({ start: '2026-08-01', end: '2026-09-01' })
  })

  it('rolls over correctly for December', () => {
    expect(monthPeriodContaining('2026-12-15')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  // TR-008: this used to fall back to `new Date()`, quietly swapping the
  // app's reporting window for the machine's real clock.
  it('throws on an invalid anchor rather than falling back to the real clock', () => {
    expect(() => monthPeriodContaining('2026-13-01')).toThrow(/valid YYYY-MM-DD/)
    expect(() => monthPeriodContaining('')).toThrow()
  })
})

describe('isDateInPeriod', () => {
  const period = monthPeriodContaining('2026-08-29')

  it('includes the first day of the period (inclusive start)', () => {
    expect(isDateInPeriod('2026-08-01', period)).toBe(true)
  })

  it('includes the last day of the period', () => {
    expect(isDateInPeriod('2026-08-31', period)).toBe(true)
  })

  it('excludes the first day of the next month (exclusive end)', () => {
    expect(isDateInPeriod('2026-09-01', period)).toBe(false)
  })

  it('excludes the last day of the previous month', () => {
    expect(isDateInPeriod('2026-07-31', period)).toBe(false)
  })

  it('excludes an arbitrary date in a future month', () => {
    expect(isDateInPeriod('2027-01-05', period)).toBe(false)
  })

  it('excludes an impossible date outright', () => {
    expect(isDateInPeriod('2026-08-32', period)).toBe(false)
  })
})

describe('addDaysToIso / isIsoDateWithinInclusive (commitment horizon helpers)', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDaysToIso('2026-08-29', 30)).toBe('2026-09-28')
    expect(addDaysToIso('2026-12-20', 30)).toBe('2027-01-19')
    expect(addDaysToIso('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('throws rather than guessing for an invalid date', () => {
    expect(() => addDaysToIso('2026-02-31', 1)).toThrow()
  })

  it('treats both ends of the window as inclusive', () => {
    expect(isIsoDateWithinInclusive('2026-08-29', '2026-08-29', '2026-09-28')).toBe(true)
    expect(isIsoDateWithinInclusive('2026-09-28', '2026-08-29', '2026-09-28')).toBe(true)
    expect(isIsoDateWithinInclusive('2026-09-29', '2026-08-29', '2026-09-28')).toBe(false)
    expect(isIsoDateWithinInclusive('2026-08-28', '2026-08-29', '2026-09-28')).toBe(false)
  })
})
