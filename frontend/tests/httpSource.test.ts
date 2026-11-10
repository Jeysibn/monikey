import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError } from '../src/dataSource.ts'
import { createHttpSource } from '../src/httpSource.ts'
import type { EntryValues } from '../src/types.ts'

const accounts = [
  { id: 1, name: 'Main Bank', type: 'bank', balance: '1000.00' },
  { id: 2, name: 'Blue Card', type: 'credit_card', credit_limit: '5000.00', outstanding_signed_debt: '300.00', available_credit: '4700.00', owed: '300.00', credit: '0.00' },
]
const categories = [{ id: 4, name: 'Food', type: 'expense', icon_key: 'utensils' }]
const tx = (id: number, created_at: string) => ({ id, account_id: 2, category_id: 4, amount: '10.00', transaction_date: '2026-10-25', note: `T${id}`, created_at })
const payment = (id: number, created_at: string) => ({ id, source_account_id: 1, card_account_id: 2, amount: '5.00', payment_date: '2026-10-25', note: `P${id}`, created_at })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const signal = () => new AbortController().signal

test('loadActivity requests both filtered lists with one spare row and merges exact timestamp ties', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url.startsWith('/api/transactions?')) return json([tx(1, '2026-10-25T09:00:00.000900Z'), tx(2, '2026-10-25T09:00:00.000500Z')])
    if (url.startsWith('/api/credit-card-payments?')) return json([payment(1, '2026-10-25T09:00:00.000500Z')])
    if (url.startsWith('/api/account-transfers?')) return json([])
    if (url === '/api/accounts') return json(accounts)
    if (url === '/api/categories') return json(categories)
    throw new Error(`Unexpected request ${url}`)
  }
  const source = createHttpSource(fetcher)
  const result = await source.loadActivity({ month: '2026-10', accountId: 2, limit: 2 }, signal())
  assert.deepEqual(result.items.map((item) => item.key), ['t-1', 't-2'])
  assert.equal(result.hasMore, true)
  assert.equal(result.items[0].createdAt, '2026-10-25T09:00:00.000900Z')
  assert.equal(result.items[0].categoryIconKey, 'utensils')
  assert.equal(requests.length, 5)
  const transactionUrl = new URL(requests.find((item) => item.url.startsWith('/api/transactions?'))!.url, 'http://localhost')
  const paymentUrl = new URL(requests.find((item) => item.url.startsWith('/api/credit-card-payments?'))!.url, 'http://localhost')
  assert.equal(transactionUrl.searchParams.get('month'), '2026-10')
  assert.equal(transactionUrl.searchParams.get('account_id'), '2')
  assert.equal(transactionUrl.searchParams.get('limit'), '3')
  assert.equal(paymentUrl.searchParams.get('account_id'), '2')
  assert.equal(paymentUrl.searchParams.get('limit'), '3')
})

test('loadAnalytics sends bounded date and account filters and parses exact totals', async () => {
  const requests: string[] = []
  const source = createHttpSource(async (input) => {
    const url = String(input)
    requests.push(url)
    return json({
      start_date: '2026-10-01', end_date: '2026-10-31', account_id: 2,
      totals: { income: '0.00', expenses: '20.50', net_cash_flow: '-20.50' }, previous_totals: null,
      months: [{ month: '2026-10', income: '0.00', expenses: '20.50' }], categories: [],
      kakeibo_totals: { needs: '0.00', wants: '0.00', culture: '0.00', unexpected: '0.00', unclassified: '20.50' },
      kakeibo: [{ month: '2026-10', plan_status: 'not_saved', limits: null, actuals: { needs: '0.00', wants: '0.00', culture: '0.00', unexpected: '0.00' }, unclassified: '20.50' }],
    })
  })
  const report = await source.loadAnalytics({ startDate: '2026-10-01', endDate: '2026-10-31', accountId: 2 }, signal())
  assert.equal(report.totals.expenses, 2050)
  const url = new URL(requests[0], 'http://localhost')
  assert.equal(url.pathname, '/api/analytics')
  assert.equal(url.searchParams.get('start_date'), '2026-10-01')
  assert.equal(url.searchParams.get('end_date'), '2026-10-31')
  assert.equal(url.searchParams.get('account_id'), '2')
})

test('loadActivity leaves empty months empty and caps the wire limit at 1001', async () => {
  const urls: string[] = []
  const source = createHttpSource(async (input) => {
    const url = String(input)
    urls.push(url)
    if (url.startsWith('/api/transactions?') || url.startsWith('/api/credit-card-payments?')) return json([])
    if (url.startsWith('/api/account-transfers?')) return json([])
    if (url === '/api/accounts') return json([])
    if (url === '/api/categories') return json([])
    throw new Error(`Unexpected request ${url}`)
  })
  const empty = await source.loadActivity({ month: '2026-10', accountId: null, limit: 50 }, signal())
  assert.deepEqual(empty, { items: [], hasMore: false })
  await source.loadActivity({ month: '2026-10', accountId: null, limit: 2000 }, signal())
  const lists = urls.filter((url) => url.startsWith('/api/transactions?') || url.startsWith('/api/credit-card-payments?') || url.startsWith('/api/account-transfers?'))
  assert.equal(lists.length, 6)
  assert.ok(lists.slice(3).every((url) => new URL(url, 'http://localhost').searchParams.get('limit') === '1001'))
})

test('summary and account reads use same-origin paths and decimal-string mapping', async () => {
  const source = createHttpSource(async (input) => {
    const url = String(input)
    if (url === '/api/accounts') return json(accounts)
    if (url === '/api/summary?month=2026-10') return json({ month: '2026-10', liquid_balance: '1000.00', outstanding_debt: '300.00', card_credit: '0.00', net_position: '700.00', month_income: '0.00', month_expenses: '10.00' })
    throw new Error(`Unexpected request ${url}`)
  })
  const [snapshot, summary] = await Promise.all([source.loadAccounts(signal()), source.loadSummary('2026-10', signal())])
  assert.equal(snapshot.liquid[0].balance, 100_000)
  assert.equal(snapshot.cards[0].owed, 30_000)
  assert.equal(summary.netPosition, 70_000)
})

test('writes send the agreed request bodies, routes, and HTTP verbs', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const source = createHttpSource(async (input, init) => {
    requests.push({ url: String(input), init })
    return new Response(null, { status: 204 })
  })
  const expense: EntryValues = { kind: 'expense', amount: '350.00', accountId: 1, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-24', note: '' }
  await source.saveEntry(expense)
  await source.saveEntry({ ...expense, note: 'Lunch' }, { table: 'transaction', id: 12 })
  await source.saveEntry({ ...expense, kind: 'payment', cardId: 2, categoryId: null }, { table: 'payment', id: 8 })
  await source.deleteEntry({ table: 'payment', id: 8 })
  await source.addAccount({ type: 'credit_card', name: 'New Card', balance: '', limit: '2000.00', owed: '0.00' })
  assert.deepEqual(requests.map(({ url, init }) => [url, init?.method]), [
    ['/api/transactions', 'POST'],
    ['/api/transactions/12', 'PUT'],
    ['/api/credit-card-payments/8', 'PUT'],
    ['/api/credit-card-payments/8', 'DELETE'],
    ['/api/accounts', 'POST'],
  ])
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { account_id: 1, category_id: 4, amount: '350.00', transaction_date: '2026-10-24', note: null })
  assert.deepEqual(JSON.parse(String(requests[4].init?.body)), { name: 'New Card', type: 'credit_card', opening_balance: '0.00', opening_debt: '0.00', credit_limit: '2000.00' })
})

test('category management writes use the PR 1 contract and invalidate cached categories', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init })
    if (init?.method === 'GET') return json([{ id: 7, name: 'Books', type: 'expense', default_kakeibo_envelope: 'culture', is_archived: false }])
    return new Response(null, { status: 204 })
  }
  const source = createHttpSource(fetcher)
  assert.deepEqual(await source.loadCategories(signal()), [{ id: 7, name: 'Books', type: 'expense', defaultEnvelope: 'culture', archived: false }])
  await source.createCategory({ name: 'Courses', type: 'expense', defaultEnvelope: 'culture', iconKey: 'shopping-basket' })
  await source.updateCategory(7, { name: 'Reading', defaultEnvelope: 'needs', iconKey: null })
  await source.setCategoryArchived(7, true)
  await source.deleteCategory(8)
  assert.deepEqual(requests.map(({ url, init }) => [url, init?.method]), [
    ['/api/categories', 'GET'], ['/api/categories', 'POST'], ['/api/categories/7', 'PATCH'],
    ['/api/categories/7/archive', 'PATCH'], ['/api/categories/8', 'DELETE'],
  ])
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { name: 'Courses', type: 'expense', default_kakeibo_envelope: 'culture', icon_key: 'shopping-basket' })
  assert.deepEqual(JSON.parse(String(requests[2].init?.body)), { name: 'Reading', default_kakeibo_envelope: 'needs', icon_key: null })
  assert.deepEqual(JSON.parse(String(requests[3].init?.body)), { is_archived: true })
  assert.deepEqual(await source.loadCategories(signal()), [{ id: 7, name: 'Books', type: 'expense', defaultEnvelope: 'culture', archived: false }])
  assert.equal(requests.filter(({ url, init }) => url === '/api/categories' && init?.method === 'GET').length, 2)
})

test('adding an account resolves with the ID the server created, or null without one', async () => {
  const created = createHttpSource(async () => new Response(JSON.stringify({ id: 42, name: 'Wallet', type: 'cash' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
  assert.equal(await created.addAccount({ type: 'cash', name: 'Wallet', balance: '0.00', limit: '', owed: '' }), 42)
  const empty = createHttpSource(async () => new Response(null, { status: 204 }))
  assert.equal(await empty.addAccount({ type: 'cash', name: 'Wallet', balance: '0.00', limit: '', owed: '' }), null)
})

test('ADR-020: account writes carry the card only when given', async () => {
  const bodies: unknown[] = []
  const source = createHttpSource(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return json({ id: 9, name: 'Main', type: 'bank', balance: '10.00', card_product_id: 'maribank-debit' }, 201)
  })
  const bank = { type: 'bank' as const, name: 'Main', balance: '10.00', limit: '', owed: '' }
  await source.addAccount(bank, 'maribank-debit')
  await source.updateAccount(9, bank)
  await source.updateAccount(9, bank, null)
  assert.deepEqual(bodies.map((body) => (body as Record<string, unknown>).card_product_id), ['maribank-debit', undefined, null])
  assert.equal('card_product_id' in (bodies[1] as object), false)
})

test('write errors keep the API code/status and map wire fields to form fields', async () => {
  const source = createHttpSource(async () => json({ error: { code: 'duplicate_account_name', message: 'You already have an account with that name.', field: 'name' } }, 409))
  await assert.rejects(source.addAccount({ type: 'cash', name: 'Cash', balance: '0.00', limit: '', owed: '' }), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 409)
    assert.equal(error.code, 'duplicate_account_name')
    assert.equal(error.field, 'name')
    return true
  })
})

test('HTTP source dates default to the required Manila calendar date', () => {
  assert.match(createHttpSource(async () => json(null)).today, /^\d{4}-\d{2}-\d{2}$/)
})


test('account edit reads and writes current amounts using the account endpoint', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const source = createHttpSource(async (input, init) => {
    requests.push({ url: String(input), init })
    return init?.method === 'GET'
      ? json({ id: 1, name: 'Bank', type: 'bank', current_balance: '800.00', current_debt: '0.00', credit_limit: null })
      : new Response(null, { status: 204 })
  })
  const values = await source.loadAccountForEdit(1, signal())
  assert.equal(values.balance, '800.00')
  await source.updateAccount(1, { ...values, balance: '1000.00' })
  assert.equal(requests[1].url, '/api/accounts/1')
  assert.equal(requests[1].init?.method, 'PUT')
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { name: 'Bank', type: 'bank', current_balance: '1000.00', current_debt: '0.00', credit_limit: null })
})
