import { FxRatesProvider } from '../../interfaces/fxRatesProvider.js'
import { FrankfurterAdapter } from './frankfurter.adapter.js'
import { StubFxRatesProvider } from './stub.adapter.js'
import { QuotaGatedFxRatesProvider, QuotaTrackingClient } from './quota-gated.adapter.js'
import { dailyPeriod } from '../../quota/quota.js'

export { FrankfurterAdapter, StubFxRatesProvider, QuotaGatedFxRatesProvider }

/**
 * Builds the configured FX rates provider; live mode remains opt-in to avoid quota use in CI.
 */
export function createFxRatesProvider(
  config: {
    FX_PROVIDER?: 'stub' | 'frankfurter'
    FRANKFURTER_BASE_URL?: string
    FRANKFURTER_MAX_CALLS_PER_DAY?: number
  },
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  deps?: { prisma?: QuotaTrackingClient; logger?: { warn: (obj: unknown, msg?: string) => void } },
): FxRatesProvider {
  // Stub mode must never touch the usage table or the network — the `deps`
  // argument (and thus the quota table) is intentionally unread on this path.
  if (config.FX_PROVIDER !== 'frankfurter') return new StubFxRatesProvider()

  let provider: FxRatesProvider = new FrankfurterAdapter(
    config.FRANKFURTER_BASE_URL || 'https://api.frankfurter.dev',
    fetcher,
  )

  // Wrap with quota gating if deps available
  if (deps?.prisma) {
    provider = new QuotaGatedFxRatesProvider(
      provider,
      deps.prisma,
      dailyPeriod,
      config.FRANKFURTER_MAX_CALLS_PER_DAY ?? 100,
      deps.logger,
    )
  }

  return provider
}
