import { describe, expect, it, vi } from 'vitest'
import {
  AlphaVantageQuoteProvider,
  CoinGeckoQuoteProvider,
  createQuoteProvider,
  QuotaGatedQuoteProvider,
  refreshQuoteSnapshots,
  StubQuoteProvider,
  tryConsumeApiQuota,
  type QuoteProvider,
  type QuoteValue,
  type UsageTrackingClient,
} from '../../src/modules/investments/quotes.js'

/** In-memory stand-in for the `external_api_usage` table, driven by the same
 * two-statement upsert-then-conditional-update `tryConsumeApiQuota` issues. */
function fakeUsageTrackingClient(): UsageTrackingClient {
  const rows = new Map<string, number>()
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      if (query.startsWith('INSERT')) {
        const [provider, period, operation] = values as [string, string, string]
        const key = `${provider}:${period}:${operation}`
        if (!rows.has(key)) rows.set(key, 0)
        return [] as unknown as T
      }
      const [provider, period, operation, maxCalls, by] = values as [string, string, string, number, number]
      const key = `${provider}:${period}:${operation}`
      const current = rows.get(key) ?? 0
      if (current + by > maxCalls) return [] as unknown as T
      rows.set(key, current + by)
      return [{ call_count: current + by }] as unknown as T
    },
  }
}

const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response

describe('quote providers', () => {
  it('parses Alpha Vantage prices and normalizes tickers', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ 'Global Quote': { '05. price': '123.456' } }))
    const quotes = await new AlphaVantageQuoteProvider('key', 'https://quotes.test/query', fetcher).getQuotes([' ibm ', 'IBM'])
    expect(quotes.get('IBM')).toEqual({ priceMinor: 12346, source: 'alpha_vantage', currencyCode: 'USD' })
    expect(fetcher.mock.calls[0]![0]).toContain('function=GLOBAL_QUOTE')
    expect(fetcher.mock.calls[0]![0]).toContain('symbol=IBM')
  })

  it('parses supported CoinGecko crypto IDs in one request', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ bitcoin: { usd: 65000.12 }, ethereum: { usd: 3000 } }))
    const quotes = await new CoinGeckoQuoteProvider(undefined, 'https://quotes.test/price', fetcher).getQuotes(['btc', 'eth'])
    expect(quotes.get('BTC')?.priceMinor).toBe(6500012)
    expect(quotes.get('ETH')?.priceMinor).toBe(300000)
    expect(fetcher.mock.calls[0]![0]).toContain('ids=bitcoin%2Cethereum')
  })

  it('requests and parses the 24h change alongside price in the same CoinGecko call', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ bitcoin: { usd: 65000.12, usd_24h_change: -3.42 } }))
    const quotes = await new CoinGeckoQuoteProvider(undefined, 'https://quotes.test/price', fetcher).getQuotes(['btc'])
    expect(quotes.get('BTC')?.change24hPct).toBe(-3.42)
    expect(fetcher.mock.calls[0]![0]).toContain('include_24hr_change=true')
  })

  it('leaves change24hPct undefined when CoinGecko omits it', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ bitcoin: { usd: 65000.12 } }))
    const quotes = await new CoinGeckoQuoteProvider(undefined, 'https://quotes.test/price', fetcher).getQuotes(['btc'])
    expect(quotes.get('BTC')?.change24hPct).toBeUndefined()
  })

  // Regression test: fetching BNB's price in USD and re-converting via a
  // separately-cached FX rate produced a figure that could diverge by
  // several percent from what a user reads directly off CoinGecko in their
  // own base currency (crypto-market fiat quotes and interbank forex rates
  // aren't the same number) — see the getQuotes comment. Requesting the
  // price already in the target currency avoids that mismatch entirely.
  it('fetches the price directly in the given vsCurrency instead of always pulling USD', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ binancecoin: { php: 43542, php_24h_change: 1.2 } }))
    const quotes = await new CoinGeckoQuoteProvider(undefined, 'https://quotes.test/price', fetcher).getQuotes(['bnb'], 'php')
    expect(quotes.get('BNB')).toEqual({ priceMinor: 4354200, source: 'coingecko', currencyCode: 'PHP', change24hPct: 1.2 })
    expect(fetcher.mock.calls[0]![0]).toContain('vs_currencies=php')
  })

  it('keeps stub mode deterministic and does not call a provider', async () => {
    const provider = createQuoteProvider({ QUOTE_PROVIDER: 'stub' })
    expect(provider).toBeInstanceOf(StubQuoteProvider)
    await expect(provider.getQuotes(['IBM'])).resolves.toEqual(new Map())
  })

  describe('QuotaGatedQuoteProvider', () => {
    // Regression test for the bug where a single getQuotes() call always
    // consumed exactly 1 quota unit, even when the wrapped provider (Alpha
    // Vantage) makes one real upstream HTTP request per unique ticker — so a
    // 10-ticker refresh burned 10 real Alpha Vantage calls while the budget
    // only recorded 1 used.
    it('charges one quota unit per unique ticker for a per-ticker provider (Alpha Vantage)', async () => {
      const inner: QuoteProvider = { getQuotes: vi.fn().mockResolvedValue(new Map()) }
      const prisma = fakeUsageTrackingClient()
      const gated = new QuotaGatedQuoteProvider(inner, prisma, 'alpha_vantage', () => '2026-09-03', 5, undefined, (tickers) => new Set(tickers.map((t) => t.toUpperCase())).size)

      // 3 unique tickers (case/whitespace-insensitive) consumes 3 of the 5-unit budget.
      await gated.getQuotes([' ibm ', 'AAPL', 'aapl', 'MSFT'])
      expect(inner.getQuotes).toHaveBeenCalledTimes(1)
      const remainingAllowed = await tryConsumeApiQuota(prisma, 'alpha_vantage', '2026-09-03', 'get_quotes', 5, 2)
      expect(remainingAllowed).toBe(true) // exactly the 2 units left

      // A further call that would exceed what's left is rejected outright —
      // never partially charged — and does not reach the inner provider.
      const overBudget = await gated.getQuotes(['TSLA'])
      expect(overBudget).toEqual(new Map())
      expect(inner.getQuotes).toHaveBeenCalledTimes(1)
    })

    it('charges a flat 1 unit per call for a batching provider (CoinGecko) regardless of ticker count', async () => {
      const inner: QuoteProvider = { getQuotes: vi.fn().mockResolvedValue(new Map()) }
      const prisma = fakeUsageTrackingClient()
      const gated = new QuotaGatedQuoteProvider(inner, prisma, 'coingecko', () => '2026-09', 2)

      await gated.getQuotes(['BTC', 'ETH', 'USDT', 'USDC']) // one batched request regardless of ticker count
      await gated.getQuotes(['BTC'])
      expect(inner.getQuotes).toHaveBeenCalledTimes(2)
      // Budget of 2 is now exhausted after 2 calls, not 5 (one per ticker).
      const exhausted = await gated.getQuotes(['BTC'])
      expect(exhausted).toEqual(new Map())
      expect(inner.getQuotes).toHaveBeenCalledTimes(2)
    })
  })

  describe('refreshQuoteSnapshots', () => {
    // Regression test for the unbatched per-row insert loop — one createMany
    // call for the whole batch instead of one create() round-trip per instrument.
    it('writes every quoted instrument in a single batched createMany call', async () => {
      const instruments = [
        { id: 'inst-1', ticker: 'AAPL', user: { baseCurrency: 'PHP' } },
        { id: 'inst-2', ticker: 'MSFT', user: { baseCurrency: 'PHP' } },
        { id: 'inst-3', ticker: 'UNKNOWN', user: { baseCurrency: 'PHP' } }, // no quote returned for this one
      ]
      const quotes = new Map<string, QuoteValue>([
        ['AAPL', { priceMinor: 19999, source: 'alpha_vantage', currencyCode: 'USD' }],
        ['MSFT', { priceMinor: 41000, source: 'alpha_vantage', currencyCode: 'USD' }],
      ])
      const createMany = vi.fn().mockResolvedValue({ count: 2 })
      const prisma = {
        instrument: { findMany: vi.fn().mockResolvedValue(instruments) },
        quoteSnapshot: { createMany },
      }
      const provider: QuoteProvider = { getQuotes: vi.fn().mockResolvedValue(quotes) }
      const now = new Date('2026-09-03T00:00:00Z')

      const saved = await refreshQuoteSnapshots(prisma, provider, now)

      expect(saved).toBe(2)
      expect(createMany).toHaveBeenCalledTimes(1)
      expect(createMany).toHaveBeenCalledWith({
        data: [
          { instrumentId: 'inst-1', source: 'alpha_vantage', priceMinor: 19999n, currencyCode: 'USD', fetchedAt: now, change24hPct: null, change24hMinor: null },
          { instrumentId: 'inst-2', source: 'alpha_vantage', priceMinor: 41000n, currencyCode: 'USD', fetchedAt: now, change24hPct: null, change24hMinor: null },
        ],
      })
    })

    it('skips both the provider call and the insert when there are no tracked instruments', async () => {
      const createMany = vi.fn()
      const prisma = { instrument: { findMany: vi.fn().mockResolvedValue([]) }, quoteSnapshot: { createMany } }
      const provider: QuoteProvider = { getQuotes: vi.fn() }

      const saved = await refreshQuoteSnapshots(prisma, provider)

      expect(saved).toBe(0)
      expect(provider.getQuotes).not.toHaveBeenCalled()
      expect(createMany).not.toHaveBeenCalled()
    })

    it('skips the insert entirely when no instrument gets a quote back', async () => {
      const prisma = {
        instrument: { findMany: vi.fn().mockResolvedValue([{ id: 'inst-1', ticker: 'AAPL', user: { baseCurrency: 'PHP' } }]) },
        quoteSnapshot: { createMany: vi.fn() },
      }
      const provider: QuoteProvider = { getQuotes: vi.fn().mockResolvedValue(new Map()) }

      const saved = await refreshQuoteSnapshots(prisma, provider)

      expect(saved).toBe(0)
      expect(prisma.quoteSnapshot.createMany).not.toHaveBeenCalled()
    })

    it('derives change24hMinor from change24hPct rather than requesting it separately', async () => {
      const instruments = [{ id: 'inst-1', ticker: 'BTC', user: { baseCurrency: 'PHP' } }]
      // price $650.00 (65000 minor), +4% over 24h -> old price was
      // 65000/1.04 = 62500, so the absolute change is 2500 minor units.
      const quotes = new Map<string, QuoteValue>([
        ['BTC', { priceMinor: 65000, source: 'coingecko', currencyCode: 'USD', change24hPct: 4 }],
      ])
      const createMany = vi.fn().mockResolvedValue({ count: 1 })
      const prisma = { instrument: { findMany: vi.fn().mockResolvedValue(instruments) }, quoteSnapshot: { createMany } }
      const provider: QuoteProvider = { getQuotes: vi.fn().mockResolvedValue(quotes) }
      const now = new Date('2026-09-03T00:00:00Z')

      await refreshQuoteSnapshots(prisma, provider, now)

      expect(createMany).toHaveBeenCalledWith({
        data: [{ instrumentId: 'inst-1', source: 'coingecko', priceMinor: 65000n, currencyCode: 'USD', fetchedAt: now, change24hPct: 4, change24hMinor: 2500n }],
      })
    })

    it('groups instruments by their owner\'s base currency and requests a separate quote batch per currency', async () => {
      const instruments = [
        { id: 'inst-1', ticker: 'BTC', user: { baseCurrency: 'PHP' } },
        { id: 'inst-2', ticker: 'BTC', user: { baseCurrency: 'USD' } }, // different owner, different base currency
        { id: 'inst-3', ticker: 'ETH', user: { baseCurrency: 'PHP' } },
      ]
      const prisma = {
        instrument: { findMany: vi.fn().mockResolvedValue(instruments) },
        quoteSnapshot: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
      }
      const getQuotes = vi.fn()
        .mockImplementation(async (tickers: string[], vsCurrency: string) =>
          new Map(tickers.map((t) => [t.toUpperCase(), { priceMinor: 100, source: 'coingecko', currencyCode: vsCurrency.toUpperCase() }])))
      const provider: QuoteProvider = { getQuotes }
      const now = new Date('2026-09-03T00:00:00Z')

      const saved = await refreshQuoteSnapshots(prisma, provider, now)

      expect(saved).toBe(3)
      // One call per distinct base currency, each scoped to only that group's tickers.
      expect(getQuotes).toHaveBeenCalledTimes(2)
      expect(getQuotes).toHaveBeenCalledWith(['BTC', 'ETH'], 'php')
      expect(getQuotes).toHaveBeenCalledWith(['BTC'], 'usd')
    })
  })
})
