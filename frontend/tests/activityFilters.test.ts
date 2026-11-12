/*
 * Tests for Activity search and filters: the pure rules, the HTTP requests they produce (which reads are skipped,
 * which parameters are sent) and the mock's parity with the API (filters applied before the limit).
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createHttpSource } from '../src/httpSource.ts'
import {
  KIND_OPTIONS, NO_ACTIVITY_FILTERS, activitySources, categoryChoices, countLabel, entryMatchesFilters, hasActivityFilters, normalizeSearch, searchMatches, withCategory, withKind,
  type ActivityFilters,
} from '../src/lib/activityFilters.ts'
import { activityPage, buildActivity, buildSnapshot } from '../src/lib/finance.ts'
import { getMockData } from '../src/mockData.ts'
import type { Category, EntryValues } from '../src/types.ts'

const OCT = '2026-10'
const categories: Category[] = [
  { id: 1, name: 'Salary', type: 'income' },
  { id: 4, name: 'Food', type: 'expense' },
  { id: 7, name: 'Bills', type: 'expense' },
  { id: 20, name: 'Old Gym', type: 'expense', archived: true, usageCount: 3 },
  { id: 21, name: 'Never Used', type: 'expense', archived: true, usageCount: 0 },
  { id: 22, name: 'Old Pay', type: 'income', archived: true },
]
const f = (patch: Partial<ActivityFilters>): ActivityFilters => ({ ...NO_ACTIVITY_FILTERS, ...patch })

describe('search text and which reads a filter needs', () => {
  it('normalizes spaces and length', () => {
    assert.equal(normalizeSearch('  lunch   with  team '), 'lunch with team')
    assert.equal(normalizeSearch('x'.repeat(200)).length, 80)
  })
  it('matches case-insensitively over any of the texts shown, and an empty search matches everything', () => {
    assert.equal(searchMatches(['Lunch with team', null, 'Main Savings'], ' LUNCH '), true)
    assert.equal(searchMatches([null, undefined, 'x'], 'main'), false)
    assert.equal(searchMatches([], ''), true)
    assert.equal(searchMatches(['100% sure'], '%'), true) // typed characters are plain text
  })
  it('reads only what can match: a type or a category rules whole reads out', () => {
    assert.deepEqual(activitySources(f({})), { transactions: true, payments: true, transfers: true, transactionKind: null })
    assert.deepEqual(activitySources(f({ kind: 'expense' })), { transactions: true, payments: false, transfers: false, transactionKind: 'expense' })
    assert.deepEqual(activitySources(f({ kind: 'income' })), { transactions: true, payments: false, transfers: false, transactionKind: 'income' })
    assert.deepEqual(activitySources(f({ kind: 'payment' })), { transactions: false, payments: true, transfers: false, transactionKind: null })
    assert.deepEqual(activitySources(f({ kind: 'transfer' })), { transactions: false, payments: false, transfers: true, transactionKind: null })
    assert.deepEqual(activitySources(f({ categoryId: 4 })), { transactions: true, payments: false, transfers: false, transactionKind: null }) // payments have no category
  })
  it('knows when something narrows the list', () => {
    assert.equal(hasActivityFilters(NO_ACTIVITY_FILTERS), false)
    assert.equal(hasActivityFilters(f({ search: '   ' })), false)
    assert.equal(hasActivityFilters(f({ search: 'a' })), true)
    assert.equal(hasActivityFilters(NO_ACTIVITY_FILTERS, 3), true)
    assert.equal(KIND_OPTIONS.map((o) => o.value).join(), 'all,expense,income,payment,transfer')
  })
})

describe('invalid combinations are prevented, not answered with an empty list', () => {
  it('drops a category that does not fit the chosen type, keeps one that does', () => {
    assert.equal(withKind(f({ categoryId: 4 }), 'income', categories).categoryId, null)
    assert.equal(withKind(f({ categoryId: 4 }), 'expense', categories).categoryId, 4)
    assert.equal(withKind(f({ categoryId: 4 }), 'all', categories).categoryId, 4)
    assert.equal(withKind(f({ categoryId: 4 }), 'payment', categories).categoryId, null)
    assert.equal(withKind(f({ categoryId: 4 }), 'transfer', categories).categoryId, null)
  })
  it('refuses a category for payments and transfers or the wrong type, and clears with null', () => {
    assert.deepEqual(withCategory(f({ kind: 'payment' }), 4, categories), f({ kind: 'payment' }))
    assert.deepEqual(withCategory(f({ kind: 'income' }), 4, categories), f({ kind: 'income' }))
    assert.equal(withCategory(f({ kind: 'expense' }), 4, categories).categoryId, 4)
    assert.equal(withCategory(f({ kind: 'all' }), 1, categories).categoryId, 1)
    assert.equal(withCategory(f({ categoryId: 4 }), null, categories).categoryId, null)
    assert.deepEqual(withCategory(f({}), 999, categories), f({})) // unknown id: ignored
  })
  it('offers archived categories only when they have history, labelled, and none for payments or transfers', () => {
    const labels = (kind: Parameters<typeof categoryChoices>[1]) => categoryChoices(categories, kind).map((c) => c.label)
    assert.deepEqual(labels('expense'), ['Bills', 'Food', 'Old Gym (archived)'])
    assert.deepEqual(labels('income'), ['Old Pay (archived)', 'Salary']) // usage unknown: still offered
    assert.ok(!labels('all').includes('Never Used (archived)'))
    assert.deepEqual(labels('payment'), [])
    assert.deepEqual(labels('transfer'), [])
  })
})

describe('the count line is honest about paging', () => {
  it('says "Latest" or "First … matching" when there is more, and the exact count when there is not', () => {
    assert.equal(countLabel(18, false, false), '18 entries')
    assert.equal(countLabel(1, false, false), '1 entry')
    assert.equal(countLabel(3, false, true), '3 matching entries')
    assert.equal(countLabel(1, false, true), '1 matching entry')
    assert.equal(countLabel(50, true, false), 'Latest 50 entries')
    assert.equal(countLabel(50, true, true), 'First 50 matching entries')
  })
})

describe('mock parity: filters apply to the whole month before the limit', () => {
  const data = getMockData()
  const titles = (patch: Partial<ActivityFilters>, accountId: number | null = null) => buildActivity(data, OCT, undefined, accountId, f(patch)).map((i) => i.title)
  it('finds by note, by category name and by account name', () => {
    assert.ok(titles({ search: 'lunch' }).length >= 1)
    assert.ok(titles({ search: 'groceries' }).length >= 1) // a category name
    const byAccount = buildActivity(data, OCT, undefined, null, f({ search: 'gcash' }))
    assert.ok(byAccount.length >= 1 && byAccount.every((i) => /gcash/i.test(`${i.title} ${i.categoryName ?? ''} ${i.accountName} ${i.destinationAccountName ?? ''} ${i.cardName ?? ''}`)))
    assert.equal(titles({ search: 'zzz-no-match' }).length, 0)
  })
  it('narrows by type: income, expense, card payments and transfers are separate', () => {
    const kinds = (kind: ActivityFilters['kind']) => new Set(buildActivity(data, OCT, undefined, null, f({ kind })).map((i) => i.kind))
    assert.deepEqual([...kinds('income')], ['income'])
    assert.deepEqual([...kinds('expense')], ['expense'])
    assert.deepEqual([...kinds('payment')], ['payment'])
    assert.ok(kinds('all').has('payment'))
  })
  it('narrows by category and finds nothing for payments with a category', () => {
    const food = buildActivity(data, OCT, undefined, null, f({ categoryId: 4 }))
    assert.ok(food.length > 0 && food.every((i) => i.categoryName === 'Food'))
    assert.equal(buildActivity(data, OCT, undefined, null, f({ categoryId: 4, kind: 'payment' })).length, 0)
    assert.equal(buildActivity(data, OCT, undefined, null, f({ categoryId: 4, kind: 'income' })).length, 0)
  })
  it('combines with the account filter and with each other', () => {
    const gcashFood = buildActivity(data, OCT, undefined, 3, f({ categoryId: 4 }))
    assert.ok(gcashFood.every((i) => i.accountName === 'GCash' && i.categoryName === 'Food'))
  })
  it('applies filters BEFORE the page limit, so an older match is never dropped and hasMore is about the matches', () => {
    const all = buildActivity(data, OCT, undefined, null, f({ kind: 'expense' }))
    assert.ok(all.length > 3)
    const page = activityPage(data, OCT, null, 3, f({ kind: 'expense' }))
    assert.deepEqual(page.items.map((i) => i.key), all.slice(0, 3).map((i) => i.key)) // the newest three EXPENSES, not three rows that happen to be expenses
    assert.equal(page.hasMore, true)
    assert.equal(activityPage(data, OCT, null, all.length, f({ kind: 'expense' })).hasMore, false)
    assert.deepEqual(activityPage(data, OCT, null, 50, f({ search: 'zzz-no-match' })), { items: [], hasMore: false })
  })
  it('never looks outside the selected month', () => {
    assert.equal(buildActivity(data, '2026-09', undefined, null, f({ search: 'lunch' })).length, 0)
  })
  it('is exactly the old behavior when no filters are given', () => {
    assert.deepEqual(buildActivity(data, OCT), buildActivity(data, OCT, undefined, null, NO_ACTIVITY_FILTERS))
  })
})

describe('after a save: would the entry show under the current filters?', () => {
  const snapshot = buildSnapshot(getMockData())
  const entry = (patch: Partial<EntryValues>): EntryValues => ({ kind: 'expense', amount: '5', accountId: 3, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-20', note: 'Coffee run', ...patch })
  it('judges kind, category and search the way the API would', () => {
    assert.equal(entryMatchesFilters(entry({}), NO_ACTIVITY_FILTERS, snapshot), true)
    assert.equal(entryMatchesFilters(entry({}), f({ kind: 'income' }), snapshot), false)
    assert.equal(entryMatchesFilters(entry({}), f({ categoryId: 7 }), snapshot), false)
    assert.equal(entryMatchesFilters(entry({}), f({ categoryId: 4 }), snapshot), true)
    assert.equal(entryMatchesFilters(entry({}), f({ search: 'coffee' }), snapshot), true)
    assert.equal(entryMatchesFilters(entry({}), f({ search: 'gcash' }), snapshot), true) // its account's name
    assert.equal(entryMatchesFilters(entry({}), f({ search: 'food' }), snapshot), true) // its category's name
    assert.equal(entryMatchesFilters(entry({}), f({ search: 'tea' }), snapshot), false)
    assert.equal(entryMatchesFilters(entry({ kind: 'payment', categoryId: null, cardId: 4, note: '' }), f({ search: 'blue card' }), snapshot), true)
    assert.equal(entryMatchesFilters(entry({ kind: 'payment', categoryId: null, cardId: 4, note: '' }), f({ categoryId: 4 }), snapshot), false)
  })
})

describe('HTTP requests carry the filters and skip reads that cannot match', () => {
  const accounts = [{ id: 1, name: 'Main Bank', type: 'bank', balance: '1000.00' }, { id: 2, name: 'Blue Card', type: 'credit_card', credit_limit: '5000.00', outstanding_signed_debt: '300.00', available_credit: '4700.00', owed: '300.00', credit: '0.00' }]
  const cats = [{ id: 4, name: 'Food', type: 'expense' }, { id: 1, name: 'Salary', type: 'income' }]
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const harness = () => {
    const urls: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.startsWith('/api/transactions?') || url.startsWith('/api/credit-card-payments?') || url.startsWith('/api/account-transfers?')) return json([])
      if (url === '/api/accounts') return json(accounts)
      if (url === '/api/categories') return json(cats)
      throw new Error(`Unexpected request ${url}`)
    }
    const activityUrls = () => urls.filter((u) => u.startsWith('/api/') && u.includes('?')).map((u) => new URL(u, 'http://localhost'))
    return { source: createHttpSource(fetcher), activityUrls }
  }
  const signal = new AbortController().signal

  it('sends nothing extra when there are no filters', async () => {
    const { source, activityUrls } = harness()
    await source.loadActivity({ month: OCT, accountId: null, limit: 5 }, signal)
    const urls = activityUrls()
    assert.equal(urls.length, 3)
    for (const url of urls) for (const key of ['q', 'category_id', 'kind']) assert.equal(url.searchParams.has(key), false)
  })
  it('sends the search to all three reads, trimmed, and an expense type and category only to transactions', async () => {
    const { source, activityUrls } = harness()
    await source.loadActivity({ month: OCT, accountId: 1, limit: 5, filters: f({ search: '  lunch   team ', kind: 'expense', categoryId: 4 }) }, signal)
    const urls = activityUrls()
    assert.equal(urls.length, 1) // payments and transfers cannot match a category, so they are not read at all
    assert.equal(urls[0]!.pathname, '/api/transactions')
    assert.equal(urls[0]!.searchParams.get('q'), 'lunch team')
    assert.equal(urls[0]!.searchParams.get('kind'), 'expense')
    assert.equal(urls[0]!.searchParams.get('category_id'), '4')
    assert.equal(urls[0]!.searchParams.get('account_id'), '1')
    assert.equal(urls[0]!.searchParams.get('limit'), '6') // still one spare row for "is there more"
  })
  it('reads only payments for the card payments type and only transfers for the transfers type', async () => {
    const payments = harness()
    await payments.source.loadActivity({ month: OCT, accountId: null, limit: 5, filters: f({ kind: 'payment', search: 'bill' }) }, signal)
    assert.deepEqual(payments.activityUrls().map((u) => u.pathname), ['/api/credit-card-payments'])
    assert.equal(payments.activityUrls()[0]!.searchParams.get('q'), 'bill')
    const transfers = harness()
    await transfers.source.loadActivity({ month: OCT, accountId: null, limit: 5, filters: f({ kind: 'transfer' }) }, signal)
    assert.deepEqual(transfers.activityUrls().map((u) => u.pathname), ['/api/account-transfers'])
  })
  it('reads all three for "all types" with a search, and a blank search sends nothing', async () => {
    const searching = harness()
    await searching.source.loadActivity({ month: OCT, accountId: null, limit: 5, filters: f({ search: 'x' }) }, signal)
    assert.equal(searching.activityUrls().length, 3)
    assert.ok(searching.activityUrls().every((u) => u.searchParams.get('q') === 'x'))
    const blank = harness()
    await blank.source.loadActivity({ month: OCT, accountId: null, limit: 5, filters: f({ search: '    ' }) }, signal)
    assert.ok(blank.activityUrls().every((u) => !u.searchParams.has('q')))
  })
})
