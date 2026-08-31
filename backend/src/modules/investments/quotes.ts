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
}, fetcher: QuoteFetcher = fetch): QuoteProvider {
  if (config.QUOTE_PROVIDER !== 'live') return new StubQuoteProvider()
  const providers: QuoteProvider[] = []
  if (config.ALPHA_VANTAGE_API_KEY)
    providers.push(new AlphaVantageQuoteProvider(config.ALPHA_VANTAGE_API_KEY, config.ALPHA_VANTAGE_URL, fetcher))
  providers.push(new CoinGeckoQuoteProvider(config.COINGECKO_API_KEY, config.COINGECKO_URL, fetcher))
  return new CompositeQuoteProvider(providers)
}

export function isQuoteStale(fetchedAt: Date, now = new Date(), maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  return now.getTime() - fetchedAt.getTime() > maxAgeMs
}
