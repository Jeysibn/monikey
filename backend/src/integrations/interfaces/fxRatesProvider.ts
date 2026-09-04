/**
 * FX rates provider interface for multi-currency support.
 * Implementations must fetch rates from external providers or stubs.
 * All rates are persisted as snapshots per (base, quote, date, provider).
 * Rate staleness is explicitly tracked; providers should not silently return stale rates.
 */

export interface FxRateSet {
  base: string
  rates: Record<string, { rate: unknown; isStale?: boolean }>
  date: string // ISO date string (YYYY-MM-DD) — the date for which rates apply
  fetchedAt: Date
}

export interface FxRatesProvider {
  /**
   * Fetches FX rates for a base currency against one or more quote currencies.
   * @param base ISO 4217 currency code (e.g. 'USD', 'PHP')
   * @param quotes ISO 4217 currency codes to convert to
   * @param date Optional ISO date string (YYYY-MM-DD). If omitted, returns today's rates.
   *             For historical queries, the provider should return the rate that was in effect on that date if cached.
   * @returns FxRateSet with rates and staleness indicators.
   *          If the provider is down and a cached rate exists, returns with isStale: true.
   *          Never throws — external failures degrade gracefully.
   */
  getRates(base: string, quotes: string[], date?: string): Promise<FxRateSet>
}
