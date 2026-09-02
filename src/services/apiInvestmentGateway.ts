import type { InvestmentTransactionType } from '../domain/investments'
import { FinanceApiError } from './apiFinanceGateway'

export type InvestmentTradeInput = { ticker: string; name: string; assetClass: 'equity' | 'etf' | 'crypto' | 'reit' | 'bond'; sector: string; type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }
export type InvestmentTradeUpdateInput = { type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }
export interface InvestmentGateway {
  addTrade(input: InvestmentTradeInput): Promise<void>
  updateTrade(id: string, input: InvestmentTradeUpdateInput): Promise<void>
  deleteTrade(id: string): Promise<void>
}
export class ApiInvestmentGateway implements InvestmentGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) { this.baseUrl = baseUrl; this.fetcher = fetcher }
  private async parseError(response: Response, fallback: string): Promise<never> {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
    throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? fallback, payload?.error?.field)
  }
  async addTrade(input: InvestmentTradeInput): Promise<void> {
    // Backend's tradeSchema expects `occurredOn`, not `date` — sending the
    // raw `input.date` key left `occurredOn` undefined, which zod rejected
    // with "Invalid input: expected string, received undefined".
    const { date, price, ...rest } = input
    const response = await this.fetcher(`${this.baseUrl}/investments/trades`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, occurredOn: date, priceMinor: Math.round(price * 100), cashAccountId: null, idempotencyKey: crypto.randomUUID() }) })
    if (!response.ok) await this.parseError(response, 'Could not save investment trade.')
  }
  async updateTrade(id: string, input: InvestmentTradeUpdateInput): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/investments/trades/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: input.type, units: input.units, priceMinor: Math.round(input.price * 100), occurredOn: input.date, note: input.note ?? null }) })
    if (!response.ok) await this.parseError(response, 'Could not update investment trade.')
  }
  async deleteTrade(id: string): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/investments/trades/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok && response.status !== 204) await this.parseError(response, 'Could not delete investment trade.')
  }
}
