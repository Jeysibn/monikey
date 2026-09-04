import type { PrismaClient } from '@prisma/client'
import { rebuildSnapshot } from './reports.repository.js'

/**
 * Generates daily finance snapshots for all users.
 * Called once per day by the worker.
 *
 * For each user:
 * 1. Compute current asset/liability/net-worth totals as of today
 * 2. Upsert into daily_finance_snapshots
 *
 * This is rebuildable — if run multiple times on the same date,
 * it will overwrite the previous snapshot with the current ledger state.
 */
export async function generateDailySnapshots(prisma: PrismaClient, forDate: Date): Promise<number> {
  const dateOnly = new Date(Date.UTC(forDate.getUTCFullYear(), forDate.getUTCMonth(), forDate.getUTCDate()))

  // Get all active users
  const users = await prisma.user.findMany({
    select: { id: true, baseCurrency: true },
  })

  let generated = 0

  for (const user of users) {
    const { assetTotalMinor, liabilityTotalMinor, netWorthMinor, cardDebtMinor } = await rebuildSnapshot(
      prisma,
      user.id,
      dateOnly
    )

    await prisma.dailyFinanceSnapshot.upsert({
      where: { userId_snapshotDate: { userId: user.id, snapshotDate: dateOnly } },
      create: {
        userId: user.id,
        snapshotDate: dateOnly,
        assetTotalMinor,
        liabilityTotalMinor,
        netWorthMinor,
        cardDebtMinor,
        baseCurrency: user.baseCurrency,
      },
      update: {
        assetTotalMinor,
        liabilityTotalMinor,
        netWorthMinor,
        cardDebtMinor,
        generatedAt: new Date(),
      },
    })

    generated++
  }

  return generated
}

/**
 * Rebuilds all snapshots for a user between two dates.
 * Useful for backfilling or recovering from data corruption.
 */
export async function rebuildSnapshotsForUserDateRange(
  prisma: PrismaClient,
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new Error(`User ${userId} not found`)
  }

  let current = new Date(dateFrom)
  let count = 0

  while (current <= dateTo) {
    const dateOnly = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()))
    const { assetTotalMinor, liabilityTotalMinor, netWorthMinor, cardDebtMinor } = await rebuildSnapshot(
      prisma,
      userId,
      dateOnly
    )

    await prisma.dailyFinanceSnapshot.upsert({
      where: { userId_snapshotDate: { userId, snapshotDate: dateOnly } },
      create: {
        userId,
        snapshotDate: dateOnly,
        assetTotalMinor,
        liabilityTotalMinor,
        netWorthMinor,
        cardDebtMinor,
        baseCurrency: user.baseCurrency,
      },
      update: {
        assetTotalMinor,
        liabilityTotalMinor,
        netWorthMinor,
        cardDebtMinor,
        generatedAt: new Date(),
      },
    })

    count++
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
  }

  return count
}
