import type { AddRecurringItemInput, RecurringItem } from '../domain/recurring'
import { FinanceApiError } from './apiFinanceGateway'
import type { paths } from '../api.generated'
import { majorNumberToMinorUnits, minorUnitsToMajorDisplayNumber } from '../utils/money'

type ApiRecurringItem = paths['/recurring']['post']['responses'][201]['content']['application/json']
export type RecurringSuggestion = paths['/recurring/suggestions']['get']['responses'][200]['content']['application/json']['suggestions'][number]

export interface ConfirmPaymentInput { expectedDueDate: string; amountMinor: string; accountId?: string; paidOn: string; allowPossibleDuplicate?: boolean }
export interface PaymentCandidate { transactionId: string; title: string; amountMinor: string; occurredOn: string; accountId: string | null; categoryId: string | null; matchedOn: Array<'amount' | 'merchant' | 'account' | 'category'> }
export interface ConfirmPaymentResult { outcome: 'confirmed' | 'replayed' | 'reconciled_existing' | 'skipped' | 'linked'; recurring: RecurringItem; occurrence: { dueDate: string; status: 'confirmed' | 'skipped'; transactionId: string | null }; transactionId: string | null }
/** A refusal from the confirm endpoints that carries structured detail (possible duplicates, the already-recorded payment). */
export class RecurringConfirmError extends FinanceApiError {
  readonly candidates: PaymentCandidate[]
  constructor(status: number, code: string, message: string, field: string | undefined, candidates: PaymentCandidate[]) { super(status, code, message, field); this.name = 'RecurringConfirmError'; this.candidates = candidates }
}

export interface RecurringGateway {
  confirmPayment?: (id: string, input: ConfirmPaymentInput) => Promise<ConfirmPaymentResult>
  paymentCandidates?: (id: string, query: { dueDate: string; amountMinor: string; accountId?: string }) => Promise<PaymentCandidate[]>
  linkPayment?: (id: string, input: { expectedDueDate: string; transactionId: string }) => Promise<ConfirmPaymentResult>
  load(): Promise<RecurringItem[]>
  add(input: AddRecurringItemInput): Promise<RecurringItem>
  setStatus(id: string, status: 'active' | 'paused'): Promise<RecurringItem>
  markPaid(id: string): Promise<RecurringItem>
  update(id: string, input: Partial<AddRecurringItemInput>): Promise<RecurringItem>
  delete(id: string): Promise<void>
  suggestions?: () => Promise<RecurringSuggestion[]>
}

export class ApiRecurringGateway implements RecurringGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) { this.baseUrl = baseUrl; this.fetcher = fetcher }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers: { ...(init.body !== undefined && { 'Content-Type': 'application/json' }), ...init.headers } })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string; candidates?: PaymentCandidate[] } } | undefined
      if (payload?.error?.candidates) throw new RecurringConfirmError(response.status, payload.error.code ?? 'INTERNAL_ERROR', payload.error.message ?? 'Request failed', payload.error.field, payload.error.candidates)
      throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Monikey API request failed: ${response.status}`, payload?.error?.field)
    }
    return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>)
  }

  async load(): Promise<RecurringItem[]> { return (await this.request<paths['/recurring']['get']['responses'][200]['content']['application/json']>('/recurring')).items.map(this.map) }
  async add(input: AddRecurringItemInput): Promise<RecurringItem> {
    return this.map(await this.request<ApiRecurringItem>('/recurring', { method: 'POST', body: JSON.stringify({ ...input, amountMinor: majorNumberToMinorUnits(input.amount) }) }))
  }
  async setStatus(id: string, status: 'active' | 'paused'): Promise<RecurringItem> {
    return this.map(await this.request<ApiRecurringItem>(`/recurring/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }))
  }
  async markPaid(id: string): Promise<RecurringItem> {
    return this.map(await this.request<ApiRecurringItem>(`/recurring/${id}/mark-paid`, { method: 'POST', body: '{}' }))
  }
  async confirmPayment(id: string, input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> { return this.mapPayment(await this.request(`/recurring/${id}/confirm-payment`, { method: 'POST', body: JSON.stringify(input) })) }
  async linkPayment(id: string, input: { expectedDueDate: string; transactionId: string }): Promise<ConfirmPaymentResult> { return this.mapPayment(await this.request(`/recurring/${id}/link-payment`, { method: 'POST', body: JSON.stringify(input) })) }
  async paymentCandidates(id: string, query: { dueDate: string; amountMinor: string; accountId?: string }): Promise<PaymentCandidate[]> {
    const params = new URLSearchParams({ dueDate: query.dueDate, amountMinor: query.amountMinor, ...(query.accountId ? { accountId: query.accountId } : {}) })
    return (await this.request<{ candidates: PaymentCandidate[] }>(`/recurring/${id}/payment-candidates?${params}`)).candidates
  }
  private mapPayment = (raw: { outcome: ConfirmPaymentResult['outcome']; recurring: ApiRecurringItem; occurrence: ConfirmPaymentResult['occurrence']; transaction: { id: string } | null }): ConfirmPaymentResult => ({ outcome: raw.outcome, recurring: this.map(raw.recurring), occurrence: raw.occurrence, transactionId: raw.transaction?.id ?? raw.occurrence.transactionId })
  async update(id: string, input: Partial<AddRecurringItemInput>): Promise<RecurringItem> {
    const body: Record<string, unknown> = {}
    if (input.merchant !== undefined) body.merchant = input.merchant
    if (input.amount !== undefined) body.amountMinor = majorNumberToMinorUnits(input.amount)
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
  async suggestions(): Promise<RecurringSuggestion[]> { return (await this.request<paths['/recurring/suggestions']['get']['responses'][200]['content']['application/json']>('/recurring/suggestions')).suggestions }
  private map = (item: ApiRecurringItem): RecurringItem => ({ ...item, amountMinor: item.amountMinor, lastPaidDate: item.lastPaidDate ?? undefined, amount: minorUnitsToMajorDisplayNumber(item.amountMinor) })
}
