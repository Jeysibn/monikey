import { describe, expect, it } from 'vitest'
import { isDateInPeriod, isoFromLocalDate, localDateFromIso, monthPeriodContaining } from './date'

describe('localDateFromIso / isoFromLocalDate', () => {
  it('round-trips an ISO date without a timezone shift', () => {
    const date = localDateFromIso('2026-08-29')
    expect(date).toBeDefined()
    expect(date!.getFullYear()).toBe(2026)
    expect(date!.getMonth()).toBe(7) // August, 0-indexed
    expect(date!.getDate()).toBe(29)
    expect(isoFromLocalDate(date!)).toBe('2026-08-29')
  })

  it('returns undefined for invalid input', () => {
    expect(localDateFromIso('')).toBeUndefined()
    expect(localDateFromIso('not-a-date')).toBeUndefined()
  })
})

describe('monthPeriodContaining', () => {
  it('produces an inclusive start and exclusive end spanning the whole calendar month', () => {
    const period = monthPeriodContaining('2026-08-29')
    expect(period).toEqual({ start: '2026-08-01', end: '2026-09-01' })
  })

  it('rolls over correctly for December', () => {
    const period = monthPeriodContaining('2026-12-15')
    expect(period).toEqual({ start: '2026-12-01', end: '2027-01-01' })
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
})
