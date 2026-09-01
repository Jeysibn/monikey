export type Quote = { ticker: string; priceMinor: number; source: string; fetchedAt: string; stale: boolean }
export type QuoteValue = { priceMinor: number; source: string; currencyCode?: string }

export type QuoteFetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface QuoteProvider {
  getQuotes(tickers: string[]): Promise<Map<string, QuoteValue>>
}

/** Deterministic default used by local/CI runs; no external quota is consumed. */
export class StubQuoteProvider implements QuoteProvider {
  async getQuotes(): Promise<Map<string, QuoteValue>> { return new Map() }
}

export class AlphaVantageQuoteProvider implements QuoteProvider {
  constructor(
    private readonly apiKey: string,
    private readonly endpoint = 'https://www.alphavantage.co/query',
    private readonly fetcher: QuoteFetcher = fetch,
  ) {}

  async getQuotes(tickers: string[]): Promise<Map<string, QuoteValue>> {
    const result = new Map<string, QuoteValue>()
    for (const ticker of [...new Set(tickers.map((value) => value.trim().toUpperCase()).filter(Boolean))]) {
      const url = new URL(this.endpoint)
      url.searchParams.set('function', 'GLOBAL_QUOTE')
      url.searchParams.set('symbol', ticker)
      url.searchParams.set('apikey', this.apiKey)
      const response = await this.fetcher(url.toString())
      if (!response.ok) throw new Error(`Alpha Vantage request failed (${response.status})`)
      const body = await response.json() as { 'Global Quote'?: { '05. price'?: string }; Note?: string; Information?: string }
      const price = Number(body['Global Quote']?.['05. price'])
      if (!Number.isFinite(price) || price < 0) continue
      result.set(ticker, { priceMinor: Math.round(price * 100), source: 'alpha_vantage', currencyCode: 'USD' })
    }
    return result
  }
}

const COINGECKO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin' }

export class CoinGeckoQuoteProvider implements QuoteProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly endpoint = 'https://api.coingecko.com/api/v3/simple/price',
    private readonly fetcher: QuoteFetcher = fetch,
  ) {}

  async getQuotes(tickers: string[]): Promise<Map<string, QuoteValue>> {
    const normalized = [...new Set(tickers.map((value) => value.trim().toUpperCase()).filter(Boolean))]
    const pairs = normalized.flatMap((ticker) => COINGECKO_IDS[ticker] ? [[ticker, COINGECKO_IDS[ticker]] as const] : [])
    if (pairs.length === 0) return new Map()
    const url = new URL(this.endpoint)
    url.searchParams.set('ids', pairs.map(([, id]) => id).join(','))
    url.searchParams.set('vs_currencies', 'usd')
    const headers: Record<string, string> = this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : {}
    const response = await this.fetcher(url.toString(), { headers })
    if (!response.ok) throw new Error(`CoinGecko request failed (${response.status})`)
    const body = await response.json() as Record<string, { usd?: number }>
    const result = new Map<string, QuoteValue>()
    for (const [ticker, id] of pairs) {
      const price = body[id]?.usd
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0)
        result.set(ticker, { priceMinor: Math.round(price * 100), source: 'coingecko', currencyCode: 'USD' })
    }
    return result
  }
}

/** Minimal shape needed to read/increment the usage-tracking table (Prisma.PrismaClient satisfies this). */
export interface UsageTrackingClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

/**
 * Atomically increments `external_api_usage.call_count` for
 * (provider, period, operation) unless it is already at `maxCalls`. Two
 * statements: first ensure the row exists (starting at 0, `DO NOTHING` if
 * already present — this must NOT bump the counter, or the very first call
 * of a period would bypass a `maxCalls: 0` cap since the insert branch of a
 * plain upsert has no WHERE guard), then a conditional `UPDATE ...
 * WHERE call_count < maxCalls RETURNING` performs the actual claim. Returns
 * whether the call was allowed (and thus counted).
 */
export async function tryConsumeApiQuota(
  prisma: UsageTrackingClient,
  provider: string,
  period: string,
  operation: string,
  maxCalls: number,
): Promise<boolean> {
  await prisma.$queryRawUnsafe(
    `INSERT INTO external_api_usage (id, provider, period, operation, call_count, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 0, now())
     ON CONFLICT (provider, period, operation) DO NOTHING`,
    provider,
    period,
    operation,
  )
  const rows = await prisma.$queryRawUnsafe<Array<{ call_count: number }>>(
    `UPDATE external_api_usage
     SET call_count = call_count + 1, updated_at = now()
     WHERE provider = $1 AND period = $2 AND operation = $3 AND call_count < $4
     RETURNING call_count`,
    provider,
    period,
    operation,
    maxCalls,
  )
  return rows.length > 0
}

/** Daily period key (UTC) for Alpha Vantage's per-day cap. */
export function dailyPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Monthly period key (UTC) for CoinGecko's per-month cap. */
export function monthlyPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * Wraps a live provider with the plan §18 local quota budget: before
 * delegating, atomically claims one call against today's/this month's usage
 * row; if the budget is exhausted it logs a warning and returns an empty
 * quote map instead of calling the provider (never throws — a quote-refresh
 * outage must not crash the worker). Never constructed for the stub path.
 */
export class QuotaGatedQuoteProvider implements QuoteProvider {
  constructor(
    private readonly inner: QuoteProvider,
    private readonly prisma: UsageTrackingClient,
    private readonly providerName: string,
    private readonly period: () => string,
    private readonly maxCalls: number,
    private readonly logger: { warn: (obj: unknown, msg?: string) => void } = console,
  ) {}

  async getQuotes(tickers: string[]): Promise<Map<string, QuoteValue>> {
    if (tickers.length === 0) return new Map()
    const allowed = await tryConsumeApiQuota(this.prisma, this.providerName, this.period(), 'get_quotes', this.maxCalls)
    if (!allowed) {
      this.logger.warn({ provider: this.providerName, period: this.period(), maxCalls: this.maxCalls }, 'external API quota exhausted; skipping live quote call')
      return new Map()
    }
    return this.inner.getQuotes(tickers)
  }
}

export class CompositeQuoteProvider implements QuoteProvider {
  constructor(private readonly providers: QuoteProvider[]) {}

  async getQuotes(tickers: string[]): Promise<Map<string, QuoteValue>> {
    const result = new Map<string, QuoteValue>()
    for (const provider of this.providers) {
      for (const [ticker, quote] of await provider.getQuotes(tickers)) {
        if (!result.has(ticker)) result.set(ticker, quote)
      }
    }
    return result
  }
}

/** Builds the configured provider; live mode remains opt-in to avoid quota use in CI. */
export function createQuoteProvider(config: {
  QUOTE_PROVIDER?: 'stub' | 'live'
  ALPHA_VANTAGE_API_KEY?: string
  COINGECKO_API_KEY?: string
  ALPHA_VANTAGE_URL?: string
  COINGECKO_URL?: string
  ALPHA_VANTAGE_MAX_CALLS_PER_DAY?: number
  COINGECKO_MAX_CALLS_PER_MONTH?: number
}, fetcher: QuoteFetcher = fetch, deps?: { prisma?: UsageTrackingClient; logger?: { warn: (obj: unknown, msg?: string) => void } }): QuoteProvider {
  // Stub mode must never touch the usage table or the network — the `deps`
  // argument (and thus the quota table) is intentionally unread on this path.
  if (config.QUOTE_PROVIDER !== 'live') return new StubQuoteProvider()
  const providers: QuoteProvider[] = []
  if (config.ALPHA_VANTAGE_API_KEY) {
    let alphaVantage: QuoteProvider = new AlphaVantageQuoteProvider(config.ALPHA_VANTAGE_API_KEY, config.ALPHA_VANTAGE_URL, fetcher)
    if (deps?.prisma)
      alphaVantage = new QuotaGatedQuoteProvider(alphaVantage, deps.prisma, 'alpha_vantage', dailyPeriod, config.ALPHA_VANTAGE_MAX_CALLS_PER_DAY ?? 20, deps.logger)
    providers.push(alphaVantage)
  }
  let coinGecko: QuoteProvider = new CoinGeckoQuoteProvider(config.COINGECKO_API_KEY, config.COINGECKO_URL, fetcher)
  if (deps?.prisma)
    coinGecko = new QuotaGatedQuoteProvider(coinGecko, deps.prisma, 'coingecko', monthlyPeriod, config.COINGECKO_MAX_CALLS_PER_MONTH ?? 9000, deps.logger)
  providers.push(coinGecko)
  return new CompositeQuoteProvider(providers)
}

export async function refreshQuoteSnapshots(
  prisma: { instrument: { findMany(args: unknown): Promise<Array<{ id: string; ticker: string }>> }; quoteSnapshot: { create(args: unknown): Promise<unknown> } },
  provider: QuoteProvider,
  now = new Date(),
): Promise<number> {
  const instruments = await prisma.instrument.findMany({ where: { userId: { not: null } }, select: { id: true, ticker: true } })
  if (instruments.length === 0) return 0
  const quotes = await provider.getQuotes(instruments.map((instrument) => instrument.ticker))
  let saved = 0
  for (const instrument of instruments) {
    const quote = quotes.get(instrument.ticker.toUpperCase())
    if (!quote) continue
    await prisma.quoteSnapshot.create({ data: { instrumentId: instrument.id, source: quote.source, priceMinor: BigInt(quote.priceMinor), currencyCode: quote.currencyCode ?? 'USD', fetchedAt: now } })
    saved += 1
  }
  return saved
}

export function isQuoteStale(fetchedAt: Date, now = new Date(), maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  return now.getTime() - fetchedAt.getTime() > maxAgeMs
}
