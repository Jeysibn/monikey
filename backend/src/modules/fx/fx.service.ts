import { Decimal } from '@prisma/client/runtime/library'
import { FxRateSet, FxRatesProvider } from '../../integrations/interfaces/fxRatesProvider.js'

export interface FxRepository {
  save(rate: {
    baseCurrency: string
    quoteCurrency: string
    rate: Decimal
    provider: string
    rateDate: Date
    fetchedAt: Date
  }): Promise<void>

  find(baseCurrency: string, quoteCurrency: string, date: Date, provider?: string): Promise<{
    rate: Decimal
    provider: string
    rateDate: Date
    fetchedAt: Date
    isStale: boolean
  } | null>

  findDistinctCurrencies(): Promise<string[]>
}

/**
 * FX Rate service: fetches rates from provider, caches them, and handles stale fallback.
 * Never throws on provider failure — always returns a rate (stale or fresh) where available.
 */
export class FxRateService {
  constructor(
    private readonly provider: FxRatesProvider,
    private readonly repository: FxRepository,
    private readonly logger: { warn: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void } = console,
  ) {}

  /**
   * Gets FX rates for a base currency against multiple quotes on a specific date.
   * Attempts live fetch first; on provider failure, returns cached rate with isStale: true.
   */
  async getRates(
    base: string,
    quotes: string[],
    date?: string,
  ): Promise<FxRateSet> {
    const targetDate = date ? new Date(date) : new Date()
    const dateStr = date || targetDate.toISOString().slice(0, 10)

    // Try to fetch fresh rates from provider
    try {
      const freshRates = await this.provider.getRates(base, quotes, dateStr)
      if (Object.keys(freshRates.rates).length > 0) {
        // Persist each rate snapshot
        for (const [quoteCurrency, { rate }] of Object.entries(freshRates.rates)) {
          try {
            await this.repository.save({
              baseCurrency: base,
              quoteCurrency,
              rate: rate as Decimal,
              provider: 'frankfurter',
              rateDate: targetDate,
              fetchedAt: new Date(),
            })
          } catch (err) {
            this.logger.warn({ err, base, quoteCurrency }, 'failed to persist FX rate snapshot')
          }
        }
        return freshRates
      }
    } catch (err) {
      this.logger.warn({ err, base, quotes, date: dateStr }, 'FX provider call failed; attempting cached fallback')
    }

    // Provider failed or returned no rates; try cache
    const cachedRates: Record<string, { rate: unknown; isStale: boolean }> = {}
    let anyFound = false
    for (const quote of quotes) {
      const cached = await this.repository.find(base, quote, targetDate)
      if (cached) {
        cachedRates[quote] = {
          rate: cached.rate,
          isStale: true, // Mark as stale since provider failed
        }
        anyFound = true
      }
    }

    if (anyFound) {
      this.logger.info({ base, quoteCount: Object.keys(cachedRates).length }, 'returning cached FX rates (stale)')
      return {
        base,
        rates: cachedRates,
        date: dateStr,
        fetchedAt: new Date(),
      }
    }

    // No fresh rates and no cache; return empty
    return {
      base,
      rates: {},
      date: dateStr,
      fetchedAt: new Date(),
    }
  }

  /**
   * Refreshes FX rates for all currencies currently in use by any user.
   * Called daily by worker; returns count of rates persisted.
   * Strategy: if multiple currencies are in use, fetch cross rates from PHP (or first currency) to all others.
   * If only one currency in use, fetch rates from that currency to PHP to provide conversion reference.
   */
  async refreshRatesForActiveCurrencies(now = new Date()): Promise<number> {
    const currencies = await this.repository.findDistinctCurrencies()
    if (currencies.length === 0) return 0

    // Default to PHP as base if it exists, otherwise pick the first
    const baseCurrency = currencies.includes('PHP') ? 'PHP' : currencies[0]!
    let quoteCurrencies = currencies.filter((c) => c !== baseCurrency)

    // If only one currency in use, fetch rates to PHP (or a common base) if not already base
    if (quoteCurrencies.length === 0 && baseCurrency !== 'PHP') {
      quoteCurrencies = ['PHP']
    }

    if (quoteCurrencies.length === 0) return 0

    const dateStr = now.toISOString().slice(0, 10)
    let saved = 0

    try {
      const rateSet = await this.provider.getRates(baseCurrency, quoteCurrencies, dateStr)
      for (const [quoteCurrency, { rate }] of Object.entries(rateSet.rates)) {
        try {
          await this.repository.save({
            baseCurrency,
            quoteCurrency,
            rate: rate as Decimal,
            provider: 'frankfurter',
            rateDate: new Date(dateStr),
            fetchedAt: new Date(),
          })
          saved += 1
        } catch (err) {
          this.logger.warn({ err, baseCurrency, quoteCurrency }, 'failed to persist refreshed FX rate')
        }
      }
    } catch (err) {
      this.logger.warn({ err, baseCurrency }, 'FX refresh for active currencies failed')
    }

    return saved
  }
}
