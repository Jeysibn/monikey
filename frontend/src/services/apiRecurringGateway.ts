import type { AddRecurringItemInput, RecurringItem } from '../domain/recurring'
import { FinanceApiError } from './apiFinanceGateway'

type ApiRecurringItem = Omit<RecurringItem, 'amount'> & { amountMinor: number }

export interface RecurringGateway {
  load(): Promise<RecurringItem[]>
  add(input: AddRecurringItemInput): Promise<RecurringItem>
  setStatus(id: string, status: 'active' | 'paused'): Promise<RecurringItem>
  markPaid(id: string): Promise<RecurringItem>
  update(id: string, input: Partial<AddRecurringItemInput>): Promise<RecurringItem>
  delete(id: string): Promise<void>
}

export class ApiRecurringGateway implements RecurringGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) { this.baseUrl = baseUrl; this.fetcher = fetcher }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers: { ...(init.body !== undefined && { 'Content-Type': 'application/json' }), ...init.headers } })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
      throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Monikey API request failed: ${response.status}`, payload?.error?.field)
    }
    return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
  }

  async load(): Promise<RecurringItem[]> { return (await this.request<{ items: ApiRecurringItem[] }>('/recurring')).items.map(this.map) }
  async add(input: AddRecurringItemInput): Promise<RecurringItem> {
    return this.map(await this.request<ApiRecurringItem>('/recurring', { method: 'POST', body: JSON.stringify({ ...input, amountMinor: Math.round(input.amount * 100) }) }))
  }
  async setStatus(id: string, status: 'active' | 'paused'): Promise<RecurringItem> {
    return this.map(await this.request<ApiRecurringItem>(`/recurring/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }))
  }
  async markPaid(id: string): Promise<RecurringItem> {
    return this.map(await this.request<ApiRecurringItem>(`/recurring/${id}/mark-paid`, { method: 'POST', body: '{}' }))
  }
  async update(id: string, input: Partial<AddRecurringItemInput>): Promise<RecurringItem> {
    const body: Record<string, unknown> = {}
    if (input.merchant !== undefined) body.merchant = input.merchant
    if (input.amount !== undefined) body.amountMinor = Math.round(input.amount * 100)
    if (input.frequency !== undefined) body.frequency = input.frequency
    if (input.nextDueDate !== undefined) body.nextDueDate = input.nextDueDate
    if (input.accountId !== undefined) body.accountId = input.accountId
    if (input.categoryId !== undefined) body.categoryId = input.categoryId
    if (input.autopay !== undefined) body.autopay = input.autopay
    return this.map(await this.request<ApiRecurringItem>(`/recurring/${id}`, { method: 'PATCH', body: JSON.stringify(body) }))
  }
  async delete(id: string): Promise<void> {
    await this.request<void>(`/recurring/${id}`, { method: 'DELETE' })
  }
  private map = (item: ApiRecurringItem): RecurringItem => ({ ...item, amount: item.amountMinor / 100 })
}
