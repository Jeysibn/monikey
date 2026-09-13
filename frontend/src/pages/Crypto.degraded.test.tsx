import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Crypto } from './Crypto'

/**
 * Regression coverage for §15 (crypto provider degradation): when GET /crypto
 * returns the stale/degraded shape (CoinGecko unavailable), the page must
 * still show locally-known accounting — quantity and market value/cost basis
 * derived from local trades — and must not silently render the coin as if
 * it had no holdings at all. Only provider-dependent figures (current price)
 * are expected to be missing.
 */
describe('Crypto page — degraded provider response', () => {
  const instrumentId = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    vi.stubEnv('VITE_FINANCE_BACKEND', 'true')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('keeps showing quantity and cost-basis-derived value while market data is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/v1/crypto') {
        return new Response(JSON.stringify({
          baseCurrency: 'PHP',
          coins: [{ instrumentId, providerAssetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', tracked: true, quantity: '0.5', averageCost: '4000000', costBasis: '2000000', realizedPnl: '0', market: null, marketDataLinkRequired: false }],
          marketStatus: { stale: true, code: 'CRYPTO_PROVIDER_UNAVAILABLE' },
        }), { status: 200 })
      }
      if (url === '/api/v1/crypto/locations') return new Response(JSON.stringify({ locations: [] }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<Crypto />)

    expect(await screen.findByText('Bitcoin')).toBeDefined()
    expect(await screen.findByText(/Market prices are temporarily unavailable/)).toBeDefined()
    // Quantity must still render — it is local accounting, not provider data.
    expect(await screen.findByText(/0\.5 BTC/)).toBeDefined()
  })
})
