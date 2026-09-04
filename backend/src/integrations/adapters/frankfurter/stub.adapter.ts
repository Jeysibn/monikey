import { Decimal } from '@prisma/client/runtime/library'
import { FxRateSet, FxRatesProvider } from '../../interfaces/fxRatesProvider.js'

/**
 * Stub FX rates provider for deterministic testing and CI.
 * Returns hard-coded rates for common currency pairs.
 * Never touches network or quota budget.
 */
export class StubFxRatesProvider implements FxRatesProvider {
  private readonly rates: Record<string, Record<string, number>> = {
    PHP: { USD: 0.0175, EUR: 0.016, GBP: 0.0138, JPY: 2.54 },
    USD: { PHP: 57.14, EUR: 0.91, GBP: 0.79, JPY: 145 },
    EUR: { PHP: 61.75, USD: 1.1, GBP: 0.87, JPY: 159.34 },
    GBP: { PHP: 70.99, USD: 1.27, EUR: 1.15, JPY: 183.15 },
    JPY: { PHP: 0.39, USD: 0.0069, EUR: 0.0063, GBP: 0.0055 },
  }

  async getRates(base: string, quotes: string[], date?: string): Promise<FxRateSet> {
    const normalizedBase = base.trim().toUpperCase()
    const normalizedQuotes = [...new Set(quotes.map((q) => q.trim().toUpperCase()).filter(Boolean))]

    const rates: Record<string, { rate: Decimal; isStale?: boolean }> = {}
    const baseRates = this.rates[normalizedBase]
    if (baseRates) {
      for (const quote of normalizedQuotes) {
        const rate = baseRates[quote]
        if (rate) {
          rates[quote] = { rate: new Decimal(rate.toString()) }
        }
      }
    }

    return {
      base: normalizedBase,
      rates,
      date: date || new Date().toISOString().slice(0, 10),
      fetchedAt: new Date(),
    }
  }
}
