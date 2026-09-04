import { Decimal } from '@prisma/client/runtime/library'
import { FxRateSet, FxRatesProvider } from '../../interfaces/fxRatesProvider.js'

/**
 * Frankfurter adapter for FX rates.
 * Public API, no key required.
 * Rate responses are fetched in real-time; caching is handled by the caller (FxRatesModule).
 * https://frankfurter.dev/
 */
export class FrankfurterAdapter implements FxRatesProvider {
  constructor(
    private readonly baseUrl: string = 'https://api.frankfurter.dev',
    private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  ) {}

  async getRates(base: string, quotes: string[], date?: string): Promise<FxRateSet> {
    const normalizedBase = base.trim().toUpperCase()
    const normalizedQuotes = [...new Set(quotes.map((q) => q.trim().toUpperCase()).filter(Boolean))]

    if (normalizedQuotes.length === 0) {
      return {
        base: normalizedBase,
        rates: {},
        date: date || new Date().toISOString().slice(0, 10),
        fetchedAt: new Date(),
      }
    }

    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/latest`)
    url.searchParams.set('from', normalizedBase)
    url.searchParams.set('to', normalizedQuotes.join(','))

    // For historical rates, append the date to the URL path
    let endpoint = url.toString()
    if (date) {
      // Frankfurter uses /YYYY-MM-DD?from=...&to=... for historical rates
      endpoint = `${this.baseUrl.replace(/\/$/, '')}/${date}?from=${normalizedBase}&to=${normalizedQuotes.join(',')}`
    }

    const response = await this.fetcher(endpoint, {
      signal: AbortSignal.timeout(5000), // 5-second timeout
    })

    if (!response.ok) {
      throw new Error(`Frankfurter request failed: ${response.status} ${response.statusText}`)
    }

    const body = await response.json() as {
      base?: string
      date?: string
      rates?: Record<string, number>
    }

    const rates: Record<string, { rate: Decimal; isStale?: boolean }> = {}
    if (body.rates) {
      for (const [quote, rate] of Object.entries(body.rates)) {
        if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
          // Store rate as Decimal to avoid floating-point precision issues
          rates[quote] = { rate: new Decimal(rate.toString()) }
        }
      }
    }

    return {
      base: body.base || normalizedBase,
      rates,
      date: body.date || date || new Date().toISOString().slice(0, 10),
      fetchedAt: new Date(),
    }
  }
}
