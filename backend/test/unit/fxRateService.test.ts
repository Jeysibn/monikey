import { Decimal } from '@prisma/client/runtime/library'
import { describe, expect, it, vi } from 'vitest'
import { FxRateService, type FxRepository } from '../../src/modules/fx/fx.service.js'
import type { FxRatesProvider, FxRateSet } from '../../src/integrations/interfaces/fxRatesProvider.js'

function fakeRepository(overrides: Partial<FxRepository> = {}): FxRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue(null),
    findDistinctCurrencies: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

const silentLogger = { warn: () => {}, info: () => {} }

describe('FxRateService.getRates', () => {
  it('defaults to a live-fetch-first strategy (unchanged behavior without preferCache)', async () => {
    const provider: FxRatesProvider = { getRates: vi.fn().mockResolvedValue({ base: 'USD', rates: { PHP: { rate: new Decimal('58.5') } }, date: '2026-09-03', fetchedAt: new Date() } satisfies FxRateSet) }
    const repository = fakeRepository()
    const service = new FxRateService(provider, repository, silentLogger)
    const result = await service.getRates('USD', ['PHP'])
    expect(provider.getRates).toHaveBeenCalledTimes(1)
    expect(result.rates.PHP?.rate).toEqual(new Decimal('58.5'))
  })

  // Regression test: GET /investments used to call getRates() with no options
  // on every page load, always hitting the live provider first even though a
  // daily-refreshed cache already existed for that pair.
  it('with preferCache: true, returns the cached rate without calling the live provider when the cache is complete', async () => {
    const provider: FxRatesProvider = { getRates: vi.fn().mockResolvedValue({ base: 'USD', rates: {}, date: '2026-09-03', fetchedAt: new Date() }) }
    const repository = fakeRepository({
      find: vi.fn().mockResolvedValue({ rate: new Decimal('58.5'), provider: 'frankfurter', rateDate: new Date('2026-09-03'), fetchedAt: new Date(), isStale: false }),
    })
    const service = new FxRateService(provider, repository, silentLogger)
    const result = await service.getRates('USD', ['PHP'], undefined, { preferCache: true })
    expect(provider.getRates).not.toHaveBeenCalled()
    expect(result.rates.PHP).toEqual({ rate: new Decimal('58.5'), isStale: false })
  })

  it('with preferCache: true, falls back to a live fetch when the cache is incomplete', async () => {
    const provider: FxRatesProvider = { getRates: vi.fn().mockResolvedValue({ base: 'USD', rates: { PHP: { rate: new Decimal('58.5') } }, date: '2026-09-03', fetchedAt: new Date() }) }
    const repository = fakeRepository({ find: vi.fn().mockResolvedValue(null) })
    const service = new FxRateService(provider, repository, silentLogger)
    const result = await service.getRates('USD', ['PHP'], undefined, { preferCache: true })
    expect(provider.getRates).toHaveBeenCalledTimes(1)
    expect(result.rates.PHP?.rate).toEqual(new Decimal('58.5'))
  })

  it('falls back to a stale cached rate when the live provider fails', async () => {
    const provider: FxRatesProvider = { getRates: vi.fn().mockRejectedValue(new Error('network down')) }
    const repository = fakeRepository({
      find: vi.fn().mockResolvedValue({ rate: new Decimal('58.5'), provider: 'frankfurter', rateDate: new Date('2026-09-01'), fetchedAt: new Date('2026-09-01'), isStale: true }),
    })
    const service = new FxRateService(provider, repository, silentLogger)
    const result = await service.getRates('USD', ['PHP'])
    expect(result.rates.PHP).toEqual({ rate: new Decimal('58.5'), isStale: true })
  })
})
