/*
 * Tests for the DataSource seam (Milestone 4.8, S1): the mock answers in the shapes the API will use,
 * applies writes, and fails the way the real one will (ApiError with a status and a code).
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError, FAILED_DELETE, FAILED_SAVE, GONE_ON_EDIT, isNotFound } from '../src/dataSource.ts'
import { entryValues } from '../src/lib/ledger.ts'
import { categoriesForTransaction } from '../src/lib/entryForm.ts'
import { suggestedEnvelope } from '../src/lib/kakeibo.ts'
import { buildSnapshot, expenseToIncomePercent, mockAnalytics } from '../src/lib/finance.ts'
import { saveMessage } from '../src/lib/entryText.ts'
import { getMockData } from '../src/mockData.ts'
import { createMockSource, nowIso } from '../src/mockSource.ts'
import type { AccountValues } from '../src/lib/accountForm.ts'
import type { EntryValues } from '../src/types.ts'

const signal = new AbortController().signal
const OCT = '2026-10'
const expense: EntryValues = { kind: 'expense', amount: '385', accountId: 3, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-25', note: '' }
const pay: EntryValues = { kind: 'payment', amount: '5,000', accountId: 2, cardId: 4, destinationAccountId: null, categoryId: null, date: '2026-10-25', note: '' }
const wallet: AccountValues = { type: 'cash', name: 'Wallet', balance: '100', limit: '', owed: '' }

describe('mock analytics', () => {
  it('aggregates only matching transaction rows with exact centavo arithmetic and stable categories', () => {
    const report = mockAnalytics(getMockData(), { startDate: '2026-10-01', endDate: '2026-10-25', accountId: null })
    assert.deepEqual(report.totals, { income: 3_650_000, expenses: 2_712_740, netCashFlow: 937_260 })
    assert.equal(report.months[0].month, '2026-10')
    assert.equal(report.months[0].expenses, 2_712_740)
    assert.equal(report.kakeiboTotals.needs, 1_995_190)
    assert.equal(report.kakeiboTotals.unclassified, 102_500)
    assert.equal(report.kakeibo[0].planStatus, 'saved')
    const filtered = mockAnalytics(getMockData(), { startDate: '2026-10-01', endDate: '2026-10-25', accountId: 2 })
    assert.equal(filtered.totals.income, 3_650_000)
    assert.equal(filtered.kakeiboTotals.needs, 999_900)
  })
})

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
    for (const a of snapshot.accounts) assert.deepEqual(Object.keys(a).sort(), ['cardProductId', 'id', 'name', 'type']) // like the API since ADR-020
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
    // usageCount is the one derived extra (ADR-026); the forms' snapshot is otherwise identical.
    const categories = (await source.loadCategories(signal)).map(({ usageCount: _usage, ...rest }) => rest)
    const fromSource = { ...(await source.loadAccounts(signal)), categories }
    assert.deepEqual(fromSource, buildSnapshot(getMockData()))
  })
  it('categories report their all-time usage count, including archived ones', async () => {
    const source = createMockSource()
    const data = getMockData()
    const expected = (id: number) => data.transactions.filter((t) => t.categoryId === id).length
    const counted = await source.loadCategories(signal)
    for (const category of counted) assert.equal(category.usageCount, expected(category.id), category.name)
    assert.ok(counted.some((c) => (c.usageCount ?? 0) > 0))
    const used = counted.find((c) => (c.usageCount ?? 0) > 0)!
    await source.setCategoryArchived(used.id, true)
    assert.equal((await source.loadCategories(signal)).find((c) => c.id === used.id)?.usageCount, used.usageCount)
  })
})

describe('category appearance writes', () => {
  it('color persists, is kept when omitted, can be cleared, and never changes amounts or envelopes', async () => {
    const source = createMockSource()
    const before = await source.loadSummary(OCT, signal)
    await source.createCategory({ name: 'Pets', type: 'expense', defaultEnvelope: 'wants', iconKey: 'paw-print', colorKey: 'purple' })
    const created = (await source.loadCategories(signal)).find((c) => c.name === 'Pets')!
    assert.equal(created.colorKey, 'purple')
    assert.equal(created.usageCount, 0)
    await source.updateCategory(created.id, { name: 'Pets & vet', defaultEnvelope: 'wants' }) // appearance omitted: unchanged
    let again = (await source.loadCategories(signal)).find((c) => c.id === created.id)!
    assert.deepEqual([again.iconKey, again.colorKey], ['paw-print', 'purple'])
    await source.updateCategory(created.id, { name: 'Pets & vet', defaultEnvelope: 'wants', colorKey: null })
    again = (await source.loadCategories(signal)).find((c) => c.id === created.id)!
    assert.equal(again.colorKey, null)
    assert.deepEqual(await source.loadSummary(OCT, signal), before)
  })
})

describe('writes', () => {
  it('custom expense categories suggest new envelopes while preserving historical classification, labels and totals through archive/restore', async () => {
    const source = createMockSource()
    const before = await source.loadSummary(OCT, signal)
    await source.createCategory({ name: 'Learning', type: 'expense', defaultEnvelope: 'culture', iconKey: 'book-open' })
    let categories = await source.loadCategories(signal)
    const category = categories.find((item) => item.name === 'Learning')!
    assert.equal(category.iconKey, 'book-open')
    const oldExpense: EntryValues = { ...expense, amount: '10', categoryId: category.id, note: 'Custom category expense', envelope: 'wants' }
    await source.saveEntry(oldExpense)
    const afterExpense = await source.loadSummary(OCT, signal)
    assert.equal(afterExpense.monthExpenses, before.monthExpenses + 1_000)
    const afterExpenseKakeibo = await source.loadKakeiboMonth(OCT, signal)
    const wantsAfterOld = afterExpenseKakeibo.envelopes.wants.spent
    const needsBeforeFuture = afterExpenseKakeibo.envelopes.needs.spent

    await source.updateCategory(category.id, { name: 'Learning renamed', defaultEnvelope: 'needs' })
    assert.equal((await source.loadCategories(signal)).find((item) => item.id === category.id)?.iconKey, 'book-open')
    await source.updateCategory(category.id, { name: 'Reading', defaultEnvelope: 'needs', iconKey: null })
    const renamed = await source.loadCategories(signal)
    assert.equal(renamed.find((item) => item.id === category.id)?.name, 'Reading')
    assert.equal(renamed.find((item) => item.id === category.id)?.defaultEnvelope, 'needs')
    assert.equal(renamed.find((item) => item.id === category.id)?.iconKey, null)
    assert.equal((await source.loadKakeiboMonth(OCT, signal)).envelopes.wants.spent, wantsAfterOld)

    const suggestion = suggestedEnvelope(renamed, category.id)
    assert.equal(suggestion, 'needs')
    await source.saveEntry({ ...oldExpense, note: 'Future expense', envelope: suggestion })
    const bothExpenses = await source.loadKakeiboMonth(OCT, signal)
    assert.equal(bothExpenses.envelopes.wants.spent, wantsAfterOld)
    assert.equal(bothExpenses.envelopes.needs.spent, needsBeforeFuture + 1_000)

    await source.setCategoryArchived(category.id, true)
    categories = await source.loadCategories(signal)
    assert.equal(categories.find((item) => item.id === category.id)?.archived, true)
    assert.equal(categoriesForTransaction('expense', { ...(await source.loadAccounts(signal)), categories }, null).some((item) => item.id === category.id), false)
    assert.equal(categoriesForTransaction('expense', { ...(await source.loadAccounts(signal)), categories }, category.id).some((item) => item.id === category.id), true)
    const activity = await source.loadActivity({ month: OCT, accountId: null, limit: 100 }, signal)
    assert.equal(activity.items.find((item) => item.title === 'Custom category expense')?.categoryName, 'Reading')
    assert.equal((await source.loadSummary(OCT, signal)).monthExpenses, afterExpense.monthExpenses + 1_000)
    const totalsBeforeLifecycleChange = await source.loadSummary(OCT, signal)
    await source.setCategoryArchived(category.id, false)
    assert.equal((await source.loadSummary(OCT, signal)).monthExpenses, totalsBeforeLifecycleChange.monthExpenses)
    assert.equal((await source.loadCategories(signal)).find((item) => item.id === category.id)?.archived, false)
  })

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
    const id = await source.addAccount(wallet)
    const snapshot = await source.loadAccounts(signal)
    assert.equal(snapshot.accounts.at(-1)!.name, 'Wallet')
    assert.equal(id, snapshot.accounts.at(-1)!.id) // the new ID, so the chosen card design can be saved for it
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

describe('demo behaviours for failing and slow data (Milestone 4.9)', () => {
  const settled = async (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof ApiError ? `${e.status}` : (e as Error).name))

  it('readFailures "once" fails each distinct request the first time it is answered, and then answers it', async () => {
    const source = createMockSource({ readFailures: 'once' })
    assert.equal(await settled(source.loadSummary(OCT, signal)), '500')
    assert.equal(await settled(source.loadSummary(OCT, signal)), 'ok') // Retry works
    assert.equal(await settled(source.loadSummary('2026-09', signal)), '500') // another request fails once too
    assert.equal(await settled(source.loadAccounts(signal)), '500')
    assert.equal(await settled(source.loadAccounts(signal)), 'ok')
  })
  it('an abandoned request is not counted (React\'s development double-mount, a quick change of month)', async () => {
    const source = createMockSource({ readFailures: 'once' })
    const abandoned = new AbortController()
    const first = source.loadSummary(OCT, abandoned.signal)
    abandoned.abort()
    assert.equal(await settled(first), 'AbortError')
    assert.equal(await settled(source.loadSummary(OCT, signal)), '500') // this is still the first answered request
  })
  it('readFailures "second" lets the first answer through and fails the second of each kind once', async () => {
    const source = createMockSource({ readFailures: 'second' })
    assert.equal(await settled(source.loadSummary(OCT, signal)), 'ok')
    assert.equal(await settled(source.loadSummary('2026-09', signal)), '500')
    assert.equal(await settled(source.loadSummary('2026-08', signal)), 'ok')
    assert.equal(await settled(source.loadActivity({ month: OCT, accountId: null, limit: 5 }, signal)), 'ok') // its own count
  })
  it('"always" fails every read; offline also fails every write', async () => {
    const source = createMockSource({ readFailures: 'always', writeFailures: 'always' })
    for (let i = 0; i < 3; i++) assert.equal(await settled(source.loadAccounts(signal)), '500')
    for (let i = 0; i < 2; i++) assert.equal(await settled(source.saveEntry(expense)), '500')
    assert.equal(await settled(source.deleteEntry({ table: 'transaction', id: 17 })), '500')
    assert.equal(await settled(source.addAccount(wallet)), '500')
  })
  it('invalidNextWrite refuses the first save or new account with a 422 and the field, then accepts', async () => {
    const source = createMockSource({ invalidNextWrite: true })
    const err = await rejection(source.saveEntry(expense))
    assert.deepEqual([err.status, err.code, err.field], [422, 'invalid_field', 'amount'])
    await source.saveEntry(expense) // the next one is accepted
    const acc = createMockSource({ invalidNextWrite: true })
    assert.equal((await rejection(acc.addAccount(wallet))).field, 'name')
    await acc.addAccount(wallet)
  })
  it('readFailureKinds makes only the named kinds of read fail (?failing=summary)', async () => {
    const source = createMockSource({ readFailures: 'always', readFailureKinds: ['summary'] })
    assert.equal(await settled(source.loadSummary(OCT, signal)), '500')
    assert.equal(await settled(source.loadAccounts(signal)), 'ok')
    assert.equal(await settled(source.loadCategories(signal)), 'ok')
    assert.equal(await settled(source.loadActivity({ month: OCT, accountId: null, limit: 5 }, signal)), 'ok')
  })
  it('delays hold an answer back (slow demo)', async () => {
    const source = createMockSource({ readDelayMs: 40, writeDelayMs: 40 })
    let t = Date.now()
    await source.loadSummary(OCT, signal)
    assert.ok(Date.now() - t >= 35, 'read was held back')
    t = Date.now()
    await source.saveEntry(expense)
    assert.ok(Date.now() - t >= 35, 'write was held back')
  })
})


describe('current account amount corrections', () => {
  it('loads current figures and saves the exact target without changing activity or monthly totals', async () => {
    const source = createMockSource()
    const before = await source.loadAccounts(signal)
    const activity = await source.loadActivity({ month: OCT, accountId: null, limit: 1000 }, signal)
    const totals = await source.loadSummary(OCT, signal)
    const bank = before.liquid[0]
    const values = await source.loadAccountForEdit(bank.account.id, signal)
    const { amountText } = await import('../src/lib/money.ts')
    assert.equal(values.balance, amountText(bank.balance))
    await source.updateAccount(bank.account.id, { ...values, balance: '-0.05' })
    assert.equal((await source.loadAccounts(signal)).liquid.find((a) => a.account.id === bank.account.id)?.balance, -5)
    assert.deepEqual(await source.loadActivity({ month: OCT, accountId: null, limit: 1000 }, signal), activity)
    const edited = await source.loadAccountForEdit(bank.account.id, signal)
    await source.updateAccount(bank.account.id, { ...edited, name: 'Renamed bank' })
    assert.equal((await source.loadAccounts(signal)).liquid.find((a) => a.account.id === bank.account.id)?.balance, -5)
    const after = await source.loadSummary(OCT, signal)
    assert.equal(after.monthIncome, totals.monthIncome)
    assert.equal(after.monthExpenses, totals.monthExpenses)
  })
  it('sets card debt or credit exactly after purchases and payments', async () => {
    const source = createMockSource()
    const before = await source.loadAccounts(signal)
    const card = before.cards[0]
    const values = await source.loadAccountForEdit(card.account.id, signal)
    const { amountText } = await import('../src/lib/money.ts')
    assert.equal(values.owed, amountText(card.signedDebt))
    for (const target of ['0.00', '-0.05', '123.45']) {
      await source.updateAccount(card.account.id, { ...values, owed: target })
      assert.equal((await source.loadAccountForEdit(card.account.id, signal)).owed, target)
    }
  })
})

describe('mock card choices (ADR-020)', () => {
  const signal = new AbortController().signal
  const bank = { type: 'bank' as const, name: 'Card Bank', balance: '100.00', limit: '', owed: '' }
  it('stores a card on create, keeps it when an update leaves it out, and clears it with null', async () => {
    const source = createMockSource()
    const id = (await source.addAccount(bank, 'maribank-debit'))!
    const card = async () => (await source.loadAccounts(signal)).accounts.find((a) => a.id === id)!.cardProductId
    assert.equal(await card(), 'maribank-debit')
    await source.updateAccount(id, await source.loadAccountForEdit(id, signal))
    assert.equal(await card(), 'maribank-debit')
    await source.updateAccount(id, await source.loadAccountForEdit(id, signal), 'gotyme-visa-debit')
    assert.equal(await card(), 'gotyme-visa-debit')
    await source.updateAccount(id, await source.loadAccountForEdit(id, signal), null)
    assert.equal(await card(), null)
    assert.equal((await source.loadAccounts(signal)).liquid.find((l) => l.account.id === id)!.balance, 10_000)
  })
  it('refuses a card on a cash account and a malformed ID, like the API', async () => {
    const source = createMockSource()
    await assert.rejects(source.addAccount({ ...bank, type: 'cash', name: 'Pocket' }, 'maribank-debit'), (e: unknown) => e instanceof ApiError && e.status === 422 && e.field === 'card_product_id')
    await assert.rejects(source.addAccount(bank, 'Mari Bank'), (e: unknown) => e instanceof ApiError && e.status === 422)
  })
})

describe('mock analytics: monthly fields and day-level sections follow the server rules', () => {
  const FOOD = 4, BILLS = 7, SALARY = 1
  const base = getMockData()
  const withRows = (rows: { date: string; categoryId: number; amount: number; envelope?: 'needs' | 'wants' | 'culture' | 'unexpected' | null; accountId?: number }[], today = '2026-12-31') => ({
    ...base, today, payments: [], transfers: [],
    transactions: rows.map((row, i) => ({ id: i + 1, accountId: row.accountId ?? 2, categoryId: row.categoryId, amount: row.amount, date: row.date, note: null, createdAt: `2026-01-01T00:00:0${i % 10}Z`, envelope: row.envelope ?? null })),
  })
  const range = (data: ReturnType<typeof withRows>, startDate: string, endDate: string, extra: object = {}) => mockAnalytics(data, { startDate, endDate, accountId: null, detail: true, ...extra })

  it('reports surplus, the expense-to-income ratio (half up, none without income) and whether a month is complete', () => {
    const data = withRows([
      { date: '2020-09-05', categoryId: SALARY, amount: 20_000 }, { date: '2020-09-06', categoryId: FOOD, amount: 5_000 },
      { date: '2020-10-04', categoryId: FOOD, amount: 3_000 },
    ], '2020-10-15')
    const [september, october] = mockAnalytics(data, { startDate: '2020-09-01', endDate: '2020-10-15', accountId: null }).months
    assert.deepEqual(september, { month: '2020-09', income: 20_000, expenses: 5_000, surplus: 15_000, expenseToIncomePercent: '25.0', complete: true })
    assert.equal(october!.surplus, -3_000) // a deficit is just negative
    assert.equal(october!.expenseToIncomePercent, null)
    assert.equal(october!.complete, false) // month to date
    assert.equal(expenseToIncomePercent(100, 800), '12.5')
    assert.equal(expenseToIncomePercent(100, 300), '33.3')
    assert.equal(expenseToIncomePercent(1, 8), '12.5')
    assert.equal(expenseToIncomePercent(5, 8000), '0.1') // 0.0625 percent rounds half up to one decimal
    assert.equal(expenseToIncomePercent(1, 2000), '0.1') // exactly 0.05: half up, not to even
  })

  it('has one row per date including zero-spend days, and income is never spending', () => {
    const data = withRows([{ date: '2020-10-02', categoryId: FOOD, amount: 1_000 }, { date: '2020-10-02', categoryId: FOOD, amount: 550 }, { date: '2020-10-03', categoryId: SALARY, amount: 99_900 }])
    const report = range(data, '2020-10-01', '2020-10-05')
    assert.deepEqual(report.daily!.map((d) => d.date), ['2020-10-01', '2020-10-02', '2020-10-03', '2020-10-04', '2020-10-05'])
    assert.deepEqual(report.daily!.map((d) => d.expenses), [0, 1_550, 0, 0, 0])
    assert.equal(report.daily!.reduce((sum, d) => sum + d.expenses, 0), report.totals.expenses)
  })

  it('splits each day by envelope and keeps unclassified spending inside the day total', () => {
    const data = withRows([
      { date: '2020-10-02', categoryId: BILLS, amount: 1_000, envelope: 'needs' }, { date: '2020-10-02', categoryId: BILLS, amount: 400, envelope: 'wants' },
      { date: '2020-10-02', categoryId: BILLS, amount: 300, envelope: 'culture' }, { date: '2020-10-02', categoryId: BILLS, amount: 200, envelope: 'unexpected' },
      { date: '2020-10-02', categoryId: BILLS, amount: 125 },
    ])
    const day = range(data, '2020-10-02', '2020-10-02').daily![0]!
    assert.deepEqual([day.needs, day.wants, day.culture, day.unexpected, day.unclassified, day.expenses], [1_000, 400, 300, 200, 125, 2_025])
  })

  it('averages each weekday by how many times it occurs, zero days included, rounding half up', () => {
    const data = withRows([{ date: '2020-10-01', categoryId: FOOD, amount: 1 }, { date: '2020-10-02', categoryId: FOOD, amount: 900 }])
    const { weekdays, daily } = range(data, '2020-10-01', '2020-10-08') // starts on a Thursday
    const thursday = weekdays![3]!, friday = weekdays![4]!, monday = weekdays![0]!
    assert.deepEqual(thursday, { weekday: 4, total: 1, occurrences: 2, average: 1 }) // 0.5 centavo rounds up to 1, not to 0
    assert.deepEqual(friday, { weekday: 5, total: 900, occurrences: 1, average: 900 })
    assert.deepEqual([monday.occurrences, monday.average], [1, 0])
    assert.equal(weekdays!.reduce((sum, d) => sum + d.occurrences, 0), daily!.length)
    assert.deepEqual(range(withRows([]), '2020-10-01', '2020-10-31').weekdays!.map((d) => d.occurrences), [4, 4, 4, 5, 5, 5, 4]) // a month starting Thursday
  })

  it('computes insights from expenses only and breaks a tie by the earlier date', () => {
    const data = withRows([
      { date: '2020-10-03', categoryId: FOOD, amount: 2_000 }, { date: '2020-10-01', categoryId: BILLS, amount: 2_000 },
      { date: '2020-10-04', categoryId: FOOD, amount: 1_000 }, { date: '2020-10-02', categoryId: SALARY, amount: 50_000 },
    ])
    assert.deepEqual(range(data, '2020-10-01', '2020-10-05').insights, { days: 5, averageDailySpending: 1_000, expenseTransactions: 3, highestDay: { date: '2020-10-01', expenses: 2_000 }, zeroSpendDays: 2 })
    assert.deepEqual(range(withRows([]), '2020-10-01', '2020-10-03').insights, { days: 3, averageDailySpending: 0, expenseTransactions: 0, highestDay: null, zeroSpendDays: 3 })
  })

  it('never counts a card payment or a transfer as spending, and counts a card purchase once', () => {
    const data = { ...withRows([{ date: '2020-10-02', categoryId: FOOD, amount: 4_000, accountId: 4 }]),
      payments: [{ id: 1, sourceAccountId: 2, cardAccountId: 4, amount: 4_000, date: '2020-10-03', note: null, createdAt: '2020-10-03T00:00:00Z' }],
      transfers: [{ id: 1, sourceAccountId: 2, destinationAccountId: 1, amount: 2_500, date: '2020-10-03', note: null, createdAt: '2020-10-03T00:00:00Z' }] } as unknown as ReturnType<typeof withRows>
    const report = range(data, '2020-10-01', '2020-10-05')
    assert.equal(report.totals.expenses, 4_000)
    assert.deepEqual(report.daily!.map((d) => d.expenses), [0, 4_000, 0, 0, 0])
    assert.equal(report.insights!.expenseTransactions, 1)
    assert.equal(range(data, '2020-10-01', '2020-10-05', { accountId: 1 }).insights!.expenseTransactions, 0) // an account with no activity
  })

  it('rejects a range that ends in the future or before it starts, like the API', () => {
    const data = withRows([], '2020-10-10')
    assert.throws(() => range(data, '2020-10-01', '2020-10-11'), /future/)
    assert.throws(() => range(data, '2020-10-05', '2020-10-04'), /on or after/)
    assert.doesNotThrow(() => range(data, '2020-10-10', '2020-10-10'))
  })

  it('keeps monthly figures independent of the analysis range that was asked for in between', () => {
    const data = withRows([{ date: '2020-10-02', categoryId: SALARY, amount: 10_000 }, { date: '2020-10-20', categoryId: FOOD, amount: 4_000 }])
    const reporting = () => mockAnalytics(data, { startDate: '2020-05-01', endDate: '2020-10-31', accountId: null }).months
    const before = reporting()
    range(data, '2020-10-18', '2020-10-22')
    assert.deepEqual(reporting(), before)
    assert.deepEqual([before.at(-1)!.income, before.at(-1)!.expenses], [10_000, 4_000])
  })
})
