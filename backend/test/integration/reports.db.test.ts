// Real-Postgres integration coverage for Phase 7 (Reports & Snapshots).
// Tests report computations against live ledger data, past-dated transactions,
// snapshot rebuild correctness, and user isolation.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  computeReportSummary,
  computeCashFlow,
  computeSpendingByCategory,
  computeNetWorthTrend,
  computeBudgetPerformance,
  computeGoalsReport,
  rebuildSnapshot,
} from '../../src/modules/reports/reports.repository.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

async function makeUser(prisma: PrismaClient, suffix: string, timezone = 'Asia/Manila') {
  const userId = randomUUID()
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@${suffix}.test`,
      passwordHash: 'test',
      displayName: 'Reports Test',
      timezone,
      baseCurrency: 'PHP',
    },
  })
  return userId
}

async function makeAccount(prisma: PrismaClient, userId: string, name: string, type: 'asset' | 'liability' = 'asset', balanceMinor = 0) {
  const accountId = randomUUID()
  await prisma.financialAccount.create({
    data: {
      id: accountId,
      userId,
      name,
      accountType: type === 'asset' ? 'checking' : 'credit_card',
      classification: type,
      currentBalanceMinor: balanceMinor,
      openingBalanceMinor: balanceMinor,
    },
  })
  return accountId
}

async function makeCategory(prisma: PrismaClient, userId: string, name: string, allowsExpense = true) {
  const categoryId = randomUUID()
  await prisma.category.create({
    data: {
      id: categoryId,
      userId,
      name,
      color: '#000',
      allowsExpense,
    },
  })
  return categoryId
}

async function postTransaction(
  prisma: PrismaClient,
  userId: string,
  type: 'income' | 'expense' | 'transfer',
  title: string,
  amountMinor: number,
  occurredOn: Date,
  fromAccountId?: string | null,
  toAccountId?: string | null,
  categoryId?: string | null
) {
  const transactionId = randomUUID()
  await prisma.transaction.create({
    data: {
      id: transactionId,
      userId,
      type,
      title,
      amountMinor,
      feeMinor: 0,
      currencyCode: 'PHP',
      occurredOn,
      source: 'manual',
      status: 'cleared',
      fromAccountId,
      toAccountId,
      categoryId,
    },
  })

  // For expense/income, create balance effects
  if (type === 'expense' && fromAccountId) {
    const account = await prisma.financialAccount.findUnique({ where: { id: fromAccountId } })
    if (account) {
      const newBalance = account.currentBalanceMinor - BigInt(amountMinor)
      await prisma.transactionBalanceEffect.create({
        data: {
          transactionId,
          accountId: fromAccountId,
          role: 'expense',
          deltaMinor: BigInt(-amountMinor),
          balanceAfterMinor: newBalance,
        },
      })
      await prisma.financialAccount.update({ where: { id: fromAccountId }, data: { currentBalanceMinor: newBalance } })
    }
  } else if (type === 'income' && toAccountId) {
    const account = await prisma.financialAccount.findUnique({ where: { id: toAccountId } })
    if (account) {
      const newBalance = account.currentBalanceMinor + BigInt(amountMinor)
      await prisma.transactionBalanceEffect.create({
        data: {
          transactionId,
          accountId: toAccountId,
          role: 'income',
          deltaMinor: BigInt(amountMinor),
          balanceAfterMinor: newBalance,
        },
      })
      await prisma.financialAccount.update({ where: { id: toAccountId }, data: { currentBalanceMinor: newBalance } })
    }
  } else if (type === 'transfer' && fromAccountId && toAccountId) {
    const fromAccount = await prisma.financialAccount.findUnique({ where: { id: fromAccountId } })
    const toAccount = await prisma.financialAccount.findUnique({ where: { id: toAccountId } })
    if (fromAccount && toAccount) {
      const fromNewBalance = fromAccount.currentBalanceMinor - BigInt(amountMinor)
      const toNewBalance = toAccount.currentBalanceMinor + BigInt(amountMinor)

      await prisma.transactionBalanceEffect.create({
        data: {
          transactionId,
          accountId: fromAccountId,
          role: 'source',
          deltaMinor: BigInt(-amountMinor),
          balanceAfterMinor: fromNewBalance,
        },
      })
      await prisma.transactionBalanceEffect.create({
        data: {
          transactionId,
          accountId: toAccountId,
          role: 'destination',
          deltaMinor: BigInt(amountMinor),
          balanceAfterMinor: toNewBalance,
        },
      })

      await prisma.financialAccount.update({ where: { id: fromAccountId }, data: { currentBalanceMinor: fromNewBalance } })
      await prisma.financialAccount.update({ where: { id: toAccountId }, data: { currentBalanceMinor: toNewBalance } })
    }
  }

  return transactionId
}

describeIfDb('ReportsModule (real PostgreSQL)', () => {
  it('computes report summary with income, expenses, and net cash flow for a period', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-summary')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 100000)
      const categoryId = await makeCategory(prisma, userId, 'Food')

      const periodStart = new Date('2026-09-01T00:00:00Z')
      const periodEnd = new Date('2026-09-30T23:59:59Z')

      // Income transaction
      await postTransaction(prisma, userId, 'income', 'Salary', 500000, new Date('2026-09-05T00:00:00Z'), null, accountId)

      // Expense transactions
      await postTransaction(prisma, userId, 'expense', 'Groceries', 50000, new Date('2026-09-10T00:00:00Z'), accountId, null, categoryId)
      await postTransaction(prisma, userId, 'expense', 'Lunch', 30000, new Date('2026-09-15T00:00:00Z'), accountId, null, categoryId)

      // Create a snapshot to represent the period's net worth
      await prisma.dailyFinanceSnapshot.upsert({
        where: { userId_snapshotDate: { userId, snapshotDate: periodEnd } },
        create: {
          userId,
          snapshotDate: periodEnd,
          assetTotalMinor: 520000n,
          liabilityTotalMinor: 0n,
          netWorthMinor: 520000n,
          cardDebtMinor: 0n,
          baseCurrency: 'PHP',
        },
        update: { netWorthMinor: 520000n },
      })

      const summary = await computeReportSummary(prisma, userId, periodStart, periodEnd, 'Asia/Manila')

      expect(summary.income).toBe(500000)
      expect(summary.expenses).toBe(80000)
      expect(summary.netCashFlow).toBe(420000)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('computes cash flow with daily breakdown', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-cashflow')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 100000)

      // Transactions on different dates
      await postTransaction(prisma, userId, 'income', 'Salary', 500000, new Date('2026-09-01T00:00:00Z'), null, accountId)
      await postTransaction(prisma, userId, 'expense', 'Rent', 200000, new Date('2026-09-05T00:00:00Z'), accountId)
      await postTransaction(prisma, userId, 'expense', 'Food', 50000, new Date('2026-09-05T00:00:00Z'), accountId)
      await postTransaction(prisma, userId, 'income', 'Bonus', 100000, new Date('2026-09-10T00:00:00Z'), null, accountId)

      const dateFrom = new Date('2026-09-01T00:00:00Z')
      const dateTo = new Date('2026-09-10T23:59:59Z')

      const cashFlow = await computeCashFlow(prisma, userId, dateFrom, dateTo)

      // Find entries with actual transactions
      const sep1 = cashFlow.find((c) => c.date === '2026-09-01')
      const sep5 = cashFlow.find((c) => c.date === '2026-09-05')
      const sep10 = cashFlow.find((c) => c.date === '2026-09-10')

      expect(sep1?.income).toBe(500000)
      expect(sep1?.expenses).toBe(0)
      expect(sep1?.netFlow).toBe(500000)

      expect(sep5?.income).toBe(0)
      expect(sep5?.expenses).toBe(250000)
      expect(sep5?.netFlow).toBe(-250000)

      expect(sep10?.income).toBe(100000)
      expect(sep10?.expenses).toBe(0)
      expect(sep10?.netFlow).toBe(100000)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('computes spending by category', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-spending')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 100000)
      const foodCategoryId = await makeCategory(prisma, userId, 'Food')
      const transportCategoryId = await makeCategory(prisma, userId, 'Transport')

      const dateFrom = new Date('2026-09-01T00:00:00Z')
      const dateTo = new Date('2026-09-30T23:59:59Z')

      // Food expenses
      await postTransaction(prisma, userId, 'expense', 'Groceries', 50000, new Date('2026-09-05T00:00:00Z'), accountId, null, foodCategoryId)
      await postTransaction(prisma, userId, 'expense', 'Lunch', 20000, new Date('2026-09-10T00:00:00Z'), accountId, null, foodCategoryId)

      // Transport expenses
      await postTransaction(prisma, userId, 'expense', 'Taxi', 30000, new Date('2026-09-12T00:00:00Z'), accountId, null, transportCategoryId)

      const spending = await computeSpendingByCategory(prisma, userId, dateFrom, dateTo)

      const food = spending.find((s) => s.categoryId === foodCategoryId)
      const transport = spending.find((s) => s.categoryId === transportCategoryId)

      expect(food?.spent).toBe(70000)
      expect(transport?.spent).toBe(30000)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('computes net worth trend from daily snapshots', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-networth')
    try {
      // Create snapshots for consecutive days
      await prisma.dailyFinanceSnapshot.create({
        data: {
          userId,
          snapshotDate: new Date('2026-09-01T00:00:00Z'),
          assetTotalMinor: 100000n,
          liabilityTotalMinor: 0n,
          netWorthMinor: 100000n,
          cardDebtMinor: 0n,
          baseCurrency: 'PHP',
        },
      })

      await prisma.dailyFinanceSnapshot.create({
        data: {
          userId,
          snapshotDate: new Date('2026-09-02T00:00:00Z'),
          assetTotalMinor: 150000n,
          liabilityTotalMinor: 0n,
          netWorthMinor: 150000n,
          cardDebtMinor: 0n,
          baseCurrency: 'PHP',
        },
      })

      await prisma.dailyFinanceSnapshot.create({
        data: {
          userId,
          snapshotDate: new Date('2026-09-03T00:00:00Z'),
          assetTotalMinor: 120000n,
          liabilityTotalMinor: 0n,
          netWorthMinor: 120000n,
          cardDebtMinor: 0n,
          baseCurrency: 'PHP',
        },
      })

      const dateFrom = new Date('2026-09-01T00:00:00Z')
      const dateTo = new Date('2026-09-03T23:59:59Z')

      const trend = await computeNetWorthTrend(prisma, userId, dateFrom, dateTo)

      expect(trend).toHaveLength(3)
      expect(trend[0].date).toBe('2026-09-01')
      expect(trend[0].netWorth).toBe(100000)
      expect(trend[1].date).toBe('2026-09-02')
      expect(trend[1].netWorth).toBe(150000)
      expect(trend[2].date).toBe('2026-09-03')
      expect(trend[2].netWorth).toBe(120000)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('rebuilds a snapshot from ledger history and matches transactions', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-rebuild')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 100000)

      // Transaction in the past
      await postTransaction(prisma, userId, 'income', 'Salary', 500000, new Date('2026-09-01T00:00:00Z'), null, accountId)
      await postTransaction(prisma, userId, 'expense', 'Rent', 200000, new Date('2026-09-05T00:00:00Z'), accountId)

      // Rebuild snapshot for Sept 30
      const snapshot = await rebuildSnapshot(prisma, userId, new Date('2026-09-30T00:00:00Z'))

      // Expected: 100000 (opening) + 500000 (income) - 200000 (expense) = 400000
      expect(snapshot.assetTotalMinor).toBe(400000n)
      expect(snapshot.netWorthMinor).toBe(400000n)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('past-dated transactions affect correct historical periods', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-pastdated')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 100000)
      const categoryId = await makeCategory(prisma, userId, 'Food')

      // First create a snapshot for Sept 30
      await prisma.dailyFinanceSnapshot.create({
        data: {
          userId,
          snapshotDate: new Date('2026-09-30T00:00:00Z'),
          assetTotalMinor: 100000n,
          liabilityTotalMinor: 0n,
          netWorthMinor: 100000n,
          cardDebtMinor: 0n,
          baseCurrency: 'PHP',
        },
      })

      // NOW (in October), post a transaction dated Sept 15
      const transactionDate = new Date('2026-09-15T00:00:00Z')
      await postTransaction(prisma, userId, 'expense', 'Past expense', 50000, transactionDate, accountId, null, categoryId)

      // Compute Sept cash flow — should include the retroactive expense
      const septCashFlow = await computeCashFlow(prisma, userId, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z'))
      const sept15 = septCashFlow.find((c) => c.date === '2026-09-15')

      expect(sept15?.expenses).toBe(50000)

      // Rebuild snapshot for Sept 30 — should reflect the retroactive expense
      const sept30Snapshot = await rebuildSnapshot(prisma, userId, new Date('2026-09-30T00:00:00Z'))
      expect(sept30Snapshot.assetTotalMinor).toBe(50000n) // 100k - 50k
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('computes budget performance (allocated vs spent)', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-budget')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 500000)
      const foodCategoryId = await makeCategory(prisma, userId, 'Food')
      const transportCategoryId = await makeCategory(prisma, userId, 'Transport')

      const periodStart = new Date('2026-09-01T00:00:00Z')
      const periodEnd = new Date('2026-09-30T23:59:59Z')

      // Create budget period with allocations
      const period = await prisma.budgetPeriod.create({
        data: {
          userId,
          periodStart,
          periodEnd,
          incomePoolMinor: 0,
        },
      })

      await prisma.budgetAllocation.create({
        data: {
          budgetPeriodId: period.id,
          categoryId: foodCategoryId,
          allocatedMinor: 100000n,
        },
      })

      await prisma.budgetAllocation.create({
        data: {
          budgetPeriodId: period.id,
          categoryId: transportCategoryId,
          allocatedMinor: 50000n,
        },
      })

      // Post expenses
      await postTransaction(prisma, userId, 'expense', 'Groceries', 60000, new Date('2026-09-10T00:00:00Z'), accountId, null, foodCategoryId)
      await postTransaction(prisma, userId, 'expense', 'Taxi', 40000, new Date('2026-09-15T00:00:00Z'), accountId, null, transportCategoryId)

      const performance = await computeBudgetPerformance(prisma, userId, periodStart, periodEnd)

      expect(performance).not.toBeNull()
      expect(performance!.categories).toHaveLength(2)

      const food = performance!.categories.find((c) => c.categoryId === foodCategoryId)
      const transport = performance!.categories.find((c) => c.categoryId === transportCategoryId)

      expect(food?.allocated).toBe(100000)
      expect(food?.spent).toBe(60000)
      expect(food?.remaining).toBe(40000)
      expect(food?.utilization).toBe(60)

      expect(transport?.allocated).toBe(50000)
      expect(transport?.spent).toBe(40000)
      expect(transport?.remaining).toBe(10000)
      expect(transport?.utilization).toBe(80)

      expect(performance?.totalAllocated).toBe(150000)
      expect(performance?.totalSpent).toBe(100000)
      expect(performance?.totalRemaining).toBe(50000)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('computes budget performance with timezone-converted month-exact boundaries (D4 regression)', async () => {
    // D4: Regression test for UTC-vs-timezone offset bug.
    // Budget created for Sept 2026 in Asia/Manila (UTC+8) should be found
    // when querying for the exact same local month boundaries.
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-budget-tz', 'Asia/Manila')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 500000)
      const foodCategoryId = await makeCategory(prisma, userId, 'Food')

      // In Asia/Manila (UTC+8):
      // Local Sept 1, 00:00 = Aug 31, 16:00 UTC
      // Local Oct 1, 00:00 = Sept 30, 16:00 UTC
      // So budget must be stored with these UTC boundaries
      // The budget should be stored in UTC based on the local dates —
      // Since the POST endpoint now converts local dates to UTC, we need to compute
      // what the UTC boundaries should be for a Sept 2026 budget in Asia/Manila
      // Local Sept 1 00:00 in Manila = UTC Aug 31 16:00
      // Local Oct 1 00:00 in Manila = UTC Sept 30 16:00
      const periodStartUTC = new Date('2026-08-31T16:00:00Z')
      const periodEndUTC = new Date('2026-09-30T16:00:00Z')

      // Create budget period directly with correct UTC boundaries
      const period = await prisma.budgetPeriod.create({
        data: {
          userId,
          periodStart: periodStartUTC,
          periodEnd: periodEndUTC,
          incomePoolMinor: 0,
        },
      })

      await prisma.budgetAllocation.create({
        data: {
          budgetPeriodId: period.id,
          categoryId: foodCategoryId,
          allocatedMinor: 150000n,
        },
      })

      // Post expense during Sept (UTC times within the budget period)
      await postTransaction(prisma, userId, 'expense', 'Groceries', 100000, new Date('2026-09-10T12:00:00Z'), accountId, null, foodCategoryId)

      // Query using the same local boundaries that were converted to UTC above
      // This mimics what the GET /reports/budget-performance endpoint does
      const performance = await computeBudgetPerformance(prisma, userId, periodStartUTC, periodEndUTC)

      expect(performance).not.toBeNull()
      expect(performance!.categories).toHaveLength(1)

      const food = performance!.categories.find((c) => c.categoryId === foodCategoryId)
      expect(food?.allocated).toBe(150000)
      expect(food?.spent).toBe(100000)
      expect(food?.remaining).toBe(50000)
      expect(food?.utilization).toBe(67)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('computes goals report with progress', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-goals')
    try {
      // Create goals
      const goal1 = await prisma.goal.create({
        data: {
          userId,
          name: 'Vacation Fund',
          targetMinor: 500000n,
          currentMinor: 200000n,
          targetDate: new Date('2026-12-31'),
          active: true,
        },
      })

      const goal2 = await prisma.goal.create({
        data: {
          userId,
          name: 'Emergency Fund',
          targetMinor: 1000000n,
          currentMinor: 1000000n,
          targetDate: new Date('2026-10-31'),
          completedDate: new Date('2026-09-15'),
          active: true,
        },
      })

      const goalsReport = await computeGoalsReport(prisma, userId, new Date('2026-09-30T00:00:00Z'))

      expect(goalsReport).toHaveLength(2)

      const vacation = goalsReport.find((g) => g.goalId === goal1.id)
      expect(vacation?.target).toBe(500000)
      expect(vacation?.current).toBe(200000)
      expect(vacation?.progress).toBe(40)
      expect(vacation?.completed).toBe(false)

      const emergency = goalsReport.find((g) => g.goalId === goal2.id)
      expect(emergency?.target).toBe(1000000)
      expect(emergency?.current).toBe(1000000)
      expect(emergency?.progress).toBe(100)
      expect(emergency?.completed).toBe(true)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('isolates user data in reports — User A cannot see User B transactions', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userA = await makeUser(prisma, 'reports-isolation-a')
    const userB = await makeUser(prisma, 'reports-isolation-b')
    try {
      const accountA = await makeAccount(prisma, userA, 'Account A', 'asset', 100000)
      const accountB = await makeAccount(prisma, userB, 'Account B', 'asset', 100000)
      const categoryA = await makeCategory(prisma, userA, 'Food')
      const categoryB = await makeCategory(prisma, userB, 'Food')

      // User A posts an expense
      await postTransaction(prisma, userA, 'expense', 'Lunch', 50000, new Date('2026-09-10T00:00:00Z'), accountA, null, categoryA)

      // User B posts a different expense
      await postTransaction(prisma, userB, 'expense', 'Dinner', 60000, new Date('2026-09-10T00:00:00Z'), accountB, null, categoryB)

      const dateFrom = new Date('2026-09-01T00:00:00Z')
      const dateTo = new Date('2026-09-30T23:59:59Z')

      // User A should only see their own spending
      const spendingA = await computeSpendingByCategory(prisma, userA, dateFrom, dateTo)
      const totalSpentA = spendingA.reduce((sum, s) => sum + s.spent, 0)
      expect(totalSpentA).toBe(50000)

      // User B should only see their own spending
      const spendingB = await computeSpendingByCategory(prisma, userB, dateFrom, dateTo)
      const totalSpentB = spendingB.reduce((sum, s) => sum + s.spent, 0)
      expect(totalSpentB).toBe(60000)
    } finally {
      await prisma.user.delete({ where: { id: userA } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: userB } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('snapshot rebuild produces identical totals when run multiple times', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'reports-rebuild-idempotent')
    try {
      const accountId = await makeAccount(prisma, userId, 'Test Account', 'asset', 100000)

      // Post transactions
      await postTransaction(prisma, userId, 'income', 'Salary', 500000, new Date('2026-09-05T00:00:00Z'), null, accountId)
      await postTransaction(prisma, userId, 'expense', 'Rent', 200000, new Date('2026-09-10T00:00:00Z'), accountId)

      const snapshotDate = new Date('2026-09-30T00:00:00Z')

      // Rebuild snapshot twice
      const snapshot1 = await rebuildSnapshot(prisma, userId, snapshotDate)
      const snapshot2 = await rebuildSnapshot(prisma, userId, snapshotDate)

      // Both should produce identical results
      expect(snapshot1.assetTotalMinor).toBe(snapshot2.assetTotalMinor)
      expect(snapshot1.liabilityTotalMinor).toBe(snapshot2.liabilityTotalMinor)
      expect(snapshot1.netWorthMinor).toBe(snapshot2.netWorthMinor)
      expect(snapshot1.cardDebtMinor).toBe(snapshot2.cardDebtMinor)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })
})
