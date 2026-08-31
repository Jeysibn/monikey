// TR-001: ONE injectable application clock.
//
// Before this module the app had two different definitions of "today": a
// fixed `DEMO_TODAY_ISO` used by every reporting calculation, and a bare
// `new Date()` inside the Add Transaction form's default date. Those agreed
// only for as long as the real calendar stayed inside August 2026 — after
// that a newly saved "default" transaction would land outside the reporting
// period every KPI labels.
//
// Runtime mode chosen (the report's "acceptable demo mode"): a FIXED demo
// clock everywhere — reporting periods, form defaults, trend buckets, budget
// days remaining, goal target validation, goal-funding ledger dates, and
// goal completion dates all read `AppClock.todayIso()`. Because the clock is
// fixed rather than the system date, the visible reporting window is labeled
// with its real month ("August 2026", via `formatPeriodLabel`) instead of an
// ambiguous "this month".
//
// Nothing outside this module may call `new Date()` to ask what day it is:
// forms and selectors take the resolved `todayIso` string, and tests inject
// their own `fixedClock(...)` to freeze or advance time explicitly.

import { isValidIsoDate, isoFromLocalDate } from './date'

export interface AppClock {
  /** The current date as a strict `YYYY-MM-DD` local calendar date. */
  todayIso(): string
}

/**
 * A clock frozen at one calendar date. Used for the demo runtime mode and by
 * every test that needs deterministic period/rollover behavior.
 */
export function fixedClock(iso: string): AppClock {
  if (!isValidIsoDate(iso)) {
    throw new Error(`fixedClock requires a valid YYYY-MM-DD date, received "${iso}".`)
  }
  return { todayIso: () => iso }
}

/**
 * The real system-local date. Not used by the app today (the demo runtime
 * mode is a fixed clock so the seeded August 2026 dataset reads correctly
 * whenever it is opened) — kept as the ready-made swap for the moment the
 * seed data becomes relative or a real backend supplies dates.
 */
export function systemClock(): AppClock {
  return { todayIso: () => isoFromLocalDate(new Date()) }
}

/** The demo dataset's "today" — the anchor every seeded date is written around. */
export const DEMO_TODAY_ISO = '2026-08-29'

/** The app's default clock: frozen at the demo dataset's today. */
export const demoClock: AppClock = fixedClock(DEMO_TODAY_ISO)

/**
 * The clock the running app uses, with one deliberate, documented override:
 * `?today=YYYY-MM-DD` moves the whole app to that date. Because there is
 * exactly one clock, that single query parameter moves the reporting period,
 * every "this month" total, the chart buckets, budget days remaining, the
 * Add Transaction form's default date, and goal validation *together* —
 * which is precisely what makes the month-rollover behavior observable from
 * an end-to-end test without waiting for the calendar.
 *
 * An absent or invalid value falls back to the demo clock; it never falls
 * back to the machine's real date, so an unparseable parameter can't quietly
 * introduce a second clock.
 */
export function resolveAppClock(search: string): AppClock {
  const requested = new URLSearchParams(search).get('today')
  if (requested && isValidIsoDate(requested)) return fixedClock(requested)
  return demoClock
}
