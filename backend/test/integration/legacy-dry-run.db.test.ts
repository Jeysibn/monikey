// Stage 7A legacy compatibility dry-run: seeds representative legacy rows (including a legacy auto-posted recurring
// expense created the way the OLD worker did, with the guard flag), runs the read-only report, and proves it changes nothing.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { runLegacyDryRun } from '../../scripts/legacy-dry-run.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

describeIfDb('legacy data dry-run (read-only, real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const email = `legacy-${randomUUID()}@monikey.test`
  afterAll(async () => { await prisma.user.deleteMany({ where: { email } }); await prisma.$disconnect() })

  const fingerprint = async (userId: string) => ({
    accounts: await prisma.financialAccount.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    items: await prisma.recurringItem.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    txs: await prisma.transaction.count({ where: { userId } }),
    periods: await prisma.budgetPeriod.count({ where: { userId } }),
    occ: await prisma.recurringOccurrence.count({ where: { recurringItem: { userId } } }),
  })

  it('reports every legacy anomaly class, keeps legacy rows readable, and writes nothing', async () => {
    const [{ current_database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(current_database).toMatch(/test/i)
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', displayName: 'Legacy' } })
    const userId = user.id
    const mk = (name: string, extra: Record<string, unknown> = {}) => prisma.financialAccount.create({ data: { userId, name, accountType: 'checking', classification: 'asset', openingBalanceMinor: 100000n, currentBalanceMinor: 100000n, ...extra } })
    const main = await mk('Main', { favoriteRank: 1 })
    const old = await mk('Old', { archivedAt: new Date('2025-01-01'), favoriteRank: 2 })
    const cat = await prisma.category.create({ data: { userId, name: `Arch ${randomUUID().slice(0, 6)}`, color: '#123', allowsExpense: true, archivedAt: new Date('2025-01-01') } })
    const mkItem = (merchant: string, extra: Record<string, unknown>) => prisma.recurringItem.create({ data: { userId, merchant, amountMinor: 50000n, frequency: 'monthly', nextDueDate: new Date('2026-09-30'), accountId: main.id, categoryId: cat.id, ...extra } as never })
    const drifted = await mkItem('Drifted', {}) // null anchor, due day 30
    await mkItem('OnArchived', { accountId: old.id, anchorDay: 15, nextDueDate: new Date('2026-09-15') })
    await mkItem('AutoPaused', { status: 'paused', anchorDay: 5, nextDueDate: new Date('2026-09-05') })
    // legacy auto-posted expense (old worker format), not advanced -> stale due date, no occurrence row
    const legacyKey = `recurring:${drifted.id}:2026-09-30`
    const legacyTx = randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.recurring_confirmation','on',true)`
      await tx.transaction.create({ data: { id: legacyTx, userId, type: 'expense', title: 'Drifted', categoryId: cat.id, fromAccountId: main.id, occurredOn: new Date('2026-09-30'), amountMinor: 50000n, source: 'recurring', status: 'cleared', idempotencyKey: legacyKey } })
    })
    await prisma.budgetPeriod.create({ data: { userId, periodStart: new Date('2026-09-05'), periodEnd: new Date('2026-10-04'), incomePoolMinor: 0n } })
    await prisma.dailyFinanceSnapshot.createMany({ data: [
      { userId, snapshotDate: new Date('2026-09-01'), assetTotalMinor: 10n, liabilityTotalMinor: 0n, netWorthMinor: 10n },
      { userId, snapshotDate: new Date('2026-09-05'), assetTotalMinor: 10n, liabilityTotalMinor: 0n, netWorthMinor: 99n },
    ] })

    const before = await fingerprint(userId)
    const report = await runLegacyDryRun(prisma)
    const after = await fingerprint(userId)
    expect(after).toEqual(before)

    expect(report.favoriteRankAnomalies!.count).toBeGreaterThanOrEqual(1)
    expect(report.archivedAccountsOnActiveBills!.count).toBeGreaterThanOrEqual(1)
    expect(report.archivedCategoriesOnActiveBills!.count).toBeGreaterThanOrEqual(1)
    expect(report.budgetPeriodsOddDateSemantics!.count).toBeGreaterThanOrEqual(1)
    expect(report.legacyAutoPostedWithoutOccurrence!.count).toBeGreaterThanOrEqual(1)
    expect(report.driftedDueDates!.count).toBeGreaterThanOrEqual(1)
    expect(report.staleDueDateVersusLegacyKeys!.count).toBeGreaterThanOrEqual(1)
    expect(report.pausedBillsPossiblyAutoPaused!.count).toBeGreaterThanOrEqual(1)
    expect(report.netWorthSnapshotGaps!.count).toBeGreaterThanOrEqual(1)
    expect(report.netWorthSnapshotInconsistent!.count).toBeGreaterThanOrEqual(1)

    // legacy rows stay readable through normal ORM reads
    const tx = await prisma.transaction.findUnique({ where: { id: legacyTx } })
    expect(tx?.source).toBe('recurring')
    expect(tx?.amountMinor).toBe(50000n)
  })

  it('the report transaction is database-enforced read-only', async () => {
    await expect(prisma.$transaction(async (t) => { await t.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await t.$executeRawUnsafe(`UPDATE financial_accounts SET name = name WHERE false`) })).rejects.toThrow(/read-only/i)
  })
})
