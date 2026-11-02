import type { Category, Centavos, KakeiboEnvelope, KakeiboEnvelopeReport, KakeiboPlan, KakeiboPlanValues } from '../types.ts'
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
