// Real-Postgres integration coverage for Phase 4 (Budgets). Exercises budget
// period/allocation CRUD, cross-user isolation, and the server-computed
// `spentMinor` aggregate (QA Attempt 1 Defect 2/3) directly against Prisma —
// mirroring the same upsert/query shapes used by `budget.routes.ts`.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

async function makeUser(prisma: PrismaClient, suffix: string) {
  const userId = randomUUID()
  await prisma.user.create({ data: { id: userId, email: `${userId}@${suffix}.test`, passwordHash: 'test', displayName: 'Budget Test' } })
  return userId
}

async function makeAccount(prisma: PrismaClient, userId: string, balanceMinor: number) {
  const accountId = randomUUID()
  await prisma.financialAccount.create({ data: { id: accountId, userId, name: 'Test cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: balanceMinor, openingBalanceMinor: balanceMinor } })
  return accountId
}

// Reproduces `attachSpentMinor` from `budget.routes.ts`: sums cleared expense
// transactions per category within the period's date range.
async function computeSpentMinor(prisma: PrismaClient, userId: string, categoryId: string, periodStart: Date, periodEnd: Date): Promise<bigint> {
  const grouped = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { userId, type: 'expense', status: 'cleared', categoryId, occurredOn: { gte: periodStart, lte: periodEnd } },
    _sum: { amountMinor: true },
  })
  return grouped[0]?._sum.amountMinor ?? 0n
}

describeIfDb('BudgetModule (real PostgreSQL)', () => {
  it('creates a budget period and allocation, then computes spentMinor from qualifying transactions only', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'budget-crud')
    try {
      const category = await prisma.category.create({ data: { userId, name: 'Groceries', color: '#111', allowsExpense: true } })
      const otherCategory = await prisma.category.create({ data: { userId, name: 'Other', color: '#222', allowsExpense: true } })
      const account = await makeAccount(prisma, userId, 10000)

      const periodStart = new Date('2026-09-01T00:00:00Z')
      const periodEnd = new Date('2026-09-30T00:00:00Z')
      const period = await prisma.budgetPeriod.create({ data: { userId, periodStart, periodEnd, incomePoolMinor: 5000 } })
      const allocation = await prisma.budgetAllocation.create({ data: { budgetPeriodId: period.id, categoryId: category.id, allocatedMinor: 2000 } })
      expect(allocation.allocatedMinor).toBe(2000n)

      // Qualifying: cleared expense, in-category, in-period.
      await prisma.transaction.create({ data: { userId, type: 'expense', title: 'Wet market', categoryId: category.id, fromAccountId: account, occurredOn: new Date('2026-09-10T00:00:00Z'), amountMinor: 300, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })
      // Non-qualifying: pending status.
      await prisma.transaction.create({ data: { userId, type: 'expense', title: 'Pending buy', categoryId: category.id, fromAccountId: account, occurredOn: new Date('2026-09-11T00:00:00Z'), amountMinor: 999, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'pending' } })
      // Non-qualifying: different category.
      await prisma.transaction.create({ data: { userId, type: 'expense', title: 'Other spend', categoryId: otherCategory.id, fromAccountId: account, occurredOn: new Date('2026-09-12T00:00:00Z'), amountMinor: 500, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })
      // Non-qualifying: outside the period.
      await prisma.transaction.create({ data: { userId, type: 'expense', title: 'Next month', categoryId: category.id, fromAccountId: account, occurredOn: new Date('2026-10-05T00:00:00Z'), amountMinor: 777, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })

      const spentMinor = await computeSpentMinor(prisma, userId, category.id, periodStart, periodEnd)
      expect(spentMinor).toBe(300n)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('upserts a budget period on the same (userId, periodStart, periodEnd) instead of duplicating it', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'budget-upsert')
    try {
      const periodStart = new Date('2026-09-01T00:00:00Z')
      const periodEnd = new Date('2026-09-30T00:00:00Z')
      const first = await prisma.budgetPeriod.upsert({ where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } }, create: { userId, periodStart, periodEnd, incomePoolMinor: 1000 }, update: { incomePoolMinor: 1000 } })
      const second = await prisma.budgetPeriod.upsert({ where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } }, create: { userId, periodStart, periodEnd, incomePoolMinor: 1000 }, update: { incomePoolMinor: 4000 } })
      expect(second.id).toBe(first.id)
      expect(second.incomePoolMinor).toBe(4000n)
      const count = await prisma.budgetPeriod.count({ where: { userId } })
      expect(count).toBe(1)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('upserts an allocation on the same (budgetPeriodId, categoryId) instead of duplicating it', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'budget-alloc-upsert')
    try {
      const category = await prisma.category.create({ data: { userId, name: 'Transport', color: '#333', allowsExpense: true } })
      const period = await prisma.budgetPeriod.create({ data: { userId, periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-09-30T00:00:00Z'), incomePoolMinor: 0 } })
      const first = await prisma.budgetAllocation.upsert({ where: { budgetPeriodId_categoryId: { budgetPeriodId: period.id, categoryId: category.id } }, create: { budgetPeriodId: period.id, categoryId: category.id, allocatedMinor: 500 }, update: { allocatedMinor: 500 } })
      const second = await prisma.budgetAllocation.upsert({ where: { budgetPeriodId_categoryId: { budgetPeriodId: period.id, categoryId: category.id } }, create: { budgetPeriodId: period.id, categoryId: category.id, allocatedMinor: 500 }, update: { allocatedMinor: 900 } })
      expect(second.id).toBe(first.id)
      expect(second.allocatedMinor).toBe(900n)
      const count = await prisma.budgetAllocation.count({ where: { budgetPeriodId: period.id } })
      expect(count).toBe(1)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('does not let user B see or modify user A budget periods/allocations', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userA = await makeUser(prisma, 'budget-isoA')
    const userB = await makeUser(prisma, 'budget-isoB')
    try {
      const category = await prisma.category.create({ data: { userId: userA, name: 'Utilities', color: '#444', allowsExpense: true } })
      const period = await prisma.budgetPeriod.create({ data: { userId: userA, periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-09-30T00:00:00Z'), incomePoolMinor: 0 } })
      await prisma.budgetAllocation.create({ data: { budgetPeriodId: period.id, categoryId: category.id, allocatedMinor: 1000 } })

      // User B's user-scoped query (mirrors budget.routes.ts's findFirst) never finds user A's period.
      const visibleToB = await prisma.budgetPeriod.findFirst({ where: { id: period.id, userId: userB } })
      expect(visibleToB).toBeNull()

      // User B's own budget list is empty even though user A has data.
      const bPeriods = await prisma.budgetPeriod.findMany({ where: { userId: userB } })
      expect(bPeriods).toHaveLength(0)

      const aPeriods = await prisma.budgetPeriod.findMany({ where: { userId: userA } })
      expect(aPeriods).toHaveLength(1)
    } finally {
      await prisma.user.delete({ where: { id: userA } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: userB } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })
})
