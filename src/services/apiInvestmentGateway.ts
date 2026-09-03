import type { InvestmentTransactionType } from '../domain/investments'
import { FinanceApiError } from './apiFinanceGateway'

export type InvestmentTradeInput = {
  ticker: string
  name: string
  assetClass: 'equity' | 'etf' | 'crypto' | 'reit' | 'bond'
  sector: string
  type: InvestmentTransactionType
  units: number
  price: number
  date: string
  feeMinor?: number
  cashAccountId?: string | null
  note?: string
}
export type InvestmentTradeUpdateInput = {
  type: InvestmentTransactionType
  units: number
  price: number
  date: string
  feeMinor?: number
  note?: string
}
export type InvestmentDividendInput = {
  ticker: string
  amountMinor: number
  date: string
  cashAccountId?: string | null
  note?: string
}

// Authoritative holding/summary shape as returned by GET /investments — see
// backend investments.routes.ts's calculatePortfolio-backed response. Kept
// intentionally close to the wire shape; presentation-layer mapping (units
// formatting, colors, etc.) belongs in the consuming hook, not here.
export type PortfolioHolding = {
  instrumentId: string
  ticker: string
  name: string
  assetClass: string
  sector: string
  units: number
  averageCostMinor: number
  costBasisMinor: number
  realizedPnlMinor: number
  dividendsReceivedMinor: number
  feesPaidMinor: number
  latestPriceMinor: number | null
  /** `latestPriceMinor` converted to `Portfolio.baseCurrency`; null when nativeCurrencyCode === baseCurrency (no conversion needed) or no FX rate is available. Use this for display — latestPriceMinor is in nativeCurrencyCode, not necessarily base. */
  latestPriceBaseMinor: number | null
  /** In the quote's native market currency (see `nativeCurrencyCode`), not necessarily the portfolio's base currency. */
  marketValueMinor: number | null
  unrealizedPnlMinor: number | null
  /** Currency the quote (and the two fields above) are denominated in — e.g. 'USD' for AAPL/BTC. */
  nativeCurrencyCode: string
  /** Converted to `Portfolio.baseCurrency` using the FX subsystem; null when nativeCurrencyCode === baseCurrency (no conversion needed — see marketValueMinor) or when a rate isn't available. */
  marketValueBaseMinor: number | null
  unrealizedPnlBaseMinor: number | null
  /** Trailing-24h price move as a percent (e.g. -3.42 for -3.42%) — currency-agnostic, no conversion needed. Null when the quote provider doesn't report one (equities, or no quote yet) — never a fabricated 0. */
  change24hPct: number | null
  /** Per-unit 24h price move, converted to base currency — same null semantics as latestPriceBaseMinor. */
  change24hBaseMinor: number | null
  /** `change24hBaseMinor * units` — this position's actual currency gain/loss over the last 24h. */
  dailyChangeBaseMinor: number | null
  /** True when nativeCurrencyCode !== baseCurrency and no FX rate could be obtained — marketValueBaseMinor/unrealizedPnlBaseMinor are null; show the native figures with a warning rather than inventing a rate. */
  baseValuationUnavailable: boolean
  quoteSource: string
  quoteFetchedAt: string | null
  quoteStale: boolean
}
export type PortfolioSummary = {
  /** Base-currency (portfolio display currency) totals — already FX-converted where needed. */
  portfolioValueMinor: number
  remainingCostBasisMinor: number
  realizedPnlMinor: number
  unrealizedPnlMinor: number
  dividendsMinor: number
  feesMinor: number
  totalReturnMinor: number
  /** Null when remainingCostBasisMinor is 0 (e.g. an entirely closed-out portfolio) — a %-return has no defined denominator there. */
  totalReturnPct: number | null
  /** Sum of every holding's `dailyChangeBaseMinor` that has one; null when none of them do (e.g. all-equity portfolio with no 24h data), never a fabricated 0. */
  todaysChangeMinor: number | null
  todaysChangePct: number | null
  /** True if any holding's base-currency valuation couldn't be computed (portfolioValueMinor/unrealizedPnlMinor fall back to native figures for those holdings). */
  baseValuationUnavailable: boolean
}
export type PortfolioTrade = {
  id: string
  instrumentId: string
  ticker: string
  type: InvestmentTransactionType
  units: number
  priceMinor: number
  feeMinor: number
  occurredOn: string
  cashAccountId: string | null
  note: string | null
  idempotencyKey: string | null
  createdAt: string
}
export type PortfolioDividend = {
  id: string
  instrumentId: string
  amountMinor: number
  occurredOn: string
  cashAccountId: string | null
  note: string | null
}
export type Portfolio = {
  /** Portfolio display currency (the user's account base currency, e.g. 'PHP'). */
  baseCurrency: string
  summary: PortfolioSummary
  holdings: PortfolioHolding[]
  closedPositions: PortfolioHolding[]
  trades: PortfolioTrade[]
  dividends: PortfolioDividend[]
}

export interface InvestmentGateway {
  getPortfolio(signal?: AbortSignal): Promise<Portfolio>
  addTrade(input: InvestmentTradeInput): Promise<void>
  updateTrade(id: string, input: InvestmentTradeUpdateInput): Promise<void>
  deleteTrade(id: string): Promise<void>
  addDividend(input: InvestmentDividendInput): Promise<void>
  refreshQuotes(): Promise<void>
}

export class ApiInvestmentGateway implements InvestmentGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) { this.baseUrl = baseUrl; this.fetcher = fetcher }
  private async parseError(response: Response, fallback: string): Promise<never> {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
    throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? fallback, payload?.error?.field)
  }
  async getPortfolio(signal?: AbortSignal): Promise<Portfolio> {
    const response = await this.fetcher(`${this.baseUrl}/investments`, { credentials: 'include', signal })
    if (!response.ok) await this.parseError(response, 'Could not load portfolio.')
    return response.json() as Promise<Portfolio>
  }
  async addTrade(input: InvestmentTradeInput): Promise<void> {
    // Backend's tradeSchema expects `occurredOn`, not `date` — sending the
    // raw `input.date` key left `occurredOn` undefined, which zod rejected
    // with "Invalid input: expected string, received undefined".
    const { date, price, feeMinor, cashAccountId, ...rest } = input
    const response = await this.fetcher(`${this.baseUrl}/investments/trades`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, occurredOn: date, priceMinor: Math.round(price * 100), feeMinor: feeMinor ?? 0, cashAccountId: cashAccountId ?? null, idempotencyKey: crypto.randomUUID() }) })
    if (!response.ok) await this.parseError(response, 'Could not save investment trade.')
  }
  async updateTrade(id: string, input: InvestmentTradeUpdateInput): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/investments/trades/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: input.type, units: input.units, priceMinor: Math.round(input.price * 100), feeMinor: input.feeMinor ?? 0, occurredOn: input.date, note: input.note ?? null }) })
    if (!response.ok) await this.parseError(response, 'Could not update investment trade.')
  }
  async deleteTrade(id: string): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/investments/trades/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok && response.status !== 204) await this.parseError(response, 'Could not delete investment trade.')
  }
  async addDividend(input: InvestmentDividendInput): Promise<void> {
    const { date, ...rest } = input
    const response = await this.fetcher(`${this.baseUrl}/investments/dividends`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, occurredOn: date, cashAccountId: input.cashAccountId ?? null }) })
    if (!response.ok) await this.parseError(response, 'Could not save dividend.')
  }
  async refreshQuotes(): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/investments/quotes/refresh`, { method: 'POST', credentials: 'include' })
    // 429 (server-side cooldown) is an expected, non-fatal outcome of rapid
    // repeated clicks — the caller just re-fetches the portfolio either way.
    if (!response.ok && response.status !== 429) await this.parseError(response, 'Could not refresh prices.')
  }
}
