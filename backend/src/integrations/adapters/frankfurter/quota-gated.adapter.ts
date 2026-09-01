import { FxRateSet, FxRatesProvider } from '../../interfaces/fxRatesProvider.js'
import { tryConsumeApiQuota } from '../../quota/quota.js'

/** Minimal shape needed to read/increment the usage-tracking table. */
export interface QuotaTrackingClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

/**
 * Wraps a live FX provider with plan §18 local quota budget: before
 * delegating, atomically claims one call against today's usage row; if the
 * budget is exhausted it logs a warning and returns empty rates instead of
 * calling the provider (never throws — an FX outage must not crash the worker).
 * Never constructed for the stub path.
 */
export class QuotaGatedFxRatesProvider implements FxRatesProvider {
  constructor(
    private readonly inner: FxRatesProvider,
    private readonly prisma: QuotaTrackingClient,
    private readonly period: () => string, // e.g. dailyPeriod()
    private readonly maxCalls: number,
    private readonly logger: { warn: (obj: unknown, msg?: string) => void } = console,
  ) {}

  async getRates(base: string, quotes: string[], date?: string): Promise<FxRateSet> {
    if (quotes.length === 0) {
      return {
        base,
        rates: {},
        date: date || new Date().toISOString().slice(0, 10),
        fetchedAt: new Date(),
      }
    }

    const allowed = await tryConsumeApiQuota(
      this.prisma,
      'frankfurter',
      this.period(),
      `get_rates_${base}`,
      this.maxCalls,
    )
    if (!allowed) {
      this.logger.warn(
        { provider: 'frankfurter', period: this.period(), maxCalls: this.maxCalls, base },
        'external API quota exhausted; skipping live FX call',
      )
      return {
        base,
        rates: {},
        date: date || new Date().toISOString().slice(0, 10),
        fetchedAt: new Date(),
      }
    }

    return this.inner.getRates(base, quotes, date)
  }
}
