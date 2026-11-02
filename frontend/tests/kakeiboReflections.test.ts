/*
 * Kakeibo PR D (ADR-021): weekly check-ins, month-end reflections and their snapshots, classifying past
 * expenses, and category suggestions — the date helpers, the wire contract, HTTP routes and bodies, and the
 * mock's behaviour (which mirrors the backend). Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError } from '../src/dataSource.ts'
import { createHttpSource } from '../src/httpSource.ts'
import { createMockSource } from '../src/mockSource.ts'
import { describeWriteError } from '../src/lib/apiErrors.ts'
import {
  addDays,
  defaultWeek,
  isMonday,
  mondayOf,
  parseSavedDeclared,
  planIsPlaceholder,
  reviewValues,
  validateReview,
  validateWeekNotes,
  weekLabel,
  weeksOfMonth,
} from '../src/lib/kakeibo.ts'
import { fromWireKakeiboMonth, fromWireKakeiboWeek, toWireKakeiboReview, toWireWeekNotes } from '../src/wire.ts'
import type { KakeiboReviewValues } from '../src/types.ts'

const signal = () => new AbortController().signal
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const reject = async (p: Promise<unknown>): Promise<ApiError> => {
  const err = await p.then(() => null, (e: unknown) => e)
  assert.ok(err instanceof ApiError, `expected an ApiError, got ${String(err)}`)
  return err
}
const answers: KakeiboReviewValues = { savedDeclared: '0', available: ' Enough. ', savings: '', change: 'Cook more.', appreciated: '', surprise: '', lesson: '' }

describe('weeks: Monday to Sunday, across months and years', () => {
  it('finds the Monday of any day, Sunday included', () => {
    assert.equal(mondayOf('2026-10-19'), '2026-10-19') // a Monday
    assert.equal(mondayOf('2026-10-25'), '2026-10-19') // Sunday belongs to the week before
    assert.equal(mondayOf('2026-11-01'), '2026-10-26') // crosses into November
    assert.equal(mondayOf('2026-01-01'), '2025-12-29') // crosses into a new year
    assert.equal(mondayOf('2024-03-01'), '2024-02-26') // leap year
    assert.equal(addDays('2024-02-28', 1), '2024-02-29')
    assert.equal(addDays('2025-12-29', 6), '2026-01-04')
  })
  it('accepts only real Mondays', () => {
    assert.equal(isMonday('2026-02-23'), true)
    assert.equal(isMonday('2026-02-24'), false)
    assert.equal(isMonday('2026-02-30'), false)
    assert.equal(isMonday('not-a-date'), false)
  })
  it('lists the weeks touching a month, newest first, and none in the future', () => {
    assert.deepEqual(weeksOfMonth('2026-10', '2026-10-25'), ['2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28'])
    assert.deepEqual(weeksOfMonth('2026-09', '2026-10-25').at(-1), '2026-08-31') // starts in August
    assert.equal(weeksOfMonth('2026-09', '2026-10-25')[0], '2026-09-28') // ends in October
    assert.equal(defaultWeek('2026-10', '2026-10-25'), '2026-10-19') // the week of today
    assert.equal(defaultWeek('2025-12', '2026-10-25'), '2025-12-29') // a past month: its last week
  })
  it('labels a week with both years when it crosses New Year', () => {
    assert.equal(weekLabel('2026-10-19'), 'Oct 19 – Oct 25, 2026')
    assert.equal(weekLabel('2026-10-26'), 'Oct 26 – Nov 1, 2026')
    assert.equal(weekLabel('2025-12-29'), 'Dec 29, 2025 – Jan 4, 2026')
  })
})

describe('reflection form rules', () => {
  it('self-reported savings: blank, zero and pesos are fine; negatives and 3 decimals are not', () => {
    assert.deepEqual(parseSavedDeclared(''), { ok: true, centavos: null })
    assert.deepEqual(parseSavedDeclared('0'), { ok: true, centavos: 0 })
    assert.deepEqual(parseSavedDeclared('4,000.50'), { ok: true, centavos: 400_050 })
    assert.equal(parseSavedDeclared('-1').ok, false)
    assert.equal(parseSavedDeclared('1.005').ok, false)
    assert.equal(validateReview({ ...answers, savedDeclared: '-5' }).savedDeclared, "Plan amounts can't be negative.")
  })
  it('limits every answer to 1,000 characters', () => {
    assert.ok(validateReview({ ...answers, lesson: 'x'.repeat(1001) }).lesson)
    assert.deepEqual(validateReview(answers), {})
    assert.ok(validateWeekNotes({ surprise: 'x'.repeat(1001), worthwhile: '', nextWeek: '' }).surprise)
  })
  it('an empty review starts blank, not zero', () => {
    assert.deepEqual(reviewValues(null), { savedDeclared: '', available: '', savings: '', change: '', appreciated: '', surprise: '', lesson: '' })
  })
})

describe('wire contract', () => {
  const week = {
    week_start: '2026-02-23', week_end: '2026-03-01',
    spending_by_envelope: { needs: '10.00', wants: '0.00', culture: '0.00', unexpected: '2.50' },
    unclassified_expenses: '1.00', total_expenses: '13.50',
    review: { surprise_note: 'The week crossed into March.', worthwhile_note: null, next_week_intention: 'Plan the commute.', created_at: '2026-03-01T01:00:00Z', updated_at: '2026-03-01T01:00:00Z' },
  }
  it('reads a week across a month edge, with null notes as blank', () => {
    const parsed = fromWireKakeiboWeek(week, '2026-02-23')
    assert.equal(parsed.weekEnd, '2026-03-01')
    assert.equal(parsed.spending.unexpected, 250)
    assert.deepEqual(parsed.review, { surprise: 'The week crossed into March.', worthwhile: '', nextWeek: 'Plan the commute.', updatedAt: '2026-03-01T01:00:00Z' })
    assert.equal(fromWireKakeiboWeek({ ...week, review: null }, '2026-02-23').review, null)
    assert.throws(() => fromWireKakeiboWeek(week, '2026-02-24'))
    assert.throws(() => fromWireKakeiboWeek({ ...week, total_expenses: 13.5 }, '2026-02-23'))
  })
  it('always sends all three weekly notes; a blank one is null', () => {
    assert.deepEqual(toWireWeekNotes({ surprise: ' Updated. ', worthwhile: '', nextWeek: '   ' }), { surprise_note: 'Updated.', worthwhile_note: null, next_week_intention: null })
  })
  it('sends a review with answers and savings only, never totals', () => {
    const body = toWireKakeiboReview(answers)
    assert.deepEqual(body, { actual_saved_declared: '0.00', review_available: 'Enough.', review_savings: null, review_change: 'Cook more.', review_appreciated: null, review_surprise: null, review_lesson: null })
    assert.equal('review_actuals_snapshot' in body, false)
    assert.equal(toWireKakeiboReview({ ...answers, savedDeclared: '' }).actual_saved_declared, null)
    assert.throws(() => toWireKakeiboReview({ ...answers, savedDeclared: '-1' }))
  })
  it('reads a saved review, its server snapshot and the changed flag', () => {
    const plan = {
      month: '2024-02-01', planned_income: '0.00', allocated_starting_funds: '0.00', savings_target: '0.00', prior_period_debt_reserve: '0.00',
      needs_limit: '0.00', wants_limit: '0.00', culture_limit: '0.00', unexpected_limit: '0.00', monthly_intention: null,
      actual_saved_declared: '300.00', review_available: 'Income covered the plan.', review_savings: null, review_change: 'Reduce wants.',
      review_appreciated: null, review_surprise: null, review_lesson: null, reviewed_at: '2024-02-29T12:00:00Z',
      review_actuals_snapshot: { actual_income: '1000.00', total_expenses: '200.00', unclassified: '50.00', envelopes: { needs: '100.00', wants: '50.00', culture: '0.00', unexpected: '0.00' } },
      created_at: '2024-02-29T12:00:00Z', updated_at: '2024-02-29T12:00:00Z',
    }
    const month = {
      month: '2024-02', plan, planned_income: '0.00', actual_income: '1000.00', available_to_allocate: '0.00', unallocated: '0.00',
      envelopes: Object.fromEntries(['needs', 'wants', 'culture', 'unexpected'].map((e) => [e, { limit: '0.00', actual_spent: e === 'needs' ? '120.00' : e === 'wants' ? '50.00' : '0.00', remaining: e === 'needs' ? '-120.00' : e === 'wants' ? '-50.00' : '0.00' }])),
      unclassified_expenses: '50.00', total_expenses: '220.00', savings_target: '0.00', actual_saved_declared: '300.00', reviewed_at: '2024-02-29T12:00:00Z', actuals_changed_since_review: true,
    }
    const parsed = fromWireKakeiboMonth(month, '2024-02')
    assert.equal(parsed.review?.savedDeclared, 30_000)
    assert.equal(parsed.review?.change, 'Reduce wants.')
    assert.deepEqual(parsed.review?.snapshot, { actualIncome: 100_000, totalExpenses: 20_000, unclassified: 5_000, envelopes: { needs: 10_000, wants: 5_000, culture: 0, unexpected: 0 } })
    assert.equal(parsed.actualsChangedSinceReview, true)
    assert.equal(planIsPlaceholder(parsed), true) // a review saved without a plan leaves ₱0.00 plan amounts
    assert.throws(() => fromWireKakeiboMonth({ ...month, plan: { ...plan, reviewed_at: null } }, '2024-02')) // "changed" with no review
    assert.throws(() => fromWireKakeiboMonth({ ...month, plan: { ...plan, review_actuals_snapshot: { ...plan.review_actuals_snapshot, total_expenses: '-1.00' } } }, '2024-02'))
  })
})

describe('HTTP source', () => {
  it('uses the agreed routes, verbs and bodies', async () => {
    const calls: { url: string; method: string; body?: unknown }[] = []
    const source = createHttpSource(async (input, init) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === '/api/kakeibo/weeks/2026-10-19' && (init?.method ?? 'GET') === 'GET') {
        return json({ week_start: '2026-10-19', week_end: '2026-10-25', spending_by_envelope: { needs: '0.00', wants: '0.00', culture: '0.00', unexpected: '0.00' }, unclassified_expenses: '0.00', total_expenses: '0.00', review: null })
      }
      return json({})
    })
    assert.equal((await source.loadKakeiboWeek('2026-10-19', signal())).review, null)
    await source.saveKakeiboWeek('2026-10-19', { surprise: 'a', worthwhile: '', nextWeek: 'c' })
    await source.saveKakeiboReview('2026-10', answers)
    await source.classifyExpense(17, 'needs')
    await source.classifyExpense(17, null)
    await source.setCategoryEnvelope(4, 'wants')
    assert.deepEqual(calls.slice(1).map((c) => `${c.method} ${c.url}`), [
      'PUT /api/kakeibo/weeks/2026-10-19',
      'PUT /api/kakeibo/months/2026-10/review',
      'PATCH /api/transactions/17/kakeibo-envelope',
      'PATCH /api/transactions/17/kakeibo-envelope',
      'PATCH /api/categories/4/default-kakeibo-envelope',
    ])
    assert.deepEqual(calls[1].body, { surprise_note: 'a', worthwhile_note: null, next_week_intention: 'c' })
    assert.deepEqual(calls[3].body, { kakeibo_envelope: 'needs' })
    assert.deepEqual(calls[4].body, { kakeibo_envelope: null }) // clearing sends null explicitly
    assert.deepEqual(calls[5].body, { default_kakeibo_envelope: 'wants' })
  })

  it('checks weeks and IDs before anything reaches the network', async () => {
    const urls: string[] = []
    const source = createHttpSource(async (input) => { urls.push(String(input)); return json({}) })
    await assert.rejects(source.loadKakeiboWeek('2026-10-20', signal()))
    await assert.rejects(source.saveKakeiboWeek('2026-13-01', { surprise: '', worthwhile: '', nextWeek: '' }))
    await assert.rejects(source.classifyExpense(0, 'needs'))
    await assert.rejects(source.setCategoryEnvelope(-1, null))
    assert.deepEqual(urls, [])
  })

  it('maps refused fields to the form and reads the server again after a suggestion changes', async () => {
    let categoryReads = 0
    const source = createHttpSource(async (input, init) => {
      const url = String(input)
      if (url.startsWith('/api/kakeibo/weeks/')) return json({ error: { code: 'invalid_field', message: 'The request could not be validated.', field: 'worthwhile_note' } }, 422)
      if (url === '/api/categories') { categoryReads += 1; return json([{ id: 4, name: 'Food', type: 'expense', default_kakeibo_envelope: null }]) }
      if (url === '/api/accounts') return json([])
      if (url.startsWith('/api/categories/')) return json({ id: 4, name: 'Food', type: 'expense', default_kakeibo_envelope: 'wants' })
      if (init?.method === undefined || init.method === 'GET') return json([])
      return json({})
    })
    const err = await reject(source.saveKakeiboWeek('2026-10-19', { surprise: '', worthwhile: 'x', nextWeek: '' }))
    assert.equal(err.field, 'worthwhile')
    assert.equal(describeWriteError(err, 'save-reflection').field, 'worthwhile')
    await source.loadActivity({ month: '2026-10', accountId: null, limit: 5 }, signal())
    await source.loadActivity({ month: '2026-10', accountId: null, limit: 5 }, signal())
    assert.equal(categoryReads, 1) // cached between Activity reads
    await source.setCategoryEnvelope(4, 'wants')
    await source.loadActivity({ month: '2026-10', accountId: null, limit: 5 }, signal())
    assert.equal(categoryReads, 2) // the change is read again
  })

  it('reflection failures keep what was written', () => {
    assert.match(describeWriteError(new TypeError('offline'), 'save-reflection').message, /What you wrote is still here\./)
    assert.match(describeWriteError(new ApiError(404, 'not_found', 'Resource not found.'), 'save-reflection').message, /can't be saved on this server yet/)
  })
})

describe('mock: weekly check-ins', () => {
  it('totals a Monday-to-Sunday week from expenses only, ignoring the month edge', async () => {
    const source = createMockSource()
    const week = await source.loadKakeiboWeek('2026-10-19', signal())
    assert.equal(week.weekEnd, '2026-10-25')
    assert.equal(week.totalExpenses, 435_800) // supermarket, pharmacy, movie night, lunch
    assert.equal(week.spending.needs, 284_650)
    assert.equal(week.unclassifiedExpenses, 102_500)
    assert.equal(week.review?.nextWeek, 'Pack lunch on Tuesday and Thursday.')
    await source.saveEntry({ kind: 'expense', amount: '100', accountId: 1, cardId: null, destinationAccountId: null, categoryId: 6, date: '2026-11-01', note: '', envelope: 'needs' })
    const crossing = await source.loadKakeiboWeek('2026-10-26', signal())
    assert.equal(crossing.weekEnd, '2026-11-01')
    assert.equal(crossing.spending.needs, 10_000) // a November Sunday still belongs to this week
    const before = await source.loadKakeiboWeek('2026-10-19', signal())
    await source.saveEntry({ kind: 'payment', amount: '500', accountId: 2, cardId: 4, destinationAccountId: null, categoryId: null, date: '2026-10-22', note: '' })
    await source.saveEntry({ kind: 'transfer', amount: '300', accountId: 2, cardId: null, destinationAccountId: 3, categoryId: null, date: '2026-10-22', note: '' })
    const after = await source.loadKakeiboWeek('2026-10-19', signal())
    assert.deepEqual(after.spending, before.spending)
    assert.equal(after.totalExpenses, before.totalExpenses)
  })

  it('saves, reloads, and replaces all three notes (a cleared note is cleared)', async () => {
    const source = createMockSource()
    await source.saveKakeiboWeek('2026-10-12', { surprise: 'Transport added up.', worthwhile: 'Books.', nextWeek: 'Walk more.' })
    assert.deepEqual((await source.loadKakeiboWeek('2026-10-12', signal())).review && { ...(await source.loadKakeiboWeek('2026-10-12', signal())).review, updatedAt: 'x' }, { surprise: 'Transport added up.', worthwhile: 'Books.', nextWeek: 'Walk more.', updatedAt: 'x' })
    await source.saveKakeiboWeek('2026-10-12', { surprise: 'Updated.', worthwhile: '', nextWeek: 'Walk more.' })
    const review = (await source.loadKakeiboWeek('2026-10-12', signal())).review!
    assert.equal(review.surprise, 'Updated.')
    assert.equal(review.worthwhile, '')
    assert.equal(review.nextWeek, 'Walk more.')
  })

  it('refuses a week that does not start on a Monday, and keeps notes on a failed save', async () => {
    const source = createMockSource({ failNextWrite: true })
    assert.equal((await reject(source.loadKakeiboWeek('2026-10-20', signal()))).status, 422)
    await assert.rejects(source.saveKakeiboWeek('2026-10-19', { surprise: 'lost?', worthwhile: '', nextWeek: '' }))
    assert.equal((await source.loadKakeiboWeek('2026-10-19', signal())).review?.surprise, 'Small food buys added up faster than I thought.')
  })
})

describe('mock: month-end reflection and its snapshot', () => {
  it('starts with no review, then stores the server-side snapshot of the month', async () => {
    const source = createMockSource()
    const before = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(before.review, null)
    assert.equal(before.actualsChangedSinceReview, false)
    await source.saveKakeiboReview('2026-10', { ...answers, savedDeclared: '4000' })
    const after = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(after.review?.savedDeclared, 400_000)
    assert.equal(after.review?.available, 'Enough.')
    assert.equal(after.review?.savings, null)
    assert.deepEqual(after.review?.snapshot, { actualIncome: before.actualIncome, totalExpenses: before.totalExpenses, unclassified: before.unclassifiedExpenses, envelopes: { needs: 1_995_190, wants: 386_400, culture: 180_000, unexpected: 48_650 } })
    assert.equal(after.actualsChangedSinceReview, false)
    assert.deepEqual(after.plan, before.plan) // the plan is untouched
  })

  it('keeps the original snapshot when the ledger changes, and flags it; only a new save updates it', async () => {
    const source = createMockSource()
    await source.saveKakeiboReview('2026-10', answers)
    const saved = (await source.loadKakeiboMonth('2026-10', signal())).review!.snapshot
    await source.saveEntry({ kind: 'expense', amount: '50', accountId: 1, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-25', note: '', envelope: 'wants' })
    let month = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(month.actualsChangedSinceReview, true)
    assert.deepEqual(month.review?.snapshot, saved) // never rewritten by an ordinary edit or a refresh
    await source.loadKakeiboMonth('2026-10', signal()) // reading again saves nothing
    await source.saveKakeiboReview('2026-10', answers)
    month = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(month.actualsChangedSinceReview, false)
    assert.equal(month.review?.snapshot?.envelopes.wants, saved!.envelopes.wants + 5_000)
  })

  it('a review on a month with no plan stores ₱0.00 plan amounts, like the API, and reads as a placeholder', async () => {
    const source = createMockSource()
    await source.saveKakeiboReview('2026-09', answers)
    const month = await source.loadKakeiboMonth('2026-09', signal())
    assert.equal(month.plan?.plannedIncome, 0)
    assert.equal(month.availableToAllocate, 0)
    assert.equal(planIsPlaceholder(month), true)
    assert.equal(planIsPlaceholder(await source.loadKakeiboMonth('2026-10', signal())), false)
  })

  it('refuses invalid savings with a 422 on that field', async () => {
    const err = await reject(createMockSource().saveKakeiboReview('2026-10', { ...answers, savedDeclared: '1.234' }))
    assert.equal(err.field, 'savedDeclared')
  })

  it('?demo=reviewed shows a snapshot that no longer matches', async () => {
    const month = await createMockSource({ scenario: 'reviewed' }).loadKakeiboMonth('2026-10', signal())
    assert.equal(month.actualsChangedSinceReview, true)
    assert.equal(month.review?.snapshot?.totalExpenses, 2_674_240)
    assert.equal(month.totalExpenses, 2_712_740)
  })
})

describe('mock: classifying past expenses', () => {
  const lunch = 17 // "Lunch with team", unclassified
  it('changes only the envelope, never the amount, account, date, note or balances', async () => {
    const source = createMockSource()
    const accounts = await source.loadAccounts(signal())
    const summary = await source.loadSummary('2026-10', signal())
    const before = (await source.loadActivity({ month: '2026-10', accountId: null, limit: 50 }, signal())).items.find((i) => i.id === lunch && i.kind === 'expense')!
    await source.classifyExpense(lunch, 'wants')
    const after = (await source.loadActivity({ month: '2026-10', accountId: null, limit: 50 }, signal())).items.find((i) => i.id === lunch && i.kind === 'expense')!
    assert.deepEqual({ ...after.entry, envelope: undefined }, { ...before.entry, envelope: undefined })
    assert.equal(after.entry.envelope, 'wants')
    assert.deepEqual(await source.loadAccounts(signal()), accounts)
    assert.deepEqual(await source.loadSummary('2026-10', signal()), summary)
    const month = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(month.unclassifiedExpenses, 102_500 - 38_500)
    assert.equal(month.envelopes.wants.spent, 386_400 + 38_500)
    await source.classifyExpense(lunch, null) // clearing
    assert.equal((await source.loadKakeiboMonth('2026-10', signal())).unclassifiedExpenses, 102_500)
  })

  it('refuses income and unknown records', async () => {
    const source = createMockSource()
    assert.equal((await reject(source.classifyExpense(11, 'needs'))).status, 422) // October salary
    assert.equal((await reject(source.classifyExpense(999, 'needs'))).status, 404)
  })

  it('a batch can partly fail: each request stands alone and the others stay saved', async () => {
    const source = createMockSource({ failClassifyEvery: 2 })
    const results: boolean[] = []
    for (const id of [14, 17, 5]) results.push(await source.classifyExpense(id, 'wants').then(() => true, () => false))
    assert.deepEqual(results, [true, false, true])
    const month = await source.loadKakeiboMonth('2026-10', signal())
    assert.equal(month.unclassifiedExpenses, 38_500) // the movie night moved; lunch (the failure) did not
  })

  it('a short list says more may exist', async () => {
    const page = await createMockSource({ scenario: 'many' }).loadActivity({ month: '2026-10', accountId: null, limit: 10 }, signal())
    assert.equal(page.hasMore, true)
  })
})

describe('mock: category suggestions', () => {
  it('sets, changes and clears an expense default without touching saved expenses', async () => {
    const source = createMockSource()
    const before = await source.loadKakeiboMonth('2026-10', signal())
    await source.setCategoryEnvelope(4, 'wants') // Food
    assert.equal((await source.loadCategories(signal())).find((c) => c.id === 4)?.defaultEnvelope, 'wants')
    await source.setCategoryEnvelope(4, 'needs')
    await source.setCategoryEnvelope(6, null) // Groceries: no suggestion
    const categories = await source.loadCategories(signal())
    assert.equal(categories.find((c) => c.id === 4)?.defaultEnvelope, 'needs')
    assert.equal(categories.find((c) => c.id === 6)?.defaultEnvelope, null)
    assert.deepEqual((await source.loadKakeiboMonth('2026-10', signal())).envelopes, before.envelopes) // history unchanged
  })
  it('refuses a suggestion on an income category and an unknown one', async () => {
    const source = createMockSource()
    assert.equal((await reject(source.setCategoryEnvelope(1, 'needs'))).status, 422)
    await source.setCategoryEnvelope(1, null) // clearing is harmless, like the API
    assert.equal((await reject(source.setCategoryEnvelope(999, 'needs'))).status, 404)
  })
})
