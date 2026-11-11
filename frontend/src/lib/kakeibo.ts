import type {
  Category,
  Centavos,
  KakeiboEnvelope,
  KakeiboEnvelopeReport,
  KakeiboMonth,
  KakeiboPlan,
  KakeiboPlanValues,
  KakeiboReview,
  KakeiboReviewValues,
  KakeiboWeekNotes,
} from '../types.ts'
import { parseMoney } from './entryForm.ts'
import { amountText } from './money.ts'

/*
 * Kakeibo rules for the screens (ADR-021), kept free of React so they can be tested.
 *
 * The server works out every saved figure: available to allocate, unallocated, each envelope's spending and
 * what remains. Two things here do arithmetic, and both are for display only, like Quick Add's "estimate":
 *  - `planEstimate` previews the plan form's totals while typing, so an over-allocation can be pointed out
 *    before saving. It is labelled as an estimate and never sent; after a save the screen shows the server's.
 *  - `envelopeProgress` turns the server's spent and limit into the width of a progress bar.
 */
export const ENVELOPES: readonly KakeiboEnvelope[] = ['needs', 'wants', 'culture', 'unexpected']

export const ENVELOPE_INFO: Record<KakeiboEnvelope, { label: string; meaning: string; examples: string }> = {
  needs: { label: 'Needs', meaning: 'Essentials', examples: 'Rent, groceries, bills, commute' },
  wants: { label: 'Wants', meaning: 'Nice to have', examples: 'Eating out, shopping, treats' },
  culture: { label: 'Culture', meaning: 'Learning, hobbies, growth', examples: 'Books, courses, classes' },
  unexpected: { label: 'Unexpected', meaning: 'Irregular or unplanned', examples: 'Repairs, medicine, gifts' },
}

export const envelopeLabel = (envelope: KakeiboEnvelope | null | undefined): string =>
  envelope ? ENVELOPE_INFO[envelope].label : 'Not classified'

/**
 * Whether the server knows about Kakeibo: its categories carry `default_kakeibo_envelope` (null or a name).
 * An older API leaves the field out, and then no envelope is ever sent to it.
 */
export const supportsKakeibo = (categories: Category[]): boolean =>
  categories.some((category) => category.defaultEnvelope !== undefined)

/** The suggestion for an expense category: its default envelope, or null when it has none. */
export function suggestedEnvelope(categories: Category[], categoryId: number | null): KakeiboEnvelope | null {
  const category = categories.find((item) => item.id === categoryId)
  return category?.type === 'expense' ? category.defaultEnvelope ?? null : null
}

/* ---------- Plan form ---------- */

export type PlanField = keyof KakeiboPlanValues
export type PlanErrors = Partial<Record<PlanField, string>>

export const MAX_INTENTION = 240

export const PLAN_MONEY_FIELDS: readonly Exclude<PlanField, 'monthlyIntention'>[] = [
  'plannedIncome',
  'allocatedStartingFunds',
  'savingsTarget',
  'priorPeriodDebtReserve',
  'needsLimit',
  'wantsLimit',
  'cultureLimit',
  'unexpectedLimit',
]

export const LIMIT_FIELD: Record<KakeiboEnvelope, Exclude<PlanField, 'monthlyIntention'>> = {
  needs: 'needsLimit',
  wants: 'wantsLimit',
  culture: 'cultureLimit',
  unexpected: 'unexpectedLimit',
}

/** Empty values for a month with no plan. Starting funds and the debt reserve are optional, so they start at zero. */
export const EMPTY_PLAN: KakeiboPlanValues = {
  plannedIncome: '',
  allocatedStartingFunds: '0.00',
  savingsTarget: '',
  priorPeriodDebtReserve: '0.00',
  needsLimit: '',
  wantsLimit: '',
  cultureLimit: '',
  unexpectedLimit: '',
  monthlyIntention: '',
}

/** The stored plan as text a person can edit: 1800000 -> "18000.00". */
export function planValues(plan: KakeiboPlan | null): KakeiboPlanValues {
  if (!plan) return EMPTY_PLAN
  return {
    plannedIncome: amountText(plan.plannedIncome),
    allocatedStartingFunds: amountText(plan.allocatedStartingFunds),
    savingsTarget: amountText(plan.savingsTarget),
    priorPeriodDebtReserve: amountText(plan.priorPeriodDebtReserve),
    needsLimit: amountText(plan.limits.needs),
    wantsLimit: amountText(plan.limits.wants),
    cultureLimit: amountText(plan.limits.culture),
    unexpectedLimit: amountText(plan.limits.unexpected),
    monthlyIntention: plan.monthlyIntention ?? '',
  }
}

export type PlanAmountResult = { ok: true; centavos: Centavos } | { ok: false; error: string }

/** A plan amount: zero is fine, a negative amount or more than two decimal places is not. */
export function parsePlanAmount(text: string): PlanAmountResult {
  const trimmed = text.trim().replace(/^₱\s*/, '')
  if (/^[-−]/.test(trimmed)) return { ok: false, error: "Plan amounts can't be negative." }
  if (trimmed === '') return { ok: false, error: 'Enter an amount (0 is fine).' }
  return parseMoney(trimmed, true)
}

export function validatePlan(values: KakeiboPlanValues): PlanErrors {
  const errors: PlanErrors = {}
  for (const field of PLAN_MONEY_FIELDS) {
    const parsed = parsePlanAmount(values[field])
    if (!parsed.ok) errors[field] = parsed.error
  }
  if (values.monthlyIntention.trim().length > MAX_INTENTION) errors.monthlyIntention = `Keep the intention under ${MAX_INTENTION} characters.`
  return errors
}

/** A display-only preview of the plan's totals; null until every amount is valid. Never sent or saved. */
export function planEstimate(values: KakeiboPlanValues): { available: Centavos; unallocated: Centavos } | null {
  const amount = {} as Record<(typeof PLAN_MONEY_FIELDS)[number], Centavos>
  for (const field of PLAN_MONEY_FIELDS) {
    const parsed = parsePlanAmount(values[field])
    if (!parsed.ok) return null
    amount[field] = parsed.centavos
  }
  const available = amount.plannedIncome + amount.allocatedStartingFunds - amount.savingsTarget - amount.priorPeriodDebtReserve
  const limits = amount.needsLimit + amount.wantsLimit + amount.cultureLimit + amount.unexpectedLimit
  return { available, unallocated: available - limits }
}

/* ---------- Envelope display ---------- */

export type EnvelopeState = 'no-plan' | 'no-limit' | 'within' | 'at-limit' | 'over'

/**
 * How an envelope reads on screen, from the server's figures. `percent` is the share of the limit spent, for
 * the bar only (0-100, rounded down so "100%" only shows once the limit is truly reached). A zero limit has
 * no meaningful share, so it gets no bar at all instead of a division by zero.
 */
export function envelopeProgress(report: KakeiboEnvelopeReport): { state: EnvelopeState; percent: number | null } {
  if (report.limit === null) return { state: 'no-plan', percent: null }
  if (report.limit === 0) return { state: 'no-limit', percent: null }
  const percent = Math.min(100, Math.floor((report.spent * 100) / report.limit))
  if (report.spent > report.limit) return { state: 'over', percent: 100 }
  if (report.spent === report.limit) return { state: 'at-limit', percent: 100 }
  return { state: 'within', percent }
}

/*
 * The accent of each envelope (spec section 6.5): one subtle tint, ink and solid per envelope so the four cards
 * are quick to tell apart. They belong to the four fixed envelopes, NOT to categories (a category's own color is
 * independent), and the envelope's name is always written next to its color. The tint and ink are text-grade
 * contrast and the solid is graphics-grade against white (both checked in tests/kakeibo.test.ts).
 */
export const ENVELOPE_ACCENT: Record<KakeiboEnvelope, { bg: string; fg: string; solid: string }> = {
  needs: { bg: '#E3EDFD', fg: '#1B4DB0', solid: '#2D6BD8' },
  wants: { bg: '#EEE6FB', fg: '#512A98', solid: '#7449CE' },
  culture: { bg: '#DDF4F2', fg: '#0F5F5A', solid: '#14857F' },
  unexpected: { bg: '#FEF1D2', fg: '#7A4A06', solid: '#A8690C' },
}

/**
 * The plan summary's three headline figures, for display only (like `envelopeProgress`): whole-centavo sums of the
 * four per-envelope figures the server reported. They cover the four envelopes only, so expenses that have no
 * envelope are NOT in them (they stay in the month's total expenses), and a savings target is not in them either
 * (it is a goal, never money already saved). `null` when the month has no plan, because then no envelope has a limit.
 */
export interface PlanProgress {
  allocated: Centavos // the four limits together
  classifiedSpent: Centavos // spending that has an envelope
  remaining: Centavos // the four remainders together; negative when the envelopes are over their limits together
  percent: number | null // classified spending as a share of the allocation, 0-100; null when nothing is allocated
  overCount: number // envelopes spent past their own limit
}

export function planProgress(report: KakeiboMonth): PlanProgress | null {
  let allocated = 0
  let classifiedSpent = 0
  let remaining = 0
  let overCount = 0
  for (const envelope of ENVELOPES) {
    const { limit, spent, remaining: left } = report.envelopes[envelope]
    if (limit === null || left === null) return null
    allocated += limit
    classifiedSpent += spent
    remaining += left
    if (spent > limit) overCount += 1
  }
  const percent = allocated === 0 ? null : Math.min(100, Math.floor((classifiedSpent * 100) / allocated))
  return { allocated, classifiedSpent, remaining, percent, overCount }
}

/* ---------- Weeks (Monday to Sunday, as the server counts them) ---------- */

/*
 * Calendar arithmetic on "YYYY-MM-DD" strings in UTC, so a time zone or a daylight-saving change can never
 * move a date. A week belongs to no single month: the week of Monday 27 October 2025 ends on Sunday 2 November.
 */
const toUtc = (date: string): Date => new Date(`${date}T00:00:00Z`)
const fromUtc = (d: Date): string => d.toISOString().slice(0, 10)

export function addDays(date: string, days: number): string {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** The Monday on or before `date`. */
export function mondayOf(date: string): string {
  const day = toUtc(date).getUTCDay() // 0 = Sunday … 6 = Saturday
  return addDays(date, day === 0 ? -6 : 1 - day)
}

export const isMonday = (date: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(date) && fromUtc(toUtc(date)) === date && toUtc(date).getUTCDay() === 1

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (date: string, withYear: boolean) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${SHORT_MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`
}

/** "Oct 27 – Nov 2, 2025"; both years when the week crosses into a new year ("Dec 29, 2025 – Jan 4, 2026"). */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6)
  const sameYear = weekStart.slice(0, 4) === end.slice(0, 4)
  return `${shortDate(weekStart, !sameYear)} – ${shortDate(end, true)}`
}

/**
 * The weeks that touch a month (newest first), ending with the week that contains `today`: future weeks are
 * not offered. Each is a Monday; the first may start in the month before, the last may end in the next.
 */
export function weeksOfMonth(month: string, today: string): string[] {
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const last = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`, -1)
  const stop = mondayOf(last < today ? last : today)
  const weeks: string[] = []
  for (let monday = mondayOf(first); monday <= stop; monday = addDays(monday, 7)) weeks.push(monday)
  return weeks.reverse()
}

/** The week shown first: the one containing today when it is in the month, otherwise the month's last week. */
export function defaultWeek(month: string, today: string): string {
  return weeksOfMonth(month, today)[0] ?? mondayOf(`${month}-01`)
}

/* ---------- Reflections ---------- */

export const MAX_REFLECTION = 1000

export const WEEK_QUESTIONS: { field: keyof KakeiboWeekNotes; question: string }[] = [
  { field: 'surprise', question: 'What surprised me about my spending?' },
  { field: 'worthwhile', question: 'Which expenses felt worthwhile?' },
  { field: 'nextWeek', question: 'What will I do differently next week?' },
]

export const MONTH_QUESTIONS: { field: Exclude<keyof KakeiboReviewValues, 'savedDeclared'>; question: string }[] = [
  { field: 'available', question: 'How much came in, and what was available to spend?' },
  { field: 'savings', question: 'What did I mean to save, and what did I set aside?' },
  { field: 'change', question: 'What is one change I will make next month?' },
  { field: 'appreciated', question: 'Which purchase am I glad I made?' },
  { field: 'surprise', question: 'What surprised me this month?' },
  { field: 'lesson', question: 'What lesson will I keep?' },
]

export const EMPTY_WEEK_NOTES: KakeiboWeekNotes = { surprise: '', worthwhile: '', nextWeek: '' }

export function validateWeekNotes(notes: KakeiboWeekNotes): Partial<Record<keyof KakeiboWeekNotes, string>> {
  const errors: Partial<Record<keyof KakeiboWeekNotes, string>> = {}
  for (const { field } of WEEK_QUESTIONS) {
    if (notes[field].trim().length > MAX_REFLECTION) errors[field] = `Keep this under ${MAX_REFLECTION.toLocaleString('en')} characters.`
  }
  return errors
}

export function reviewValues(review: KakeiboReview | null): KakeiboReviewValues {
  return {
    savedDeclared: review?.savedDeclared == null ? '' : amountText(review.savedDeclared),
    available: review?.available ?? '',
    savings: review?.savings ?? '',
    change: review?.change ?? '',
    appreciated: review?.appreciated ?? '',
    surprise: review?.surprise ?? '',
    lesson: review?.lesson ?? '',
  }
}

/** Self-reported savings: optional (blank), zero allowed, no negatives, at most two decimal places. */
export function parseSavedDeclared(text: string): { ok: true; centavos: Centavos | null } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: true, centavos: null }
  return parsePlanAmount(text)
}

export function validateReview(values: KakeiboReviewValues): Partial<Record<keyof KakeiboReviewValues, string>> {
  const errors: Partial<Record<keyof KakeiboReviewValues, string>> = {}
  const saved = parseSavedDeclared(values.savedDeclared)
  if (!saved.ok) errors.savedDeclared = saved.error
  for (const { field } of MONTH_QUESTIONS) {
    if (values[field].trim().length > MAX_REFLECTION) errors[field] = `Keep this under ${MAX_REFLECTION.toLocaleString('en')} characters.`
  }
  return errors
}
