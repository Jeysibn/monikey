import { ApiError, type ActivityQuery, type DataSource } from './dataSource.ts'
import type { AccountValues } from './lib/accountForm.ts'
import { ACTIVITY_MAX_ROWS } from './lib/finance.ts'
import type { AccountInfo, ActivityItem, EntryTarget, EntryValues } from './types.ts'
import { compareTimestamps } from './lib/timestamp.ts'
import {
  fromWireAccounts,
  fromWireEditableAccount,
  fromWireCategories,
  fromWireField,
  fromWirePayment,
  fromWireTransfer,
  fromWireSummary,
  fromWireTransaction,
  toWireAccountInput,
  toWireEntryInput,
  type WireCategory,
  type WirePayment,
  type WireTransaction,
  type WireTransfer,
} from './wire.ts'

type Fetcher = typeof fetch
export const READ_TIMEOUT_MS = 30_000

const failure = (status: number): ApiError => new ApiError(status, 'internal_error', 'The server could not complete the request.')

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function apiError(status: number, body: unknown): ApiError {
  const root = object(body)
  const payload = object(root?.error)
  if (!payload || typeof payload.code !== 'string' || typeof payload.message !== 'string') return failure(status)
  return new ApiError(status, payload.code, payload.message, fromWireField(payload.field))
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown
  } catch {
    throw failure(response.status)
  }
}

async function getJson(url: string, signal: AbortSignal, fetcher: Fetcher): Promise<unknown> {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(signal.reason)
  if (signal.aborted) forwardAbort()
  else signal.addEventListener('abort', forwardAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('Read timed out.', 'TimeoutError')), READ_TIMEOUT_MS)
  try {
    const response = await fetcher(url, { method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' } })
    const body = await readJson(response)
    if (!response.ok) throw apiError(response.status, body)
    return body
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', forwardAbort)
  }
}

async function write(url: string, method: 'POST' | 'PUT' | 'DELETE', fetcher: Fetcher, body?: unknown): Promise<void> {
  const response = await fetcher(url, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (response.ok) return
  throw apiError(response.status, await readJson(response))
}

function manilaToday(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  if (!year || !month || !day) throw new Error('Could not read today in Asia/Manila.')
  return `${year}-${month}-${day}`
}

function urlWithQuery(path: string, query: URLSearchParams): string {
  return `${path}?${query.toString()}`
}

function mergeActivity(
  transactions: WireTransaction[],
  payments: WirePayment[],
  transfers: WireTransfer[],
  accounts: AccountInfo[],
  categories: WireCategory[],
  limit: number,
): { items: ActivityItem[]; hasMore: boolean } {
  const items: ActivityItem[] = [
    ...transactions.map((row) => fromWireTransaction(row, accounts, categories)),
    ...payments.map((row) => fromWirePayment(row, accounts)),
    ...transfers.map((row) => fromWireTransfer(row, accounts)),
  ]
  const rank = (item: ActivityItem) => item.kind === 'payment' || item.kind === 'transfer' ? 0 : 1
  items.sort((a, b) =>
    b.date.localeCompare(a.date) ||
    compareTimestamps(b.createdAt, a.createdAt) ||
    rank(b) - rank(a) ||
    b.id - a.id,
  )
  return { items: items.slice(0, limit), hasMore: items.length > limit }
}

/** Real same-origin API implementation of the frontend's existing DataSource boundary. */
export function createHttpSource(fetcher: Fetcher = globalThis.fetch): DataSource {
  const today = manilaToday()
  let accountsRead: Promise<ReturnType<typeof fromWireAccounts>> | null = null
  let categoriesRead: Promise<ReturnType<typeof fromWireCategories>> | null = null

  const readAccounts = (signal: AbortSignal) => {
    const request = getJson('/api/accounts', signal, fetcher).then(fromWireAccounts)
    accountsRead = request
    void request.catch(() => {
      if (accountsRead === request) accountsRead = null
    })
    return request
  }

  const readCategories = (signal: AbortSignal) => {
    const request = getJson('/api/categories', signal, fetcher).then(fromWireCategories)
    categoriesRead = request
    void request.catch(() => {
      if (categoriesRead === request) categoriesRead = null
    })
    return request
  }

  return {
    today,

    async loadAccounts(signal) {
      return readAccounts(signal)
    },

    async loadAccountForEdit(id, signal) {
      return fromWireEditableAccount(await getJson(`/api/accounts/${id}`, signal, fetcher), id)
    },

    async loadCategories(signal) {
      return readCategories(signal)
    },

    async loadSummary(month, signal) {
      const query = new URLSearchParams({ month })
      return fromWireSummary(await getJson(urlWithQuery('/api/summary', query), signal, fetcher), month)
    },

    async loadActivity({ month, accountId, limit }: ActivityQuery, signal) {
      const requestLimit = Math.min(Math.max(1, limit) + 1, ACTIVITY_MAX_ROWS + 1)
      const transactionQuery = new URLSearchParams({ month, limit: String(requestLimit) })
      const paymentQuery = new URLSearchParams({ month, limit: String(requestLimit) })
      const transferQuery = new URLSearchParams({ month, limit: String(requestLimit) })
      if (accountId !== null) {
        transactionQuery.set('account_id', String(accountId))
        paymentQuery.set('account_id', String(accountId))
        transferQuery.set('account_id', String(accountId))
      }
      const [transactionRows, paymentRows, transferRows, accountsSnapshot, categories] = await Promise.all([
        getJson(urlWithQuery('/api/transactions', transactionQuery), signal, fetcher),
        getJson(urlWithQuery('/api/credit-card-payments', paymentQuery), signal, fetcher),
        getJson(urlWithQuery('/api/account-transfers', transferQuery), signal, fetcher),
        accountsRead ?? readAccounts(signal),
        categoriesRead ?? readCategories(signal),
      ])
      if (!Array.isArray(transactionRows) || !Array.isArray(paymentRows) || !Array.isArray(transferRows)) throw failure(500)
      return mergeActivity(transactionRows as WireTransaction[], paymentRows as WirePayment[], transferRows as WireTransfer[], accountsSnapshot.accounts, categories, limit)
    },

    async saveEntry(values: EntryValues, target?: EntryTarget) {
      const table = values.kind === 'payment' ? 'payment' : values.kind === 'transfer' ? 'transfer' : 'transaction'
      if (target && target.table !== table) throw new Error('The entry type does not match the record being edited.')
      const collection = table === 'payment' ? '/api/credit-card-payments' : table === 'transfer' ? '/api/account-transfers' : '/api/transactions'
      const path = target ? `${collection}/${target.id}` : collection
      await write(path, target ? 'PUT' : 'POST', fetcher, toWireEntryInput(values))
    },

    async deleteEntry(target) {
      const collection = target.table === 'payment' ? '/api/credit-card-payments' : target.table === 'transfer' ? '/api/account-transfers' : '/api/transactions'
      await write(`${collection}/${target.id}`, 'DELETE', fetcher)
    },

    async addAccount(values: AccountValues) {
      await write('/api/accounts', 'POST', fetcher, toWireAccountInput(values))
    },

    async updateAccount(id, values: AccountValues) {
      await write(`/api/accounts/${id}`, 'PUT', fetcher, toWireAccountInput(values))
    },
  }
}

