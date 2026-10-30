import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError } from '../src/dataSource.ts'
import { createHttpSource } from '../src/httpSource.ts'
import type { EntryValues } from '../src/types.ts'

const accounts = [
  { id: 1, name: 'Main Bank', type: 'bank', balance: '1000.00' },
  { id: 2, name: 'Blue Card', type: 'credit_card', credit_limit: '5000.00', outstanding_signed_debt: '300.00', available_credit: '4700.00', owed: '300.00', credit: '0.00' },
]
const categories = [{ id: 4, name: 'Food', type: 'expense' }]
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
  assert.equal(requests.length, 5)
  const transactionUrl = new URL(requests.find((item) => item.url.startsWith('/api/transactions?'))!.url, 'http://localhost')
  const paymentUrl = new URL(requests.find((item) => item.url.startsWith('/api/credit-card-payments?'))!.url, 'http://localhost')
  assert.equal(transactionUrl.searchParams.get('month'), '2026-10')
  assert.equal(transactionUrl.searchParams.get('account_id'), '2')
  assert.equal(transactionUrl.searchParams.get('limit'), '3')
  assert.equal(paymentUrl.searchParams.get('account_id'), '2')
  assert.equal(paymentUrl.searchParams.get('limit'), '3')
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
