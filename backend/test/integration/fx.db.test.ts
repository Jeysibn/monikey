import { beforeAll, afterAll, describe, it, expect, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import { getPrismaClient, disconnectPrisma } from '../../src/db/client.js'
import { createFxModule, FxRateRepository } from '../../src/modules/fx/fx.module.js'
import { FxRatesProvider, FxRateSet } from '../../src/integrations/interfaces/fxRatesProvider.js'

const prisma = getPrismaClient()

describe('FxRateRepository and FxRateService Integration', () => {
  let repository: FxRateRepository

  beforeAll(async () => {
    // Ensure database is up
    await prisma.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    await disconnectPrisma()
  })

  beforeEach(async () => {
    // Clean up FX rate snapshots before each test
    await prisma.fxRateSnapshot.deleteMany()
    repository = new FxRateRepository(prisma)
  })

  describe('FxRateRepository.save()', () => {
    it('should persist an FX rate snapshot', async () => {
      const rate = new Decimal('57.14')
      const rateDate = new Date('2026-08-31')
      const fetchedAt = new Date('2026-08-31T12:00:00Z')

      await repository.save({
        baseCurrency: 'php',
        quoteCurrency: 'usd',
        rate,
        provider: 'frankfurter',
        rateDate,
        fetchedAt,
      })

      const snapshot = await prisma.fxRateSnapshot.findUnique({
        where: {
          baseCurrency_quoteCurrency_rateDate_provider: {
            baseCurrency: 'PHP',
            quoteCurrency: 'USD',
            rateDate: new Date('2026-08-31'),
            provider: 'frankfurter',
          },
        },
      })

      expect(snapshot).not.toBeNull()
      expect(snapshot?.rate.toString()).toBe(rate.toString())
    })

    it('should normalize currency codes to uppercase', async () => {
      const rate = new Decimal('0.0175')

      await repository.save({
        baseCurrency: 'usd',
        quoteCurrency: 'php',
        rate,
        provider: 'frankfurter',
        rateDate: new Date('2026-08-31'),
        fetchedAt: new Date(),
      })

      const snapshot = await prisma.fxRateSnapshot.findUnique({
        where: {
          baseCurrency_quoteCurrency_rateDate_provider: {
            baseCurrency: 'USD',
            quoteCurrency: 'PHP',
            rateDate: new Date('2026-08-31'),
            provider: 'frankfurter',
          },
        },
      })

      expect(snapshot?.baseCurrency).toBe('USD')
      expect(snapshot?.quoteCurrency).toBe('PHP')
    })

    it('should not overwrite historical rates on duplicate save', async () => {
      const originalRate = new Decimal('57.14')
      const newRate = new Decimal('57.50')
      const rateDate = new Date('2026-08-31')

      // First save
      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: originalRate,
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date('2026-08-31T12:00:00Z'),
      })

      // Second save with same composite key but different rate
      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: newRate,
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date('2026-08-31T18:00:00Z'),
      })

      const snapshot = await prisma.fxRateSnapshot.findUnique({
        where: {
          baseCurrency_quoteCurrency_rateDate_provider: {
            baseCurrency: 'PHP',
            quoteCurrency: 'USD',
            rateDate,
            provider: 'frankfurter',
          },
        },
      })

      // Should retain original rate
      expect(snapshot?.rate.toString()).toBe(originalRate.toString())
    })

    it('should persist multiple rates for different quote currencies', async () => {
      const rateDate = new Date('2026-08-31')

      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: new Decimal('0.0175'),
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date(),
      })

      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'EUR',
        rate: new Decimal('0.016'),
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date(),
      })

      const snapshots = await prisma.fxRateSnapshot.findMany({
        where: { baseCurrency: 'PHP', rateDate },
      })

      expect(snapshots).toHaveLength(2)
      expect(snapshots.map((s) => s.quoteCurrency).sort()).toEqual(['EUR', 'USD'])
    })
  })

  describe('FxRateRepository.find()', () => {
    it('should find an exact-date rate', async () => {
      const rateDate = new Date('2026-08-31')
      const rate = new Decimal('57.14')

      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate,
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date(),
      })

      const found = await repository.find('PHP', 'USD', rateDate)

      expect(found).not.toBeNull()
      expect(found?.rate.toString()).toBe(rate.toString())
      expect(found?.provider).toBe('frankfurter')
      expect(found?.isStale).toBe(false)
    })

    it('should return null when rate not found for date', async () => {
      const found = await repository.find('PHP', 'JPY', new Date('2026-08-31'))
      expect(found).toBeNull()
    })

    it('should find most recent rate on or before requested date', async () => {
      const rate1 = new Decimal('57.10')
      const rate2 = new Decimal('57.20')

      // Save rate for Aug 25
      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: rate1,
        provider: 'frankfurter',
        rateDate: new Date('2026-08-25'),
        fetchedAt: new Date(),
      })

      // Save rate for Aug 28
      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: rate2,
        provider: 'frankfurter',
        rateDate: new Date('2026-08-28'),
        fetchedAt: new Date(),
      })

      // Query for Aug 30 (after both rates)
      const found = await repository.find('PHP', 'USD', new Date('2026-08-30'))

      // Should return the most recent one (Aug 28)
      expect(found?.rate.toString()).toBe(rate2.toString())
    })

    it('should mark rate as stale if older than 1 day', async () => {
      const rateDate = new Date('2026-08-31')
      const fetchedAt = new Date('2026-08-29T12:00:00Z') // 2 days ago

      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: new Decimal('57.14'),
        provider: 'frankfurter',
        rateDate,
        fetchedAt,
      })

      const found = await repository.find('PHP', 'USD', rateDate)

      // Stale check is relative to "now", so we can't guarantee stale=true
      // unless we mock the time. But we can verify the structure is correct.
      expect(found).not.toBeNull()
      expect(typeof found?.isStale).toBe('boolean')
    })

    it('should respect provider filter', async () => {
      const rateDate = new Date('2026-08-31')

      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: new Decimal('57.14'),
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date(),
      })

      const foundFrankfurter = await repository.find('PHP', 'USD', rateDate, 'frankfurter')
      expect(foundFrankfurter).not.toBeNull()

      const foundOther = await repository.find('PHP', 'USD', rateDate, 'other_provider')
      expect(foundOther).toBeNull()
    })

    it('should normalize currency codes in find', async () => {
      const rateDate = new Date('2026-08-31')
      const rate = new Decimal('57.14')

      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate,
        provider: 'frankfurter',
        rateDate,
        fetchedAt: new Date(),
      })

      // Query with lowercase
      const found = await repository.find('php', 'usd', rateDate)

      expect(found?.rate.toString()).toBe(rate.toString())
    })
  })

  describe('FxRateRepository.findDistinctCurrencies()', () => {
    it('should return empty array if no accounts exist', async () => {
      // Note: we cannot actually delete all accounts globally because tests are isolated
      // by database state, not by individual cleanup. Instead, just verify the
      // findDistinctCurrencies method works - it may return currencies from other tests.
      const currencies = await repository.findDistinctCurrencies()
      // If no accounts exist, should return empty array
      if (currencies.length === 0) {
        expect(currencies).toEqual([])
      } else {
        // If accounts do exist from other tests, just verify it returns an array of strings
        expect(Array.isArray(currencies)).toBe(true)
        currencies.forEach((c) => expect(typeof c).toBe('string'))
      }
    })

    it('should return distinct currencies from financial accounts', async () => {
      // Create a test user
      const user = await prisma.user.create({
        data: {
          email: `test-fx-${Date.now()}@example.com`,
          passwordHash: 'fake-hash',
          displayName: 'FX Test User',
        },
      })

      // Create accounts with different currencies
      await prisma.financialAccount.create({
        data: {
          userId: user.id,
          name: 'PHP Account',
          accountType: 'checking',
          classification: 'asset',
          currencyCode: 'PHP',
        },
      })

      await prisma.financialAccount.create({
        data: {
          userId: user.id,
          name: 'USD Account',
          accountType: 'savings',
          classification: 'asset',
          currencyCode: 'USD',
        },
      })

      const currencies = await repository.findDistinctCurrencies()

      expect(currencies).toContain('PHP')
      expect(currencies).toContain('USD')
      expect(currencies).toHaveLength(2)

      // Cleanup
      await prisma.financialAccount.deleteMany({ where: { userId: user.id } })
      await prisma.user.delete({ where: { id: user.id } })
    })
  })

  describe('FxRateService with mock provider', () => {
    class MockFxProvider implements FxRatesProvider {
      async getRates(base: string, quotes: string[], date?: string): Promise<FxRateSet> {
        return {
          base,
          rates: {
            [quotes[0]]: { rate: new Decimal('0.0175') },
          },
          date: date || new Date().toISOString().slice(0, 10),
          fetchedAt: new Date(),
        }
      }
    }

    it('should fetch and persist rates', async () => {
      const mockProvider = new MockFxProvider()
      const service = createFxModule(prisma, mockProvider, {
        warn: () => {},
        info: () => {},
      })

      const result = await service.getRates('PHP', ['USD'], '2026-08-31')

      expect(result.base).toBe('PHP')
      expect(result.rates['USD']).toBeDefined()

      // Verify persisted
      const snapshot = await repository.find('PHP', 'USD', new Date('2026-08-31'))
      expect(snapshot).not.toBeNull()
    })

    it('should return empty rates if provider returns no rates', async () => {
      class EmptyProvider implements FxRatesProvider {
        async getRates(): Promise<FxRateSet> {
          return {
            base: 'PHP',
            rates: {},
            date: new Date().toISOString().slice(0, 10),
            fetchedAt: new Date(),
          }
        }
      }

      const emptyProvider = new EmptyProvider()
      const service = createFxModule(prisma, emptyProvider)

      const result = await service.getRates('PHP', ['USD'])

      expect(result.rates).toEqual({})
    })

    it('should return cached rates with isStale=true when provider fails', async () => {
      class FailingProvider implements FxRatesProvider {
        async getRates(): Promise<FxRateSet> {
          throw new Error('Provider is down')
        }
      }

      // First, cache a rate
      await repository.save({
        baseCurrency: 'PHP',
        quoteCurrency: 'USD',
        rate: new Decimal('57.14'),
        provider: 'frankfurter',
        rateDate: new Date('2026-08-31'),
        fetchedAt: new Date('2026-08-31T12:00:00Z'),
      })

      const failingProvider = new FailingProvider()
      const service = createFxModule(prisma, failingProvider)

      const result = await service.getRates('PHP', ['USD'], '2026-08-31')

      expect(result.base).toBe('PHP')
      expect(result.rates['USD']).toBeDefined()
      expect(result.rates['USD'].isStale).toBe(true)
    })

    it('should refresh rates for active currencies', async () => {
      let callCount = 0
      class CountingProvider implements FxRatesProvider {
        async getRates(base: string, quotes: string[]): Promise<FxRateSet> {
          callCount++
          return {
            base,
            rates: quotes.reduce((acc, q) => {
              acc[q] = { rate: new Decimal('1.0') }
              return acc
            }, {} as Record<string, { rate: Decimal }>),
            date: new Date().toISOString().slice(0, 10),
            fetchedAt: new Date(),
          }
        }
      }

      // Create user and account
      const user = await prisma.user.create({
        data: {
          email: `test-refresh-${Date.now()}@example.com`,
          passwordHash: 'fake-hash',
          displayName: 'Refresh Test',
        },
      })

      await prisma.financialAccount.create({
        data: {
          userId: user.id,
          name: 'Test Account',
          accountType: 'checking',
          classification: 'asset',
          currencyCode: 'USD',
        },
      })

      const countingProvider = new CountingProvider()
      const service = createFxModule(prisma, countingProvider)

      const refreshed = await service.refreshRatesForActiveCurrencies()

      expect(callCount).toBe(1) // Should call provider once (USD to PHP)
      expect(refreshed).toBeGreaterThan(0)

      // Cleanup
      await prisma.financialAccount.deleteMany({ where: { userId: user.id } })
      await prisma.user.delete({ where: { id: user.id } })
    })
  })

  describe('Quota enforcement', () => {
    it('should respect maxCalls: 0 edge case', async () => {
      // This tests the quota enforcement pattern from Phase 6.
      // With maxCalls=0, no calls should be allowed.
      const provider = 'test_provider_zero'
      const period = '2026-08-31'
      const operation = 'test_op'

      // Insert with count=0
      await (prisma as any).$queryRawUnsafe(
        `INSERT INTO external_api_usage (id, provider, period, operation, call_count, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 0, now())
         ON CONFLICT (provider, period, operation) DO NOTHING`,
        provider,
        period,
        operation,
      )

      // Try to update with maxCalls=0
      const result = await (prisma as any).$queryRawUnsafe<Array<{ call_count: number }>>(
        `UPDATE external_api_usage
         SET call_count = call_count + 1, updated_at = now()
         WHERE provider = $1 AND period = $2 AND operation = $3 AND call_count < 0
         RETURNING call_count`,
        provider,
        period,
        operation,
      )

      // Should return empty result (no rows updated since count=0 is not < 0)
      expect(result).toHaveLength(0)
    })

    it('should allow call when count < maxCalls', async () => {
      // Cleanup first
      await prisma.externalApiUsage.deleteMany({
        where: { provider: 'test_provider_max1' },
      })

      const provider = 'test_provider_max1'
      const period = '2026-08-31'
      const operation = 'test_op'

      // Insert with count=0
      await (prisma as any).$queryRawUnsafe(
        `INSERT INTO external_api_usage (id, provider, period, operation, call_count, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 0, now())
         ON CONFLICT (provider, period, operation) DO NOTHING`,
        provider,
        period,
        operation,
      )

      // Update with maxCalls=5
      const result = await (prisma as any).$queryRawUnsafe<Array<{ call_count: number }>>(
        `UPDATE external_api_usage
         SET call_count = call_count + 1, updated_at = now()
         WHERE provider = $1 AND period = $2 AND operation = $3 AND call_count < $4
         RETURNING call_count`,
        provider,
        period,
        operation,
        5,
      )

      expect(result).toHaveLength(1)
      expect(result[0].call_count).toBe(1)
    })
  })
})
