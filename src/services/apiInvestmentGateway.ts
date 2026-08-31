import type { InvestmentTransactionType } from '../domain/investments'
import { FinanceApiError } from './apiFinanceGateway'

export type InvestmentTradeInput = { ticker: string; name: string; assetClass: 'equity' | 'etf' | 'crypto' | 'reit' | 'bond'; sector: string; type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }
export interface InvestmentGateway { addTrade(input: InvestmentTradeInput): Promise<void> }
export class ApiInvestmentGateway implements InvestmentGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = fetch) { this.baseUrl = baseUrl; this.fetcher = fetcher }
  async addTrade(input: InvestmentTradeInput): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/investments/trades`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, priceMinor: Math.round(input.price * 100), cashAccountId: null, idempotencyKey: crypto.randomUUID() }) })
    if (!response.ok) { const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined; throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? 'Could not save investment trade.', payload?.error?.field) }
  }
}
