export type Quote = { ticker: string; priceMinor: number; source: string; fetchedAt: string; stale: boolean }
// change24hPct: percentage price move over the trailing 24h, e.g. -3.42 for
// -3.42%. Crypto-only (24/7 market) — equity providers (Alpha Vantage) don't
// populate it; a null/undefined value means "unknown", never "0% change".
export type QuoteValue = { priceMinor: number; source: string; currencyCode?: string; change24hPct?: number }

export type QuoteFetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface QuoteProvider {
  // vsCurrency: the fiat currency to price against (default 'usd'), lowercase
  // ISO code. Providers that only ever quote in USD (Alpha Vantage) ignore it.
  getQuotes(tickers: string[], vsCurrency?: string): Promise<Map<string, QuoteValue>>
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

  // Alpha Vantage's GLOBAL_QUOTE has no currency parameter — equities always
  // come back in their listing currency (USD for the tickers this app
  // tracks) — vsCurrency is accepted for interface parity only.
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

// Bug: the frontend's "top coin" preset pills (Investments.tsx) offer BNB,
// SOL, XRP, DOGE, ADA, TRX alongside these — but only BTC/ETH/USDT/USDC had
// an id here, so logging any of the other six could never get a live quote:
// `latestPriceMinor` stayed null forever, and the holding row fell back to
// displaying its entered average cost as if it were the market value (see
// the comment on that fallback in useInvestments.ts) while the authoritative
// backend summary correctly counted it as 0 — the mismatch behind the
// "1222222200.0%" allocation bug. Keep this list in sync with
// TOP_CRYPTO_PRESETS on the frontend.
const COINGECKO_IDS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether', USDC: 'usd-coin', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano', TRX: 'tron' }

export class CoinGeckoQuoteProvider implements QuoteProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly endpoint = 'https://api.coingecko.com/api/v3/simple/price',
    private readonly fetcher: QuoteFetcher = fetch,
  ) {}

  // vsCurrency: fetch the price already denominated in this fiat currency
  // instead of always pulling USD and re-converting through our own FX rate.
  // Regression: a portfolio's cost basis is typically entered by reading the
  // price CoinGecko itself displays in the account's base currency (e.g.
  // PHP) — CoinGecko's own fiat quotes for non-major currencies can carry a
  // materially different implied FX rate than an interbank source like
  // Frankfurter (seen: ~8.5% apart for PHP), so re-deriving PHP from a
  // separately-fetched USD price produced a bogus-looking "loss" purely from
  // mixing two FX sources. Asking CoinGecko directly for the base-currency
  // price keeps the live figure consistent with what the user read off the
  // site — no extra quota cost, `vs_currencies` accepts any single code.
  async getQuotes(tickers: string[], vsCurrency = 'usd'): Promise<Map<string, QuoteValue>> {
    const normalized = [...new Set(tickers.map((value) => value.trim().toUpperCase()).filter(Boolean))]
    const pairs = normalized.flatMap((ticker) => COINGECKO_IDS[ticker] ? [[ticker, COINGECKO_IDS[ticker]] as const] : [])
    if (pairs.length === 0) return new Map()
    const currency = vsCurrency.toLowerCase()
    const url = new URL(this.endpoint)
    url.searchParams.set('ids', pairs.map(([, id]) => id).join(','))
    url.searchParams.set('vs_currencies', currency)
    // Same request, no extra quota cost — CoinGecko folds the 24h change
    // into the existing `simple/price` payload behind this one flag.
    url.searchParams.set('include_24hr_change', 'true')
    const headers: Record<string, string> = this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : {}
    const response = await this.fetcher(url.toString(), { headers })
    if (!response.ok) throw new Error(`CoinGecko request failed (${response.status})`)
    const body = await response.json() as Record<string, Record<string, number | undefined>>
    const result = new Map<string, QuoteValue>()
    for (const [ticker, id] of pairs) {
      const price = body[id]?.[currency]
      if (typeof price === 'number' && Number.isFinite(price) && price >= 0) {
        const change24hPct = body[id]?.[`${currency}_24h_change`]
        result.set(ticker, {
          priceMinor: Math.round(price * 100),
          source: 'coingecko',
          currencyCode: currency.toUpperCase(),
          change24hPct: typeof change24hPct === 'number' && Number.isFinite(change24hPct) ? change24hPct : undefined,
        })
      }
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
  by = 1,
): Promise<boolean> {
  await prisma.$queryRawUnsafe(
    `INSERT INTO external_api_usage (id, provider, period, operation, call_count, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 0, now())
     ON CONFLICT (provider, period, operation) DO NOTHING`,
    provider,
    period,
    operation,
  )
  // Guard against a single request (e.g. one manual refresh across several
  // tickers — each ticker is a separate upstream HTTP call for providers
  // without a batch endpoint, see AlphaVantageQuoteProvider) claiming more
  // than what's left in the budget: only claim `by` units when the full
  // amount still fits under `maxCalls`, never a partial/oversized claim.
  const rows = await prisma.$queryRawUnsafe<Array<{ call_count: number }>>(
    `UPDATE external_api_usage
     SET call_count = call_count + $5, updated_at = now()
     WHERE provider = $1 AND period = $2 AND operation = $3 AND call_count + $5 <= $4
     RETURNING call_count`,
    provider,
    period,
    operation,
    maxCalls,
    by,
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
    // How many real upstream HTTP calls one getQuotes() invocation makes.
    // Alpha Vantage has no batch endpoint — it issues one request per unique
    // ticker — while CoinGecko's `simple/price` batches every ticker into a
    // single request. Defaulting to "1 call regardless of ticker count"
    // matches CoinGecko; Alpha Vantage passes its own per-ticker cost below.
    private readonly costForTickers: (tickers: string[]) => number = () => 1,
  ) {}

  async getQuotes(tickers: string[], vsCurrency?: string): Promise<Map<string, QuoteValue>> {
    if (tickers.length === 0) return new Map()
    // The quota claim must match the real call count this invocation will
    // make, or a multi-ticker refresh silently spends far more of the
    // provider's actual rate limit than the budget records (see costForTickers).
    const cost = this.costForTickers(tickers)
    const allowed = await tryConsumeApiQuota(this.prisma, this.providerName, this.period(), 'get_quotes', this.maxCalls, cost)
    if (!allowed) {
      this.logger.warn({ provider: this.providerName, period: this.period(), maxCalls: this.maxCalls, requested: cost }, 'external API quota exhausted; skipping live quote call')
      return new Map()
    }
    return this.inner.getQuotes(tickers, vsCurrency)
  }
}

/** Number of unique, non-blank tickers — i.e. the number of upstream HTTP
 * calls a per-ticker provider like Alpha Vantage will actually issue. */
function uniqueTickerCount(tickers: string[]): number {
  return new Set(tickers.map((value) => value.trim().toUpperCase()).filter(Boolean)).size
}

export class CompositeQuoteProvider implements QuoteProvider {
  constructor(private readonly providers: QuoteProvider[]) {}

  async getQuotes(tickers: string[], vsCurrency?: string): Promise<Map<string, QuoteValue>> {
    const result = new Map<string, QuoteValue>()
    for (const provider of this.providers) {
      for (const [ticker, quote] of await provider.getQuotes(tickers, vsCurrency)) {
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
      // Alpha Vantage has no batch quote endpoint: one getQuotes() call
      // issues one HTTP request per unique ticker, so the quota cost must
      // scale with ticker count, not be flat per invocation.
      alphaVantage = new QuotaGatedQuoteProvider(alphaVantage, deps.prisma, 'alpha_vantage', dailyPeriod, config.ALPHA_VANTAGE_MAX_CALLS_PER_DAY ?? 20, deps.logger, uniqueTickerCount)
    providers.push(alphaVantage)
  }
  let coinGecko: QuoteProvider = new CoinGeckoQuoteProvider(config.COINGECKO_API_KEY, config.COINGECKO_URL, fetcher)
  if (deps?.prisma)
    coinGecko = new QuotaGatedQuoteProvider(coinGecko, deps.prisma, 'coingecko', monthlyPeriod, config.COINGECKO_MAX_CALLS_PER_MONTH ?? 9000, deps.logger)
  providers.push(coinGecko)
  return new CompositeQuoteProvider(providers)
}

/** Minimal shape `refreshQuoteSnapshots` needs — a real `PrismaClient` satisfies this
 * structurally at runtime (the `select` this function passes brings back the
 * `user` relation), but TypeScript can't verify that through the generic
 * `findMany(args: unknown)` signature, so callers passing a real client cast to this type. */
export interface RefreshQuoteSnapshotsPrisma {
  instrument: { findMany(args: unknown): Promise<Array<{ id: string; ticker: string; user: { baseCurrency: string } | null }>> }
  quoteSnapshot: { createMany(args: unknown): Promise<{ count: number }> }
}

export async function refreshQuoteSnapshots(
  prisma: RefreshQuoteSnapshotsPrisma,
  provider: QuoteProvider,
  now = new Date(),
): Promise<number> {
  const instruments = await prisma.instrument.findMany({ where: { userId: { not: null } }, select: { id: true, ticker: true, user: { select: { baseCurrency: true } } } })
  if (instruments.length === 0) return 0
  // Group by the owning user's base currency so CoinGecko is asked for the
  // price already denominated in that currency, rather than always pulling
  // USD and re-converting via a separately-fetched FX rate — see the
  // CoinGeckoQuoteProvider.getQuotes comment for why those two paths can
  // diverge by several percent for non-major currencies. Each group is one
  // upstream request (CoinGecko batches every ticker in a group into one
  // `simple/price` call), so this costs one extra call per distinct base
  // currency in play, not per instrument.
  const groups = new Map<string, typeof instruments>()
  for (const instrument of instruments) {
    const currency = (instrument.user?.baseCurrency ?? 'PHP').toLowerCase()
    const group = groups.get(currency)
    if (group) group.push(instrument)
    else groups.set(currency, [instrument])
  }
  // A single batched insert instead of one round-trip per instrument — with
  // hundreds of tracked tickers the per-row loop meant hundreds of
  // sequential DB round-trips for what is otherwise one query's worth of data.
  const rows: Array<{ instrumentId: string; source: string; priceMinor: bigint; currencyCode: string; fetchedAt: Date; change24hPct: number | null; change24hMinor: bigint | null }> = []
  for (const [currency, group] of groups) {
    const quotes = await provider.getQuotes(group.map((instrument) => instrument.ticker), currency)
    for (const instrument of group) {
      const quote = quotes.get(instrument.ticker.toUpperCase())
      if (!quote) continue
      // change24hMinor: the absolute price move implied by change24hPct, in
      // the same native-currency minor units as priceMinor — derived rather
      // than requested separately, since pct = (current-old)/old*100 gives
      // old = current/(1+pct/100), and the change is current-old. Kept null
      // (not 0) whenever the provider didn't report a pct, so "no data yet"
      // is never confused with "flat 0% day".
      const change24hMinor = quote.change24hPct != null && Number.isFinite(quote.change24hPct)
        ? Math.round(quote.priceMinor * quote.change24hPct / (100 + quote.change24hPct))
        : null
      rows.push({
        instrumentId: instrument.id,
        source: quote.source,
        priceMinor: BigInt(quote.priceMinor),
        currencyCode: quote.currencyCode ?? 'USD',
        fetchedAt: now,
        change24hPct: quote.change24hPct ?? null,
        change24hMinor: change24hMinor != null ? BigInt(change24hMinor) : null,
      })
    }
  }
  if (rows.length === 0) return 0
  const result = await prisma.quoteSnapshot.createMany({ data: rows })
  return result.count
}

export function isQuoteStale(fetchedAt: Date, now = new Date(), maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  return now.getTime() - fetchedAt.getTime() > maxAgeMs
}
