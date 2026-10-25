/*
 * Tests for the DataSource seam (Milestone 4.8, S1): the mock answers in the shapes the API will use,
 * applies writes, and fails the way the real one will (ApiError with a status and a code).
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError, FAILED_DELETE, FAILED_SAVE, GONE_ON_EDIT, isNotFound } from '../src/dataSource.ts'
import { entryValues } from '../src/lib/ledger.ts'
import { buildSnapshot } from '../src/lib/finance.ts'
import { saveMessage } from '../src/lib/entryText.ts'
import { getMockData } from '../src/mockData.ts'
import { createMockSource, nowIso } from '../src/mockSource.ts'
import type { AccountValues } from '../src/lib/accountForm.ts'
import type { EntryValues } from '../src/types.ts'

const signal = new AbortController().signal
const OCT = '2026-10'
const expense: EntryValues = { kind: 'expense', amount: '385', accountId: 3, cardId: null, categoryId: 4, date: '2026-10-25', note: '' }
const pay: EntryValues = { kind: 'payment', amount: '5,000', accountId: 2, cardId: 4, categoryId: null, date: '2026-10-25', note: '' }
const wallet: AccountValues = { type: 'cash', name: 'Wallet', balance: '100', limit: '', owed: '' }

const rejection = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p
  } catch (err) {
    assert.ok(err instanceof ApiError, 'expected an ApiError')
    return err
  }
  assert.fail('expected a rejection')
}

describe('reads', () => {
  it('reports today and answers on a later turn, like a network reply', async () => {
    const source = createMockSource()
    assert.equal(source.today, '2026-10-25')
    let resolved = false
    const promise = source.loadAccounts(signal).then((x) => ((resolved = true), x))
    assert.equal(resolved, false) // not synchronous
    await promise
    assert.equal(resolved, true)
  })
  it('accounts come with their figures worked out and without opening values', async () => {
    const snapshot = await createMockSource().loadAccounts(signal)
    assert.deepEqual(snapshot.accounts.map((a) => a.name), ['Cash on hand', 'Main Savings', 'GCash', 'Blue Card', 'Everyday Card'])
    assert.deepEqual(snapshot.liquid.map((l) => l.balance), [235_000, 4_872_550, 312_075])
    const blue = snapshot.cards.find((c) => c.account.name === 'Blue Card')!
    assert.deepEqual([blue.signedDebt, blue.owed, blue.credit, blue.availableCredit], [1_425_000, 1_425_000, 0, 3_575_000])
    for (const a of snapshot.accounts) assert.deepEqual(Object.keys(a).sort(), ['id', 'name', 'type'])
    assert.equal(JSON.stringify(snapshot).includes('opening'), false)
  })
  it('summary and categories match the engine', async () => {
    const source = createMockSource()
    const summary = await source.loadSummary(OCT, signal)
    assert.equal(summary.monthExpenses, 2_712_740)
    assert.equal(summary.netPosition, 3_314_625)
    assert.equal((await source.loadCategories(signal)).length, 9)
  })
  it('activity pages: limit, hasMore, the account filter before the limit, and the entry carried for Edit', async () => {
    const source = createMockSource({ scenario: 'many' })
    const first = await source.loadActivity({ month: OCT, accountId: null, limit: 50 }, signal)
    assert.equal(first.items.length, 50)
    assert.equal(first.hasMore, true)
    const all = await source.loadActivity({ month: OCT, accountId: null, limit: 100 }, signal)
    assert.equal(all.items.length, 58)
    assert.equal(all.hasMore, false)
    assert.deepEqual(all.items.slice(0, 50), first.items) // more never reorders what was shown
    const gcash = await source.loadActivity({ month: OCT, accountId: 3, limit: 5 }, signal)
    assert.equal(gcash.items.length, 5)
    assert.ok(gcash.items.every((i) => i.accountName === 'GCash'))
    // an item carries its stored entry in form shape, equal to looking it up in the ledger
    const data = getMockData('many')
    const lunch = all.items.find((i) => i.title === 'Lunch with team')!
    assert.deepEqual(lunch.entry, entryValues(data, { table: 'transaction', id: lunch.id }))
    const payment = all.items.find((i) => i.kind === 'payment')!
    assert.deepEqual(payment.entry, entryValues(data, { table: 'payment', id: payment.id }))
  })
  it('the snapshot the forms use equals the one built from the ledger', async () => {
    const source = createMockSource()
    const fromSource = { ...(await source.loadAccounts(signal)), categories: await source.loadCategories(signal) }
    assert.deepEqual(fromSource, buildSnapshot(getMockData()))
  })
})

describe('writes', () => {
  it('a saved expense shows in the next reads; the confirmation reads the fresh figures', async () => {
    const source = createMockSource()
    await source.saveEntry({ ...expense, accountId: 4 })
    const accounts = await source.loadAccounts(signal)
    assert.equal(accounts.cards.find((c) => c.account.id === 4)!.owed, 1_425_000 + 38_500)
    assert.equal((await source.loadSummary(OCT, signal)).monthExpenses, 2_712_740 + 38_500)
    assert.equal(
      saveMessage({ ...expense, accountId: 4 }, { ...accounts, categories: await source.loadCategories(signal) }),
      'Expense saved: −₱385.00 from Blue Card. Blue Card now owes ₱14,635.00.',
    )
  })
  it('a card payment changes neither the month\'s expenses nor net position', async () => {
    const source = createMockSource()
    const before = await source.loadSummary(OCT, signal)
    await source.saveEntry(pay)
    const after = await source.loadSummary(OCT, signal)
    assert.equal(after.monthExpenses, before.monthExpenses)
    assert.equal(after.netPosition, before.netPosition)
    assert.equal(after.liquidBalance, before.liquidBalance - 500_000)
  })
  it('edit replaces an entry, delete removes it', async () => {
    const source = createMockSource()
    const lunch = (await source.loadActivity({ month: OCT, accountId: null, limit: 50 }, signal)).items.find((i) => i.title === 'Lunch with team')!
    await source.saveEntry({ ...lunch.entry, amount: '485' }, { table: 'transaction', id: lunch.id })
    assert.equal((await source.loadSummary(OCT, signal)).monthExpenses, 2_712_740 + 10_000)
    await source.deleteEntry({ table: 'transaction', id: lunch.id })
    const after = await source.loadActivity({ month: OCT, accountId: null, limit: 50 }, signal)
    assert.equal(after.items.some((i) => i.title === 'Lunch with team'), false)
  })
  it('a new account appears in the snapshot', async () => {
    const source = createMockSource()
    await source.addAccount(wallet)
    const snapshot = await source.loadAccounts(signal)
    assert.equal(snapshot.accounts.at(-1)!.name, 'Wallet')
    assert.equal(snapshot.liquid.find((l) => l.account.name === 'Wallet')!.balance, 10_000)
  })
})

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

describe('timestamps (contract B3: ISO 8601 with a UTC offset)', () => {
  it('every stored timestamp, seeded or new, carries its offset', () => {
    for (const scenario of [null, 'many', 'huge', 'overpaid', 'negative', 'over-limit', 'paid-off'] as const) {
      const d = getMockData(scenario)
      for (const row of [...d.transactions, ...d.payments]) assert.match(row.createdAt, ISO_WITH_OFFSET, `${scenario} #${row.id}`)
    }
    assert.match(nowIso(), ISO_WITH_OFFSET)
    assert.ok(nowIso().endsWith('Z'))
  })
  it('an entry added now sorts newest among same-day entries', async () => {
    const source = createMockSource()
    await source.saveEntry({ ...expense, date: '2026-10-24', note: 'Added just now' })
    const page = await source.loadActivity({ month: OCT, accountId: null, limit: 5 }, signal)
    assert.equal(page.items[0].title, 'Added just now') // above 'Lunch with team' (08:00Z) on the same date
    assert.equal(page.items[1].title, 'Lunch with team')
  })
})

describe('errors', () => {
  it('editing or deleting an entry that is gone is a 404 not_found', async () => {
    const source = createMockSource()
    const gone = { table: 'transaction' as const, id: 999 }
    const edit = await rejection(source.saveEntry(expense, gone))
    assert.deepEqual([edit.status, edit.code, edit.message, isNotFound(edit)], [404, 'not_found', GONE_ON_EDIT, true])
    const del = await rejection(source.deleteEntry(gone))
    assert.deepEqual([del.status, del.code, isNotFound(del)], [404, 'not_found', true])
  })
  it('a duplicate account name is a 409 with the field', async () => {
    const err = await rejection(createMockSource().addAccount({ ...wallet, name: '  gcash ' }))
    assert.deepEqual([err.status, err.code, err.field, err.message], [409, 'duplicate_account_name', 'name', 'You already have an account with that name.'])
  })
  it('failNextWrite fails the first write once, changes nothing, then everything works', async () => {
    for (const [name, run, message] of [
      ['save', (s: ReturnType<typeof createMockSource>) => s.saveEntry(expense), FAILED_SAVE],
      ['delete', (s: ReturnType<typeof createMockSource>) => s.deleteEntry({ table: 'transaction', id: 17 }), FAILED_DELETE],
      ['account', (s: ReturnType<typeof createMockSource>) => s.addAccount(wallet), FAILED_SAVE],
    ] as const) {
      const source = createMockSource({ failNextWrite: true })
      const err = await rejection(run(source))
      assert.deepEqual([err.status, err.code, err.message], [500, 'internal_error', message], name)
      assert.equal((await source.loadSummary(OCT, signal)).monthExpenses, 2_712_740, `${name}: nothing changed`)
      assert.equal((await source.loadAccounts(signal)).accounts.length, 5)
      await run(source) // the second attempt goes through
    }
  })
  it('ApiError is an Error with status, code and field', () => {
    const e = new ApiError(422, 'invalid_field', 'Enter an amount.', 'amount')
    assert.ok(e instanceof Error)
    assert.deepEqual([e.name, e.status, e.code, e.field, e.message], ['ApiError', 422, 'invalid_field', 'amount', 'Enter an amount.'])
    assert.equal(isNotFound(new Error('x')), false)
  })
})
