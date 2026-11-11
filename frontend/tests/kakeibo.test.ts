/*
 * Kakeibo (ADR-021, PR C): the plan form rules, envelope display, the wire contract, the HTTP routes and
 * bodies, the mock's behaviour, and HTTP/mock parity (the same month reads the same through either source).
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError } from '../src/dataSource.ts'
import { createHttpSource } from '../src/httpSource.ts'
import { createMockSource } from '../src/mockSource.ts'
import { describeWriteError } from '../src/lib/apiErrors.ts'
import { switchKind } from '../src/lib/entryForm.ts'
import { buildSnapshot } from '../src/lib/finance.ts'
import {
  EMPTY_PLAN,
  ENVELOPE_ACCENT,
  envelopeProgress,
  parsePlanAmount,
  planProgress,
  planEstimate,
  planValues,
  suggestedEnvelope,
  supportsKakeibo,
  validatePlan,
} from '../src/lib/kakeibo.ts'
import { getMockData } from '../src/mockData.ts'
import { fromWireCategories, fromWireField, fromWireKakeiboMonth, fromWireTransaction, toWireEntryInput, toWireKakeiboPlan } from '../src/wire.ts'
import type { EntryValues, KakeiboPlanValues } from '../src/types.ts'

const signal = () => new AbortController().signal
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

const plan: KakeiboPlanValues = {
  plannedIncome: '36,000',
  allocatedStartingFunds: '2000',
  savingsTarget: '5000.00',
  priorPeriodDebtReserve: '3000',
  needsLimit: '18000',
  wantsLimit: '5000',
  cultureLimit: '2000',
  unexpectedLimit: '3000',
  monthlyIntention: '  Cook at home on weekdays and keep weekends for one treat.  ',
}

/* What the backend (main.py kakeibo_month_response) returns for the mock's fictional October. */
const wireOctober = {
  month: '2026-10',
  plan_status: 'saved',
  plan: {
    month: '2026-10-01',
    planned_income: '36000.00', allocated_starting_funds: '2000.00', savings_target: '5000.00', prior_period_debt_reserve: '3000.00',
    needs_limit: '18000.00', wants_limit: '5000.00', culture_limit: '2000.00', unexpected_limit: '3000.00',
    monthly_intention: 'Cook at home on weekdays and keep weekends for one treat.',
    actual_saved_declared: null, review_available: null, review_savings: null, review_change: null, review_appreciated: null,
    review_surprise: null, review_lesson: null, reviewed_at: null, review_actuals_snapshot: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  },
  planned_income: '36000.00',
  actual_income: '36500.00',
  available_to_allocate: '30000.00',
  unallocated: '2000.00',
  envelopes: {
    needs: { limit: '18000.00', actual_spent: '19951.90', remaining: '-1951.90' },
    wants: { limit: '5000.00', actual_spent: '3864.00', remaining: '1136.00' },
    culture: { limit: '2000.00', actual_spent: '1800.00', remaining: '200.00' },
    unexpected: { limit: '3000.00', actual_spent: '486.50', remaining: '2513.50' },
  },
  unclassified_expenses: '1025.00',
  total_expenses: '27127.40',
  savings_target: '5000.00',
  actual_saved_declared: null,
  reviewed_at: null,
  actuals_changed_since_review: false,
}

const wireEmptyMonth = (month: string) => ({
  month, plan_status: 'not_saved', plan: null, review: null, planned_income: null, actual_income: '0.00', available_to_allocate: null, unallocated: null,
  envelopes: Object.fromEntries(['needs', 'wants', 'culture', 'unexpected'].map((e) => [e, { limit: null, actual_spent: '0.00', remaining: null }])),
  unclassified_expenses: '0.00', total_expenses: '0.00', savings_target: null, actual_saved_declared: null, reviewed_at: null, actuals_changed_since_review: false,
})

describe('plan form rules', () => {
  it('accepts zero, rejects negatives and more than two decimal places', () => {
    assert.deepEqual(parsePlanAmount('0'), { ok: true, centavos: 0 })
    assert.deepEqual(parsePlanAmount('₱1,250.50'), { ok: true, centavos: 125_050 })
    assert.deepEqual(parsePlanAmount('-5'), { ok: false, error: "Plan amounts can't be negative." })
    assert.deepEqual(parsePlanAmount('−5'), { ok: false, error: "Plan amounts can't be negative." })
    assert.deepEqual(parsePlanAmount('1.234'), { ok: false, error: 'Use at most 2 decimal places.' })
    assert.deepEqual(parsePlanAmount(''), { ok: false, error: 'Enter an amount (0 is fine).' })
    assert.equal(parsePlanAmount('10000000000').ok, false) // NUMERIC(12,2) holds at most 9,999,999,999.99
  })

  it('validates every amount and the intention length', () => {
    assert.deepEqual(validatePlan(plan), {})
    const errors = validatePlan({ ...EMPTY_PLAN, monthlyIntention: 'x'.repeat(241) })
    assert.deepEqual(Object.keys(errors).sort(), ['cultureLimit', 'monthlyIntention', 'needsLimit', 'plannedIncome', 'savingsTarget', 'unexpectedLimit', 'wantsLimit'].sort())
    assert.equal(errors.allocatedStartingFunds, undefined) // starts at 0.00
  })

  it('estimates the totals for display only, and keeps an over-allocation negative', () => {
    assert.deepEqual(planEstimate(plan), { available: 3_000_000, unallocated: 200_000 })
    assert.deepEqual(planEstimate({ ...plan, needsLimit: '25000' }), { available: 3_000_000, unallocated: -500_000 })
    assert.equal(planEstimate(EMPTY_PLAN), null) // not until every amount is valid
  })

  it('turns a stored plan into editable text and back into the PUT body', () => {
    const mock = getMockData().kakeiboPlans![0]
    const values = planValues(mock)
    assert.equal(values.needsLimit, '18000.00')
    assert.equal(values.monthlyIntention, mock.monthlyIntention)
    assert.deepEqual(planValues(null), EMPTY_PLAN)
    assert.deepEqual(toWireKakeiboPlan(plan), {
      planned_income: '36000.00', allocated_starting_funds: '2000.00', savings_target: '5000.00', prior_period_debt_reserve: '3000.00',
      needs_limit: '18000.00', wants_limit: '5000.00', culture_limit: '2000.00', unexpected_limit: '3000.00',
      monthly_intention: 'Cook at home on weekdays and keep weekends for one treat.',
    })
    assert.equal(toWireKakeiboPlan({ ...plan, monthlyIntention: '   ' }).monthly_intention, null)
    assert.throws(() => toWireKakeiboPlan({ ...plan, needsLimit: '-1' }))
  })
})

describe('envelope display', () => {
  it('shows progress within, at and over the limit, and keeps the negative remainder', () => {
    assert.deepEqual(envelopeProgress({ limit: 500_000, spent: 386_400, remaining: 113_600 }), { state: 'within', percent: 77 })
    assert.deepEqual(envelopeProgress({ limit: 500_000, spent: 500_000, remaining: 0 }), { state: 'at-limit', percent: 100 })
    assert.deepEqual(envelopeProgress({ limit: 1_800_000, spent: 1_995_190, remaining: -195_190 }), { state: 'over', percent: 100 })
    assert.deepEqual(envelopeProgress({ limit: 500_000, spent: 499_999, remaining: 1 }), { state: 'within', percent: 99 }) // never "100%" before it is reached
  })

  it('a zero limit or a month with no plan has no bar (no division by zero)', () => {
    assert.deepEqual(envelopeProgress({ limit: 0, spent: 0, remaining: 0 }), { state: 'no-limit', percent: null })
    assert.deepEqual(envelopeProgress({ limit: 0, spent: 25_000, remaining: -25_000 }), { state: 'no-limit', percent: null })
    assert.deepEqual(envelopeProgress({ limit: null, spent: 25_000, remaining: null }), { state: 'no-plan', percent: null })
  })
})

describe('category suggestions', () => {
  const categories = getMockData().categories
  it('knows whether the server supports Kakeibo from the category field', () => {
    assert.equal(supportsKakeibo(categories), true)
    assert.equal(supportsKakeibo(fromWireCategories([{ id: 4, name: 'Food', type: 'expense' }])), false) // older API
    assert.equal(supportsKakeibo(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', default_kakeibo_envelope: null }])), true)
  })
  it('suggests an expense category default only', () => {
    assert.equal(suggestedEnvelope(categories, 6), 'needs') // Groceries
    assert.equal(suggestedEnvelope(categories, 4), null) // Food: no default
    assert.equal(suggestedEnvelope(categories, 1), null) // Salary is income
    assert.equal(suggestedEnvelope(categories, null), null)
  })
  it('switching away from Expense clears the envelope; undefined stays undefined for an older server', () => {
    const snapshot = buildSnapshot(getMockData())
    const expense: EntryValues = { kind: 'expense', amount: '1', accountId: 1, cardId: null, destinationAccountId: null, categoryId: 6, date: '2026-10-25', note: '', envelope: 'needs' }
    assert.equal(switchKind(expense, 'income', snapshot).envelope, null)
    assert.equal(switchKind(expense, 'payment', snapshot).envelope, null)
    assert.equal(switchKind(expense, 'expense', snapshot).envelope, 'needs')
    const { envelope: _drop, ...older } = expense
    assert.equal('envelope' in switchKind(older, 'income', snapshot), false)
  })
})

describe('wire contract', () => {
  it('parses a planned month exactly, including a negative remainder', () => {
    const month = fromWireKakeiboMonth(wireOctober, '2026-10')
    assert.equal(month.plan?.month, '2026-10')
    assert.equal(month.plan?.limits.needs, 1_800_000)
    assert.equal(month.availableToAllocate, 3_000_000)
    assert.equal(month.unallocated, 200_000)
    assert.deepEqual(month.envelopes.needs, { limit: 1_800_000, spent: 1_995_190, remaining: -195_190 })
    assert.equal(month.unclassifiedExpenses, 102_500)
    assert.equal(month.totalExpenses, 2_712_740)
    assert.equal(month.actualIncome, 3_650_000)
  })

  it('parses a month with no plan, with no limits invented', () => {
    const month = fromWireKakeiboMonth(wireEmptyMonth('2026-09'), '2026-09')
    assert.equal(month.plan, null)
    assert.equal(month.availableToAllocate, null)
    assert.deepEqual(month.envelopes.wants, { limit: null, spent: 0, remaining: null })
  })

  it('refuses a malformed or inconsistent response', () => {
    const bad = (patch: object) => assert.throws(() => fromWireKakeiboMonth({ ...wireOctober, ...patch }, '2026-10'), (err) => err instanceof ApiError && err.code === 'contract_error')
    bad({ month: '2026-11' })
    bad({ total_expenses: 27127.4 }) // a JSON float, never accepted for money
    bad({ envelopes: { ...wireOctober.envelopes, needs: { limit: '18000.00', actual_spent: '19951.90', remaining: '0.00' } } })
    bad({ envelopes: { ...wireOctober.envelopes, wants: { limit: null, actual_spent: '1.00', remaining: null } } }) // a planned month must have limits
    bad({ available_to_allocate: null })
    bad({ plan: { ...wireOctober.plan, month: '2026-09-01' } })
    bad({ plan: { ...wireOctober.plan, needs_limit: '-1.00' } })
  })

  it('reads envelopes on categories and transactions, and refuses one on income', () => {
    const categories = fromWireCategories([
      { id: 4, name: 'Food', type: 'expense', default_kakeibo_envelope: 'wants' },
      { id: 1, name: 'Salary', type: 'income', default_kakeibo_envelope: null },
    ])
    assert.equal(categories[0].defaultEnvelope, 'wants')
    assert.throws(() => fromWireCategories([{ id: 1, name: 'Salary', type: 'income', default_kakeibo_envelope: 'needs' }]))
    assert.throws(() => fromWireCategories([{ id: 4, name: 'Food', type: 'expense', default_kakeibo_envelope: 'savings' }]))
    const accounts = [{ id: 1, name: 'Cash', type: 'cash' as const }]
    const row = { id: 7, account_id: 1, category_id: 4, amount: '10.00', transaction_date: '2026-10-25', note: null, created_at: '2026-10-25T01:00:00Z' }
    assert.equal(fromWireTransaction({ ...row, kakeibo_envelope: 'culture' }, accounts, categories).entry.envelope, 'culture')
    assert.equal(fromWireTransaction({ ...row, kakeibo_envelope: null }, accounts, categories).entry.envelope, null)
    assert.equal('envelope' in fromWireTransaction(row, accounts, categories).entry, false) // older API: unknown, not "unclassified"
    assert.throws(() => fromWireTransaction({ ...row, category_id: 1, kakeibo_envelope: 'needs' }, accounts, categories))
  })

  it('sends kakeibo_envelope only for an expense whose envelope is known', () => {
    const expense: EntryValues = { kind: 'expense', amount: '10', accountId: 1, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-25', note: '' }
    assert.equal('kakeibo_envelope' in toWireEntryInput(expense), false) // older API: left out
    assert.deepEqual(toWireEntryInput({ ...expense, envelope: null }), { account_id: 1, category_id: 4, amount: '10.00', transaction_date: '2026-10-25', note: null, kakeibo_envelope: null })
    assert.equal((toWireEntryInput({ ...expense, envelope: 'needs' }) as { kakeibo_envelope?: string }).kakeibo_envelope, 'needs')
    assert.equal('kakeibo_envelope' in toWireEntryInput({ ...expense, kind: 'income', categoryId: 1, envelope: null }), false) // income: never sent
    const payment = toWireEntryInput({ ...expense, kind: 'payment', cardId: 2, envelope: 'needs' })
    assert.equal('kakeibo_envelope' in payment, false)
    const transfer = toWireEntryInput({ ...expense, kind: 'transfer', destinationAccountId: 3, envelope: 'needs' })
    assert.equal('kakeibo_envelope' in transfer, false)
  })

  it('maps plan and envelope error fields to the form', () => {
    assert.equal(fromWireField('needs_limit'), 'needsLimit')
    assert.equal(fromWireField('planned_income'), 'plannedIncome')
    assert.equal(fromWireField('kakeibo_envelope'), 'envelope')
    assert.equal(fromWireField('review_lesson'), 'lesson')
    assert.equal(fromWireField('next_week_intention'), 'nextWeek')
    assert.equal(fromWireField('review_actuals_snapshot'), undefined) // never a form field
  })
})

describe('HTTP source', () => {
  it('reads the report for the dashboard and the month for the form, and PUTs the plan', async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    const source = createHttpSource(async (input, init) => {
      const url = String(input)
      requests.push({ url, init })
      if (url === '/api/kakeibo/months/2026-10/report') return json(wireOctober)
      if (url === '/api/kakeibo/months/2026-10' && (init?.method ?? 'GET') === 'GET') return json(wireOctober)
      if (url === '/api/kakeibo/months/2026-10' && init?.method === 'PUT') return json(wireOctober)
      if (url === '/api/kakeibo/months/2026-09') return json(wireEmptyMonth('2026-09'))
      throw new Error(`Unexpected request ${url}`)
    })
    const month = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(month.envelopes.needs.remaining, -195_190)
    assert.equal((await source.loadKakeiboPlan('2026-10', signal()))?.plannedIncome, 3_600_000)
    assert.equal(await source.loadKakeiboPlan('2026-09', signal()), null)
    await source.saveKakeiboPlan('2026-10', plan)
    const put = requests.find((r) => r.init?.method === 'PUT')!
    assert.equal(put.url, '/api/kakeibo/months/2026-10')
    assert.deepEqual(JSON.parse(String(put.init!.body)), toWireKakeiboPlan(plan))
    assert.equal(requests.filter((r) => (r.init?.method ?? 'GET') === 'GET').every((r) => (r.init!.headers as Record<string, string>).Accept === 'application/json'), true)
    await assert.rejects(source.loadKakeiboMonth('2026-13', signal())) // a bad month never reaches the network
    assert.equal(requests.some((r) => r.url.includes('2026-13')), false)
  })

  it('reports a refused plan field in form terms, and a missing route as 404', async () => {
    const source = createHttpSource(async (input) => {
      if (String(input).endsWith('/2026-10')) return json({ error: { code: 'invalid_field', message: 'The request could not be validated.', field: 'wants_limit' } }, 422)
      return json({ error: { code: 'not_found', message: 'Resource not found.' } }, 404)
    })
    const refused = await source.saveKakeiboPlan('2026-10', plan).then(() => null, (err: unknown) => err)
    assert.ok(refused instanceof ApiError)
    assert.equal(refused.field, 'wantsLimit')
    const shown = describeWriteError(refused, 'save-plan')
    assert.equal(shown.field, 'wantsLimit')
    const missing = await source.loadKakeiboMonth('2026-09', signal()).then(() => null, (err: unknown) => err)
    assert.ok(missing instanceof ApiError && missing.status === 404)
  })

  it('a create sends the envelope; an update that leaves it out keeps the stored one', async () => {
    const bodies: unknown[] = []
    const source = createHttpSource(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return json({}, 201)
    })
    const values: EntryValues = { kind: 'expense', amount: '10', accountId: 1, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-25', note: '', envelope: 'wants' }
    await source.saveEntry(values)
    await source.saveEntry({ ...values, envelope: null }, { table: 'transaction', id: 9 })
    assert.equal((bodies[0] as Record<string, unknown>).kakeibo_envelope, 'wants')
    assert.equal((bodies[1] as Record<string, unknown>).kakeibo_envelope, null) // explicit null clears
  })

  it('save-plan failures keep the plan and say so', () => {
    assert.match(describeWriteError(new TypeError('offline'), 'save-plan').message, /Your plan is still here\./)
    assert.match(describeWriteError(new ApiError(404, 'not_found', 'Resource not found.'), 'save-plan').message, /can't be saved on this server yet/)
  })
})

describe('mock source', () => {
  it('answers the same October as the HTTP source parses from the backend shape (parity)', async () => {
    const mock = await createMockSource().loadKakeiboMonth('2026-10', signal())
    assert.deepEqual(mock, fromWireKakeiboMonth(wireOctober, '2026-10'))
    const empty = await createMockSource().loadKakeiboMonth('2026-09', signal())
    assert.deepEqual(empty, fromWireKakeiboMonth(wireEmptyMonth('2026-09'), '2026-09'))
  })

  it('without a plan: actual spending only, limits null', async () => {
    const month = await createMockSource({ scenario: 'no-plan' }).loadKakeiboMonth('2026-10', signal())
    assert.equal(month.plan, null)
    assert.equal(month.unallocated, null)
    assert.deepEqual(month.envelopes.needs, { limit: null, spent: 1_995_190, remaining: null })
    assert.equal(month.totalExpenses, 2_712_740)
  })

  it('saves a plan (zeros allowed) without touching the ledger, and replaces it on a second save', async () => {
    const source = createMockSource()
    const accountsBefore = await source.loadAccounts(signal())
    const zeros = { ...EMPTY_PLAN, plannedIncome: '0', savingsTarget: '0', needsLimit: '0', wantsLimit: '0', cultureLimit: '0', unexpectedLimit: '0' }
    await source.saveKakeiboPlan('2026-09', zeros)
    let month = await source.loadKakeiboMonth('2026-09', signal())
    assert.equal(month.availableToAllocate, 0)
    assert.deepEqual(month.envelopes.culture, { limit: 0, spent: 0, remaining: 0 })
    await source.saveKakeiboPlan('2026-09', { ...zeros, plannedIncome: '100' })
    month = await source.loadKakeiboMonth('2026-09', signal())
    assert.equal(month.plan?.plannedIncome, 10_000)
    assert.deepEqual(await source.loadAccounts(signal()), accountsBefore)
  })

  it('refuses a negative plan amount with a 422 on that field', async () => {
    const err = await createMockSource().saveKakeiboPlan('2026-10', { ...plan, wantsLimit: '-5' }).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof ApiError && err.status === 422 && err.field === 'wantsLimit')
  })

  it('a failed plan save leaves the stored plan as it was', async () => {
    const source = createMockSource({ failNextWrite: true })
    await assert.rejects(source.saveKakeiboPlan('2026-10', { ...plan, needsLimit: '1' }))
    assert.equal((await source.loadKakeiboPlan('2026-10', signal()))?.limits.needs, 1_800_000)
  })

  it('stores, keeps and clears an expense envelope like the API', async () => {
    const source = createMockSource()
    const october = () => source.loadKakeiboMonth('2026-10', signal())
    const before = await october()
    const expense: EntryValues = { kind: 'expense', amount: '100', accountId: 4, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-25', note: 'Card lunch', envelope: 'wants' }
    await source.saveEntry(expense)
    let after = await october()
    assert.equal(after.envelopes.wants.spent, before.envelopes.wants.spent + 10_000) // a card purchase counts once
    assert.equal(after.totalExpenses, before.totalExpenses + 10_000)
    const row = (await source.loadActivity({ month: '2026-10', accountId: null, limit: 50 }, signal())).items.find((i) => i.title === 'Card lunch')!
    assert.equal(row.entry.envelope, 'wants')
    const { envelope: _omit, ...omitted } = row.entry
    await source.saveEntry({ ...omitted, amount: '150' }, { table: 'transaction', id: row.id }) // an older client leaves it out
    after = await october()
    assert.equal(after.envelopes.wants.spent, before.envelopes.wants.spent + 15_000) // still Wants
    await source.saveEntry({ ...row.entry, amount: '150', envelope: null }, { table: 'transaction', id: row.id })
    after = await october()
    assert.equal(after.envelopes.wants.spent, before.envelopes.wants.spent)
    assert.equal(after.unclassifiedExpenses, before.unclassifiedExpenses + 15_000)
  })

  it('card payments, transfers and income never change the envelopes', async () => {
    const source = createMockSource()
    const before = await source.loadKakeiboMonth('2026-10', signal())
    const base = { amount: '500', cardId: null, destinationAccountId: null, categoryId: null, date: '2026-10-25', note: '', envelope: null }
    await source.saveEntry({ ...base, kind: 'payment', accountId: 2, cardId: 4 })
    await source.saveEntry({ ...base, kind: 'transfer', accountId: 2, destinationAccountId: 3 })
    await source.saveEntry({ ...base, kind: 'income', accountId: 2, categoryId: 2 })
    const after = await source.loadKakeiboMonth('2026-10', signal())
    assert.deepEqual(after.envelopes, before.envelopes)
    assert.equal(after.unclassifiedExpenses, before.unclassifiedExpenses)
    assert.equal(after.totalExpenses, before.totalExpenses)
    assert.equal(after.actualIncome, before.actualIncome + 50_000)
  })

  it('refuses an envelope on income with a 422, like the API', async () => {
    const err = await createMockSource().saveEntry({ kind: 'income', amount: '1', accountId: 2, cardId: null, destinationAccountId: null, categoryId: 1, date: '2026-10-25', note: '', envelope: 'needs' }).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof ApiError && err.status === 422 && err.field === 'envelope')
  })

  it('fails Kakeibo reads on request, so the error states can be shown', async () => {
    const source = createMockSource({ readFailures: 'once', readFailureKinds: ['kakeibo'] })
    await assert.rejects(source.loadKakeiboMonth('2026-10', signal()))
    assert.equal((await source.loadKakeiboMonth('2026-10', signal())).month, '2026-10') // retry works
    await source.loadAccounts(signal()) // other reads are unaffected
  })
})

describe('plan summary figures (display-only sums of the server\'s per-envelope figures)', () => {
  const env = (limit: number | null, spent: number) => ({ limit, spent, remaining: limit === null ? null : limit - spent })
  const month = (envelopes: Record<'needs' | 'wants' | 'culture' | 'unexpected', ReturnType<typeof env>>, extra: object = {}) =>
    ({ month: '2026-10', planStatus: 'saved', plan: null, actualIncome: 0, availableToAllocate: 0, unallocated: 0, envelopes, unclassifiedExpenses: 0, totalExpenses: 0, review: null, actualsChangedSinceReview: false, ...extra }) as unknown as Parameters<typeof planProgress>[0]

  it('adds the four limits, the classified spending and the remainders in whole centavos', () => {
    const progress = planProgress(month({ needs: env(1_800_000, 1_250_075), wants: env(500_000, 140_000), culture: env(200_000, 0), unexpected: env(300_000, 48_650) }))!
    assert.equal(progress.allocated, 2_800_000)
    assert.equal(progress.classifiedSpent, 1_438_725)
    assert.equal(progress.remaining, 2_800_000 - 1_438_725) // allocation minus classified spending, to the centavo
    assert.equal(progress.percent, 51) // floor(51.38): "100%" never shows before the limit is reached
    assert.equal(progress.overCount, 0)
  })
  it('counts envelopes over their own limit and keeps a negative combined remainder', () => {
    const progress = planProgress(month({ needs: env(100_000, 150_000), wants: env(100_000, 20_000), culture: env(0, 5_000), unexpected: env(0, 0) }))!
    assert.equal(progress.overCount, 2) // needs, and culture (spent with a zero limit)
    assert.equal(progress.remaining, 200_000 - 175_000)
    assert.equal(progress.percent, 87)
    assert.equal(planProgress(month({ needs: env(100, 300), wants: env(0, 0), culture: env(0, 0), unexpected: env(0, 0) }))!.percent, 100) // capped
  })
  it('has no percentage when nothing is allocated, and no figures at all when the month has no plan', () => {
    assert.equal(planProgress(month({ needs: env(0, 0), wants: env(0, 0), culture: env(0, 0), unexpected: env(0, 0) }))!.percent, null)
    assert.equal(planProgress(month({ needs: env(null, 10), wants: env(null, 0), culture: env(null, 0), unexpected: env(null, 0) })), null)
  })
  it('ignores unclassified expenses and any savings target: they are not envelope spending', () => {
    const base = month({ needs: env(100_000, 40_000), wants: env(0, 0), culture: env(0, 0), unexpected: env(0, 0) })
    const withUnclassified = { ...base, unclassifiedExpenses: 999_999, totalExpenses: 1_039_999 }
    assert.deepEqual(planProgress(withUnclassified), planProgress(base))
  })
  it('agrees with the server on a real mock month (allocation = available - unallocated)', async () => {
    const report = await createMockSource().loadKakeiboMonth('2026-10', new AbortController().signal)
    const progress = planProgress(report)
    if (!progress) return assert.equal(report.plan, null)
    assert.equal(progress.allocated, report.availableToAllocate! - report.unallocated!)
    assert.equal(progress.classifiedSpent, report.totalExpenses - report.unclassifiedExpenses)
  })
})

describe('envelope accents', () => {
  const lum = (hex: string) => {
    const c = (i: number) => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2)
  }
  const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05) }
  it('has readable ink on each tint (4.5:1) and a visible solid on white (3:1)', () => {
    for (const [key, accent] of Object.entries(ENVELOPE_ACCENT)) {
      assert.ok(ratio(accent.fg, accent.bg) >= 4.5, `${key} ink on tint`)
      assert.ok(ratio(accent.solid, '#FFFFFF') >= 3, `${key} solid on white`)
    }
  })
  it('covers exactly the four fixed envelopes', () => {
    assert.deepEqual(Object.keys(ENVELOPE_ACCENT).sort(), ['culture', 'needs', 'unexpected', 'wants'])
  })
})
