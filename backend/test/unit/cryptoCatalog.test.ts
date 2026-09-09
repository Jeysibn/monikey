import { describe, expect, it, vi } from 'vitest'
import { CoinGeckoCryptoCatalog, CryptoProviderUnavailableError } from '../../src/modules/investments/cryptoCatalog.js'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('CoinGeckoCryptoCatalog', () => {
  it('normalizes provider search identity and caches the result', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', large: 'https://img/btc.png', market_cap_rank: 1 }] }))
    const catalog = new CoinGeckoCryptoCatalog(undefined, 'https://coin.test/api/v3', fetcher)
    await expect(catalog.searchCoins(' bitcoin ')).resolves.toEqual([{ providerAssetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', imageUrl: 'https://img/btc.png', marketCapRank: 1 }])
    await catalog.searchCoins('bitcoin')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('uses provider IDs, preserves small prices as strings, and does not invent missing fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ id: 'wrapped-bitcoin', symbol: 'wbtc', name: 'Wrapped Bitcoin', current_price: 0.00000482, price_change_percentage_24h_in_currency: 2.4 }]))
    const catalog = new CoinGeckoCryptoCatalog(undefined, 'https://coin.test/api/v3', fetcher, () => 0)
    const markets = await catalog.getMarkets(['wrapped-bitcoin'], 'PHP')
    expect(fetcher.mock.calls[0]![0]).toContain('ids=wrapped-bitcoin')
    expect(markets[0]).toMatchObject({ providerAssetId: 'wrapped-bitcoin', symbol: 'WBTC', currentPrice: '0.00000482', change1hPct: null, change24hPct: 2.4, change7dPct: null })
  })

  it('normalizes history and exposes upstream failure as a domain error', async () => {
    const catalog = new CoinGeckoCryptoCatalog(undefined, 'https://coin.test/api/v3', vi.fn().mockResolvedValue(response({ prices: [[1_725_667_200_000, 100.25]] })))
    await expect(catalog.getHistory('bitcoin', 'PHP', '1d')).resolves.toEqual([{ timestamp: '2024-09-07T00:00:00.000Z', price: '100.25' }])
    await expect(new CoinGeckoCryptoCatalog(undefined, 'https://coin.test', vi.fn().mockResolvedValue(response({}, 429))).searchCoins('btc')).rejects.toBeInstanceOf(CryptoProviderUnavailableError)
  })

  it('does not call CoinGecko when the shared quota gate denies the request', async () => {
    const fetcher = vi.fn()
    const catalog = new CoinGeckoCryptoCatalog(undefined, 'https://coin.test', fetcher, Date.now, async () => false)
    await expect(catalog.searchCoins('btc')).rejects.toMatchObject({ code: 'CRYPTO_PROVIDER_UNAVAILABLE' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
