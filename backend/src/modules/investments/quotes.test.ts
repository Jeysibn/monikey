import { describe, expect, it, vi } from 'vitest'
import {
  AlphaVantageQuoteProvider,
  CoinGeckoQuoteProvider,
  createQuoteProvider,
  StubQuoteProvider,
} from './quotes.js'

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

  it('keeps stub mode deterministic and does not call a provider', async () => {
    const provider = createQuoteProvider({ QUOTE_PROVIDER: 'stub' })
    expect(provider).toBeInstanceOf(StubQuoteProvider)
    await expect(provider.getQuotes(['IBM'])).resolves.toEqual(new Map())
  })
})
