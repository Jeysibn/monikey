import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Crypto } from './Crypto'

/**
 * Regression coverage for P0 §7: recording a crypto trade/transfer must
 * reuse the SAME idempotency key across retries of one submission (network
 * failure, then resubmit) so the backend's duplicate-key detection collapses
 * them into a single trade/transfer, exactly like the cash AddTransactionModal
 * already does. A prior version of this dialog never generated or sent a key
 * at all, which would let a retried "buy" record twice server-side.
 */
describe('Crypto transaction dialog idempotency', () => {
  const instrumentId = '11111111-1111-1111-1111-111111111111'
  const locationId = '22222222-2222-2222-2222-222222222222'

  beforeEach(() => {
    vi.stubEnv('VITE_FINANCE_BACKEND', 'true')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sends the same idempotencyKey on a retried trade submission after a failed first attempt', async () => {
    const tradeCalls: Array<{ body: any }> = []
    let tradeAttempt = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/v1/crypto') {
        return new Response(JSON.stringify({
          baseCurrency: 'PHP',
          summary: { portfolioValue: '0', costBasis: '0', realizedPnl: '0', unrealizedPnl: '0', totalPnl: '0' },
          coins: [{ instrumentId, providerAssetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', tracked: true, quantity: '0', currentPrice: null, marketValue: null, averageCost: '0', costBasis: '0', realizedPnl: '0', unrealizedPnl: null, totalPnl: null, change1hPct: null, change24hPct: null, change7dPct: null, imageUrl: null, marketCapRank: 1, quoteFetchedAt: null, quoteStale: true, marketDataLinkRequired: false, allocationPct: '0', totalPnlPct: null }],
        }), { status: 200 })
      }
      if (url === '/api/v1/crypto/locations') {
        return new Response(JSON.stringify({ locations: [{ id: locationId, userId: 'u', name: 'Binance', type: 'exchange', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }), { status: 200 })
      }
      if (url.startsWith('/api/v1/crypto/coins/')) {
        return new Response(JSON.stringify({ coin: { instrumentId, symbol: 'BTC', name: 'Bitcoin', whereHeld: [] } }), { status: 200 })
      }
      if (url.startsWith('/api/v1/crypto/activities')) {
        return new Response(JSON.stringify({ activities: [] }), { status: 200 })
      }
      if (url === '/api/v1/crypto/trades') {
        tradeAttempt += 1
        tradeCalls.push({ body: JSON.parse(String(init?.body)) })
        if (tradeAttempt === 1) throw new TypeError('Network request failed')
        return new Response(JSON.stringify({ id: 'trade-1' }), { status: 201 })
      }
      throw new Error(`Unhandled fetch in test: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<Crypto />)

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add Transaction' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Transaction' })[0]!)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Bitcoin' })).toBeDefined())

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: '0.01' } })
    fireEvent.change(screen.getByLabelText(/Price per BTC/), { target: { value: '100000' } })
    fireEvent.change(screen.getByLabelText(/Location/), { target: { value: locationId } })
    fireEvent.change(screen.getByLabelText(/Date/), { target: { value: '2026-09-01' } })

    const submitButton = () => screen.getByRole('button', { name: /Record buy/i })

    // First attempt fails (simulated network error).
    fireEvent.click(submitButton())
    await waitFor(() => expect(tradeCalls.length).toBe(1))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())

    // Retry the identical submission.
    fireEvent.click(submitButton())
    await waitFor(() => expect(tradeCalls.length).toBe(2))

    const firstKey = tradeCalls[0]!.body.idempotencyKey
    const secondKey = tradeCalls[1]!.body.idempotencyKey
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
  })
})
