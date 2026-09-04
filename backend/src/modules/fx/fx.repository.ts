import { Decimal } from '@prisma/client/runtime/library'
import { PrismaClient } from '@prisma/client'

/**
 * FX Rate repository for persisting and querying FX rate snapshots.
 * Implements the FxRepository interface from fx.service.ts.
 */
export class FxRateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Saves an FX rate snapshot. Uses upsert semantics to avoid duplicates:
   * if the (base, quote, date, provider) tuple already exists, the row is reused.
   * Historical rates are never overwritten — future queries for past dates will use
   * the cached rate from that date.
   */
  async save(rate: {
    baseCurrency: string
    quoteCurrency: string
    rate: Decimal
    provider: string
    rateDate: Date
    fetchedAt: Date
  }): Promise<void> {
    // Normalize currencies to uppercase
    const baseCurrency = rate.baseCurrency.trim().toUpperCase()
    const quoteCurrency = rate.quoteCurrency.trim().toUpperCase()

    // Normalize rate date to midnight UTC for consistent DATE column storage
    // Extract YYYY-MM-DD and create a UTC date
    const dateStr = rate.rateDate.toISOString().slice(0, 10)
    const rateDate = new Date(`${dateStr}T00:00:00.000Z`)

    // Perform an atomic upsert that never overwrites historical rates.
    // If a unique constraint violation occurs (duplicate key), silently ignore it.
    try {
      await this.prisma.fxRateSnapshot.create({
        data: {
          baseCurrency,
          quoteCurrency,
          rate: rate.rate,
          provider: rate.provider,
          rateDate,
          fetchedAt: rate.fetchedAt,
        },
      })
    } catch (err: unknown) {
      // Only ignore P2002 (unique constraint violation)
      const prismaErr = err as { code?: string }
      if (prismaErr.code !== 'P2002') {
        throw err
      }
      // Silently ignore duplicate key errors—we don't update historical rates
    }
  }

  /**
   * Finds an FX rate for a specific base/quote pair on a given date.
   * First attempts to find a rate for the exact date.
   * If not found, searches for the most recent rate on an earlier date
   * (within a reasonable lookback window).
   * Returns null if no rate is found.
   */
  async find(
    baseCurrency: string,
    quoteCurrency: string,
    date: Date,
    provider?: string,
  ): Promise<{
    rate: Decimal
    provider: string
    rateDate: Date
    fetchedAt: Date
    isStale: boolean
  } | null> {
    const normalizedBase = baseCurrency.trim().toUpperCase()
    const normalizedQuote = quoteCurrency.trim().toUpperCase()

    // Normalize target date to midnight UTC for consistent DATE column queries
    const dateStr = date.toISOString().slice(0, 10)
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`)

    // Try to find exact date first
    let snapshot = await this.prisma.fxRateSnapshot.findFirst({
      where: {
        baseCurrency: normalizedBase,
        quoteCurrency: normalizedQuote,
        rateDate: targetDate,
        ...(provider && { provider }),
      },
      orderBy: { fetchedAt: 'desc' },
    })

    // If not found, search for most recent rate on or before the date (within 90 days)
    if (!snapshot) {
      // Calculate 90 days back from the target date
      const lookbackStartDate = new Date(targetDate)
      lookbackStartDate.setDate(lookbackStartDate.getDate() - 90)
      const lookbackStart = lookbackStartDate

      snapshot = await this.prisma.fxRateSnapshot.findFirst({
        where: {
          baseCurrency: normalizedBase,
          quoteCurrency: normalizedQuote,
          rateDate: {
            lte: targetDate,
            gte: lookbackStart,
          },
          ...(provider && { provider }),
        },
        orderBy: { rateDate: 'desc' },
      })
    }

    if (!snapshot) return null

    // Mark as stale if the rate is more than 1 day old
    const now = new Date()
    const ageMs = now.getTime() - snapshot.fetchedAt.getTime()
    const isStale = ageMs > 24 * 60 * 60 * 1000

    return {
      rate: snapshot.rate,
      provider: snapshot.provider,
      rateDate: snapshot.rateDate,
      fetchedAt: snapshot.fetchedAt,
      isStale,
    }
  }

  /**
   * Finds all distinct currency codes currently used in financial accounts.
   * Returns empty array if no accounts exist.
   */
  async findDistinctCurrencies(): Promise<string[]> {
    const currencies = await this.prisma.financialAccount.findMany({
      distinct: ['currencyCode'],
      select: { currencyCode: true },
    })

    // Also include any currencies from investment instruments
    const instrumentCurrencies = await this.prisma.instrument.findMany({
      distinct: ['currencyCode'],
      where: { userId: { not: null } },
      select: { currencyCode: true },
    })

    const allCurrencies = [
      ...new Set([
        ...currencies.map((c) => c.currencyCode),
        ...instrumentCurrencies.map((c) => c.currencyCode),
      ]),
    ]

    return allCurrencies.sort()
  }
}
