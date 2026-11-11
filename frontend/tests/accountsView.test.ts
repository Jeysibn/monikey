/*
 * Tests for the Accounts screen's search, filter, sort, saved preferences and the per-account recent activity read.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadRecentAccountActivity } from '../src/lib/accountActivity.ts'
import {
  ACCOUNTS_VIEW_STORAGE_KEY, DEFAULT_ACCOUNTS_PREFS, accountEntries, arrangeAccounts, countText, matchesSearch, matchesTypeFilter,
  parseAccountsPrefs, readAccountsPrefs, writeAccountsPrefs, type AccountEntry,
} from '../src/lib/accountsView.ts'
import { buildSnapshot } from '../src/lib/finance.ts'
import { getMockData } from '../src/mockData.ts'
import { createMockSource } from '../src/mockSource.ts'

const entries: AccountEntry[] = [
  { id: 1, name: 'Cash on hand', type: 'cash', amount: 235_000 },
  { id: 2, name: 'Main Savings', type: 'bank', amount: 4_872_550 },
  { id: 3, name: 'gcash', type: 'ewallet', amount: 631_115 },
  { id: 4, name: 'Blue Card', type: 'credit_card', amount: 2_100_000 },
  { id: 5, name: 'Everyday Card', type: 'credit_card', amount: -50_000 }, // overpaid: card credit
]
const arrange = (view: Partial<Parameters<typeof arrangeAccounts>[1]> = {}) => arrangeAccounts(entries, { query: '', type: 'all', sort: 'default', ...view }).map((e) => e.id)

describe('search and type filter', () => {
  it('searches names case-insensitively, ignoring extra spaces, and an empty search shows everything', () => {
    assert.equal(matchesSearch('Main Savings', '  main   SAV '), true)
    assert.equal(matchesSearch('Main Savings', 'cash'), false)
    assert.deepEqual(arrange({ query: 'CARD' }), [4, 5])
    assert.deepEqual(arrange({ query: '' }), [1, 2, 3, 4, 5])
    assert.deepEqual(arrange({ query: 'zzz' }), [])
  })
  it('filters by type group', () => {
    assert.deepEqual(arrange({ type: 'cash-bank' }), [1, 2])
    assert.deepEqual(arrange({ type: 'ewallet' }), [3])
    assert.deepEqual(arrange({ type: 'credit' }), [4, 5])
    assert.equal(matchesTypeFilter('bank', 'credit'), false)
  })
  it('combines search and type', () => {
    assert.deepEqual(arrange({ type: 'credit', query: 'blue' }), [4])
    assert.deepEqual(arrange({ type: 'cash-bank', query: 'card' }), [])
  })
})

describe('sorting never treats a debt as a balance', () => {
  it('keeps the snapshot order by default and sorts names A to Z ignoring case', () => {
    assert.deepEqual(arrange({ sort: 'default' }), [1, 2, 3, 4, 5])
    assert.deepEqual(arrange({ sort: 'name' }), [4, 1, 5, 3, 2]) // Blue, Cash, Everyday, gcash, Main
  })
  it('sorts balances high or low among accounts that hold money, with cards after them A to Z', () => {
    assert.deepEqual(arrange({ sort: 'balance-high' }), [2, 3, 1, 4, 5])
    assert.deepEqual(arrange({ sort: 'balance-low' }), [1, 3, 2, 4, 5])
  })
  it('sorts cards by what is owed (card credit last), with the other accounts after them A to Z', () => {
    assert.deepEqual(arrange({ sort: 'owed-high' }), [4, 5, 1, 3, 2])
  })
  it('breaks ties by name and never mutates the input', () => {
    const tied: AccountEntry[] = [{ id: 9, name: 'b', type: 'cash', amount: 100 }, { id: 8, name: 'A', type: 'bank', amount: 100 }]
    assert.deepEqual(arrangeAccounts(tied, { query: '', type: 'all', sort: 'balance-high' }).map((e) => e.id), [8, 9])
    assert.deepEqual(tied.map((e) => e.id), [9, 8])
  })
  it('works from a real snapshot and keeps every account exactly once', () => {
    const snapshot = buildSnapshot(getMockData())
    const all = accountEntries(snapshot)
    assert.equal(all.length, snapshot.accounts.length)
    for (const sort of ['default', 'name', 'balance-high', 'balance-low', 'owed-high'] as const) {
      assert.deepEqual(arrangeAccounts(all, { query: '', type: 'all', sort }).map((e) => e.id).sort(), all.map((e) => e.id).sort(), sort)
    }
  })
  it('describes the count', () => {
    assert.equal(countText(5, 5), '5 accounts')
    assert.equal(countText(1, 1), '1 account')
    assert.equal(countText(2, 5), '2 of 5 accounts')
  })
})

describe('saved display preferences', () => {
  const memory = () => { const store = new Map<string, string>(); return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } }
  it('round-trips the view, type and sort', () => {
    const storage = memory()
    assert.equal(writeAccountsPrefs({ version: 1, mode: 'list', type: 'credit', sort: 'owed-high' }, storage), true)
    assert.deepEqual(readAccountsPrefs(storage), { version: 1, mode: 'list', type: 'credit', sort: 'owed-high' })
    assert.ok(storage.store.has(ACCOUNTS_VIEW_STORAGE_KEY))
  })
  it('falls back to the defaults for missing, corrupt, unknown or injected values, field by field', () => {
    assert.deepEqual(parseAccountsPrefs(null), DEFAULT_ACCOUNTS_PREFS)
    for (const raw of ['', '{', '[]', '7', '"x"', '{"version":2,"mode":"list"}', '{"mode":"list"}']) assert.deepEqual(parseAccountsPrefs(raw), DEFAULT_ACCOUNTS_PREFS, raw)
    assert.deepEqual(parseAccountsPrefs('{"version":1,"mode":"grid","type":"<script>","sort":"balance-high"}'), { version: 1, mode: 'cards', type: 'all', sort: 'balance-high' })
    assert.deepEqual(parseAccountsPrefs('{"version":1,"mode":"list","extra":{"__proto__":1}}'), { version: 1, mode: 'list', type: 'all', sort: 'default' })
  })
  it('keeps working when storage is blocked or full', () => {
    const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    assert.deepEqual(readAccountsPrefs(blocked), DEFAULT_ACCOUNTS_PREFS)
    assert.equal(writeAccountsPrefs(DEFAULT_ACCOUNTS_PREFS, blocked), false)
    assert.deepEqual(readAccountsPrefs(null), DEFAULT_ACCOUNTS_PREFS)
    assert.equal(writeAccountsPrefs(DEFAULT_ACCOUNTS_PREFS, null), false)
  })
  it('stores only presentation choices, never a figure', () => {
    const storage = memory()
    writeAccountsPrefs({ version: 1, mode: 'cards', type: 'all', sort: 'name' }, storage)
    assert.deepEqual(Object.keys(JSON.parse(storage.store.get(ACCOUNTS_VIEW_STORAGE_KEY)!)).sort(), ['mode', 'sort', 'type', 'version'])
  })
})

describe('recent activity for one account (reuses the Activity read)', () => {
  const signal = new AbortController().signal
  it('returns the newest entries of the account only, at most five, newest first', async () => {
    const source = createMockSource()
    const items = await loadRecentAccountActivity(source, '2026-10-25', 3, signal)
    assert.ok(items.length > 0 && items.length <= 5)
    assert.ok(items.every((item) => item.accountName === 'GCash'))
    for (let i = 1; i < items.length; i += 1) assert.ok(items[i - 1]!.date >= items[i]!.date)
  })
  it('includes a card payment on either side and never another account\'s entries', async () => {
    const source = createMockSource()
    const card = await loadRecentAccountActivity(source, '2026-10-25', 4, signal)
    assert.ok(card.some((item) => item.kind === 'payment'))
    const savings = await loadRecentAccountActivity(source, '2026-10-25', 2, signal)
    assert.ok(savings.some((item) => item.kind === 'payment'), 'the paying account sees the payment too')
  })
  it('tops up from the previous month only when the current month has too few, and never invents rows', async () => {
    const calls: string[] = []
    const fake = {
      loadActivity: async (query: { month: string; accountId: number | null; limit: number }) => {
        calls.push(`${query.month}:${query.limit}`)
        const item = (n: number) => ({ key: `t-${query.month}-${n}`, kind: 'expense', id: n, date: `${query.month}-0${n}`, amount: n * 100, title: 'x', categoryName: 'c', accountName: 'a', accountType: 'cash', cardName: null })
        return { items: query.month === '2026-10' ? [item(2), item(1)] as never : [item(3)] as never, hasMore: false }
      },
    }
    const items = await loadRecentAccountActivity(fake, '2026-10-25', 1, signal)
    assert.deepEqual(calls, ['2026-10:5', '2026-09:3']) // the second read asks only for what is missing
    assert.equal(items.length, 3)
    const none = await loadRecentAccountActivity({ loadActivity: async () => ({ items: [], hasMore: false }) }, '2026-01-05', 1, signal)
    assert.deepEqual(none, []) // an account with no activity: empty, honestly
  })
  it('crosses a year end when looking at the previous month', async () => {
    const months: string[] = []
    await loadRecentAccountActivity({ loadActivity: async (q: { month: string }) => { months.push(q.month); return { items: [], hasMore: false } } } as never, '2026-01-05', 1, signal)
    assert.deepEqual(months, ['2026-01', '2025-12'])
  })
})
