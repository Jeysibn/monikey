import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEMO_TODAY_ISO, demoClock, fixedClock, resolveAppClock, systemClock } from './clock'

describe('AppClock (TR-001)', () => {
  it('fixedClock reports exactly the date it was frozen at', () => {
    expect(fixedClock('2027-01-01').todayIso()).toBe('2027-01-01')
  })

  it('fixedClock refuses an impossible date rather than rolling it over', () => {
    expect(() => fixedClock('2026-02-31')).toThrow()
    expect(() => fixedClock('2026-13-01')).toThrow()
    expect(() => fixedClock('nope')).toThrow()
  })

  it('the app default clock is the demo date the seed data is written around', () => {
    expect(demoClock.todayIso()).toBe(DEMO_TODAY_ISO)
    expect(DEMO_TODAY_ISO).toBe('2026-08-29')
  })

})

// FINDING-007: comparing `systemClock()` to `isoFromLocalDate(new Date())` just
// restated the implementation — a regression to `toISOString().slice(0, 10)`
// would shift both sides together and still pass, and reading the machine
// clock twice could straddle midnight. These pin a fixed instant instead, in a
// timezone (Asia/Manila, UTC+8, set for the whole suite in vitest.config.ts)
// where the local and UTC calendar dates genuinely differ.
describe('systemClock returns the LOCAL calendar date, never a UTC-shifted one', () => {
  beforeAll(() => {
    vi.useFakeTimers()
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('reports the local date when UTC is still on the previous day', () => {
    // 2027-03-04T17:00Z is 2027-03-05 01:00 in Manila.
    vi.setSystemTime(new Date('2027-03-04T17:00:00.000Z'))
    expect(systemClock().todayIso()).toBe('2027-03-05')
    // The bug this guards against, stated explicitly.
    expect(new Date().toISOString().slice(0, 10)).toBe('2027-03-04')
    expect(systemClock().todayIso()).not.toBe(new Date().toISOString().slice(0, 10))
  })

  it('reports the local date when UTC has already rolled to the next day', () => {
    // 2026-12-31T16:30Z is 2027-01-01 00:30 in Manila — a year boundary.
    vi.setSystemTime(new Date('2026-12-31T16:30:00.000Z'))
    expect(systemClock().todayIso()).toBe('2027-01-01')
  })

  it('zero-pads single-digit months and days', () => {
    vi.setSystemTime(new Date('2027-01-02T03:00:00.000Z')) // 2027-01-02 11:00 Manila
    expect(systemClock().todayIso()).toBe('2027-01-02')
  })
})

describe('resolveAppClock (the app-level clock override)', () => {
  it('uses ?today when it is a real calendar date', () => {
    expect(resolveAppClock('?today=2027-01-15').todayIso()).toBe('2027-01-15')
    expect(resolveAppClock('?foo=1&today=2026-12-31').todayIso()).toBe('2026-12-31')
  })

  it('falls back to the demo clock — never the machine clock — for a missing or impossible value', () => {
    expect(resolveAppClock('').todayIso()).toBe(DEMO_TODAY_ISO)
    expect(resolveAppClock('?today=').todayIso()).toBe(DEMO_TODAY_ISO)
    expect(resolveAppClock('?today=2026-02-31').todayIso()).toBe(DEMO_TODAY_ISO)
    expect(resolveAppClock('?today=yesterday').todayIso()).toBe(DEMO_TODAY_ISO)
  })
})
