import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'

export interface ReportSummary {
  income: string
  expenses: string
  netCashFlow: string
  cardDebtChange: string
  netWorthChange: string
  cardDebtAtEnd: string
  netWorthAtEnd: string
}

export interface CashFlowItem {
  date: string
  income: string
  expenses: string
  netFlow: string
}

export interface SpendingByCategory {
  categoryId: string
  categoryName: string
  spent: string
  budget?: number
  remaining?: number
  utilization?: number
}

export interface SpendingByTag { tagId: string; tagName: string; spent: string }

export interface NetWorthTrend {
  date: string
  assetTotal: string
  liabilityTotal: string
  netWorth: string
}

export interface BudgetPerformanceCategory {
  categoryId: string
  categoryName: string
  allocated: string
  spent: string
  remaining: string
  utilization: number
}

export interface BudgetPerformance {
  periodStart: string
  periodEnd: string
  categories: BudgetPerformanceCategory[]
  totalAllocated: string
  totalSpent: string
  totalRemaining: string
}

export interface GoalReport {
  goalId: string
  name: string
  target: string
  current: string
  targetDate: string
  monthlyContribution?: string
  progress: number
  completed: boolean
  completedDate?: string
}

export interface InvestmentReport {
  instrumentId: string
  ticker: string
  name: string
  units: string
  currentPrice: string
  marketValue: string
  costBasis: string
  gainLoss: string
  gainLossPercent: number
}

export async function computeReportSummary(
  prisma: PrismaClient,
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  _userTimezone: string
): Promise<ReportSummary> {
  // userTimezone is used indirectly: period boundaries are calculated in the caller
  // using the user's timezone before being passed to this function.
  // Sum all cleared income transactions in the period
  const incomeSum = await prisma.transaction.aggregate({
    _sum: { amountMinor: true },
    where: {
      userId,
      type: 'income',
      status: 'cleared',
      occurredOn: { gte: periodStart, lte: periodEnd },
    },
  })

  // Sum all cleared expense transactions in the period
  const expenseSum = await prisma.transaction.aggregate({
    _sum: { amountMinor: true },
    where: {
      userId,
      type: 'expense',
      status: 'cleared',
      occurredOn: { gte: periodStart, lte: periodEnd },
    },
  })

  // Get card debt at end of period by summing all cleared card_charge effects
  const cardDebtEndSum = await prisma.transactionBalanceEffect.aggregate({
    _sum: { deltaMinor: true },
    where: {
      account: { userId, classification: 'liability' },
      role: 'card_charge',
      transaction: { occurredOn: { lte: periodEnd } },
    },
  })

  // Get card debt at start of period
  const cardDebtStartSum = await prisma.transactionBalanceEffect.aggregate({
    _sum: { deltaMinor: true },
    where: {
      account: { userId, classification: 'liability' },
      role: 'card_charge',
      transaction: { occurredOn: { lt: periodStart } },
    },
  })

  // Get net worth at end of period
  const endSnapshot = await prisma.dailyFinanceSnapshot.findFirst({
    where: { userId, snapshotDate: { lte: periodEnd } },
    orderBy: { snapshotDate: 'desc' },
  })

  // Get net worth at start of period
  const startSnapshot = await prisma.dailyFinanceSnapshot.findFirst({
    where: { userId, snapshotDate: { lt: periodStart } },
    orderBy: { snapshotDate: 'desc' },
  })

  const income = incomeSum._sum.amountMinor ?? 0n
  const expenses = expenseSum._sum.amountMinor ?? 0n
  const cardDebtAtEnd = cardDebtEndSum._sum.deltaMinor ?? 0n
  const cardDebtAtStart = cardDebtStartSum._sum.deltaMinor ?? 0n
  const netWorthAtEnd = endSnapshot?.netWorthMinor ?? 0n
  const netWorthAtStart = startSnapshot?.netWorthMinor ?? 0n

  return {
    income: income.toString(),
    expenses: expenses.toString(),
    netCashFlow: (income - expenses).toString(),
    cardDebtChange: (cardDebtAtEnd - cardDebtAtStart).toString(),
    netWorthChange: (netWorthAtEnd - netWorthAtStart).toString(),
    cardDebtAtEnd: cardDebtAtEnd.toString(),
    netWorthAtEnd: netWorthAtEnd.toString(),
  }
}

export async function computeCashFlow(
  prisma: PrismaClient,
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<CashFlowItem[]> {
  // Separate income and expense per date
  const incomeByDate = await prisma.transaction.groupBy({
    by: ['occurredOn'],
    where: {
      userId,
      type: 'income',
      status: 'cleared',
      occurredOn: { gte: dateFrom, lte: dateTo },
    },
    _sum: { amountMinor: true },
  })

  const expenseByDate = await prisma.transaction.groupBy({
    by: ['occurredOn'],
    where: {
      userId,
      type: 'expense',
      status: 'cleared',
      occurredOn: { gte: dateFrom, lte: dateTo },
    },
    _sum: { amountMinor: true },
  })

  const incomeMap = new Map(incomeByDate.map((g) => [g.occurredOn.toISOString().slice(0, 10), g._sum.amountMinor ?? 0n]))
  const expenseMap = new Map(expenseByDate.map((g) => [g.occurredOn.toISOString().slice(0, 10), g._sum.amountMinor ?? 0n]))

  // Build result with all dates in range
  const result: CashFlowItem[] = []
  let current = new Date(dateFrom)
  while (current <= dateTo) {
    const dateStr = current.toISOString().slice(0, 10)
    const income = incomeMap.get(dateStr) ?? 0n
    const expenses = expenseMap.get(dateStr) ?? 0n
    result.push({
      date: dateStr,
      income: income.toString(),
      expenses: expenses.toString(),
      netFlow: (income - expenses).toString(),
    })
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
  }

  return result
}

export async function computeSpendingByCategory(
  prisma: PrismaClient,
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<SpendingByCategory[]> {
  const transactions = await prisma.transaction.findMany({
    where: { userId, type: 'expense', status: 'cleared', occurredOn: { gte: dateFrom, lte: dateTo } },
    select: { categoryId: true, amountMinor: true, splits: { select: { categoryId: true, amountMinor: true } } },
  })

  const categories = await prisma.category.findMany({
    where: { OR: [{ userId }, { userId: null }] },
  })

  const categoryMap = new Map(categories.map((c) => [c.id, { name: c.name, budgetable: c.budgetable }]))
  const totals = new Map<string, bigint>()
  for (const transaction of transactions) {
    if (transaction.splits.length > 0) for (const split of transaction.splits) totals.set(split.categoryId, (totals.get(split.categoryId) ?? 0n) + split.amountMinor)
    else if (transaction.categoryId) totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0n) + transaction.amountMinor)
  }

  return [...totals].map(([categoryId, spent]) => ({ categoryId, categoryName: categoryMap.get(categoryId)?.name ?? 'Unknown', spent: spent.toString() }))
}

export async function computeSpendingByTag(prisma: PrismaClient, userId: string, dateFrom: Date, dateTo: Date): Promise<SpendingByTag[]> {
  const rows = await prisma.transactionTagOnTransaction.findMany({ where: { tag: { userId }, transaction: { userId, type: 'expense', status: 'cleared', occurredOn: { gte: dateFrom, lte: dateTo } } }, select: { tagId: true, tag: { select: { name: true } }, transaction: { select: { amountMinor: true, splits: { select: { amountMinor: true } } } } } })
  const totals = new Map<string, { name: string; amount: bigint }>()
  for (const row of rows) {
    const amount = row.transaction.splits.length > 0 ? row.transaction.splits.reduce((sum, split) => sum + split.amountMinor, 0n) : row.transaction.amountMinor
    const current = totals.get(row.tagId)
    totals.set(row.tagId, { name: row.tag.name, amount: (current?.amount ?? 0n) + amount })
  }
  return [...totals].map(([tagId, value]) => ({ tagId, tagName: value.name, spent: value.amount.toString() }))
}

export async function computeNetWorthTrend(
  prisma: PrismaClient,
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<NetWorthTrend[]> {
  const snapshots = await prisma.dailyFinanceSnapshot.findMany({
    where: {
      userId,
      snapshotDate: { gte: dateFrom, lte: dateTo },
    },
    orderBy: { snapshotDate: 'asc' },
  })

  return snapshots.map((s) => {
    const snapshotDateStr = s.snapshotDate instanceof Date
      ? s.snapshotDate.toISOString().slice(0, 10)
      : new Date(s.snapshotDate).toISOString().slice(0, 10)
    return {
      date: snapshotDateStr,
      assetTotal: s.assetTotalMinor.toString(),
      liabilityTotal: s.liabilityTotalMinor.toString(),
      netWorth: s.netWorthMinor.toString(),
    }
  })
}

export async function computeBudgetPerformance(
  prisma: PrismaClient,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BudgetPerformance | null> {
  const period = await prisma.budgetPeriod.findFirst({
    where: {
      userId,
      periodStart: { lte: periodStart },
      periodEnd: { gte: periodEnd },
    },
    include: { allocations: { include: { category: true } } },
  })

  if (!period) {
    return null
  }

  // Compute spent per category
  const expensesByCategory = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      type: 'expense',
      status: 'cleared',
      categoryId: { in: period.allocations.map((a) => a.categoryId) },
      occurredOn: { gte: period.periodStart, lte: period.periodEnd },
    },
    _sum: { amountMinor: true },
  })

  const spentMap = new Map(expensesByCategory.map((e) => [e.categoryId as string, e._sum.amountMinor ?? 0n]))

  const categories = period.allocations.map((a) => {
    const spent = spentMap.get(a.categoryId) ?? 0n
    const allocated = a.allocatedMinor
    const remaining = allocated - spent
    return {
      categoryId: a.categoryId,
      categoryName: a.category.name,
      allocated: allocated.toString(),
      spent: spent.toString(),
      remaining: remaining.toString(),
      utilization: allocated > 0n ? Number((spent * 100n + allocated / 2n) / allocated) : 0,
    }
  })

  const totalAllocated = categories.reduce((sum, c) => sum + BigInt(c.allocated), 0n)
  const totalSpent = categories.reduce((sum, c) => sum + BigInt(c.spent), 0n)
  const totalRemaining = categories.reduce((sum, c) => sum + BigInt(c.remaining), 0n)

  return {
    periodStart: period.periodStart.toISOString().slice(0, 10),
    periodEnd: period.periodEnd.toISOString().slice(0, 10),
    categories,
    totalAllocated: totalAllocated.toString(),
    totalSpent: totalSpent.toString(),
    totalRemaining: totalRemaining.toString(),
  }
}

export async function computeGoalsReport(
  prisma: PrismaClient,
  userId: string,
  _asOf: Date
): Promise<GoalReport[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, active: true },
    include: { contributions: { select: { amountMinor: true } } },
  })

  return goals.map((g) => ({
    goalId: g.id,
    name: g.name,
    target: g.targetMinor.toString(),
    current: g.currentMinor.toString(),
    targetDate: g.targetDate.toISOString().slice(0, 10),
    monthlyContribution: g.monthlyContributionMinor ? g.monthlyContributionMinor.toString() : undefined,
    progress: g.targetMinor > 0n ? Number((g.currentMinor * 100n) / g.targetMinor) : 0,
    completed: g.completedDate != null,
    completedDate: g.completedDate?.toISOString().slice(0, 10),
  }))
}

export async function computeInvestmentsReport(
  prisma: PrismaClient,
  userId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<InvestmentReport[]> {
  // Get all trades for the user in the date range
  const trades = await prisma.investmentTrade.findMany({
    where: {
      userId,
      occurredOn: { gte: dateFrom, lte: dateTo },
    },
    include: { instrument: true },
  })

  if (trades.length === 0) {
    return []
  }

  // Group by instrument to compute holdings
  // Decimal.js (Prisma.Decimal) arithmetic throughout — never route
  // cost-basis/units through a lossy Number division/multiplication
  // chain. `Number(...)` only happens at the final response-serialization
  // boundary below (Defect 3).
  const holdingsByInstrument = new Map<string, { units: Prisma.Decimal; costBasisMinor: Prisma.Decimal }>()

  trades.forEach((t) => {
    const key = t.instrumentId
    const existing = holdingsByInstrument.get(key) ?? { units: new Prisma.Decimal(0), costBasisMinor: new Prisma.Decimal(0) }
    const units = new Prisma.Decimal(t.units.toString())
    const priceMinor = new Prisma.Decimal(t.priceMinor.toString())
    if (t.type === 'buy') {
      existing.units = existing.units.plus(units)
      existing.costBasisMinor = existing.costBasisMinor.plus(units.times(priceMinor))
    } else {
      existing.units = existing.units.minus(units)
      existing.costBasisMinor = existing.costBasisMinor.minus(units.times(priceMinor))
    }
    holdingsByInstrument.set(key, existing)
  })

  // Get latest quote snapshots for each instrument
  const reports: InvestmentReport[] = []
  for (const [instrumentId, holding] of holdingsByInstrument.entries()) {
    const instrument = trades.find((t) => t.instrumentId === instrumentId)?.instrument
    if (!instrument || holding.units.lessThanOrEqualTo(0)) continue

    const quote = await prisma.quoteSnapshot.findFirst({
      where: { instrumentId },
      orderBy: { fetchedAt: 'desc' },
    })

    if (quote) {
      const currentPriceMinor = new Prisma.Decimal(quote.priceMinor.toString())
      const marketValueMinor = currentPriceMinor.times(holding.units)
      const costPerUnitMinor = holding.units.greaterThan(0) ? holding.costBasisMinor.dividedBy(holding.units) : new Prisma.Decimal(0)
      const gainLossMinor = marketValueMinor.minus(holding.costBasisMinor)
      const gainLossPercent = costPerUnitMinor.greaterThan(0) ? gainLossMinor.dividedBy(holding.costBasisMinor).times(100) : new Prisma.Decimal(0)

      // Number conversion only at response serialization boundary
      reports.push({
        instrumentId,
        ticker: instrument.ticker,
        name: instrument.name,
        units: holding.units.toString(),
        currentPrice: currentPriceMinor.round().toFixed(0),
        marketValue: marketValueMinor.round().toFixed(0),
        costBasis: holding.costBasisMinor.round().toFixed(0),
        gainLoss: gainLossMinor.round().toFixed(0),
        gainLossPercent: Math.round(gainLossPercent.toNumber() * 100) / 100,
      })
    }
  }

  return reports
}

/**
 * Rebuilds a snapshot for a specific date by querying all transactions up to that date.
 * Must be called from within a transaction if this is part of a larger operation.
 */
export async function rebuildSnapshot(
  prisma: PrismaClient,
  userId: string,
  snapshotDate: Date
): Promise<{
  assetTotalMinor: bigint
  liabilityTotalMinor: bigint
  netWorthMinor: bigint
  cardDebtMinor: bigint
}> {
  // Get all account balances as of the snapshot date
  const accounts = await prisma.financialAccount.findMany({
    where: { userId },
    include: { creditCardDetail: true },
  })

  let assetTotalMinor = 0n
  let liabilityTotalMinor = 0n
  let cardDebtMinor = 0n

  for (const account of accounts) {
    // Get the last balance effect for this account up to the snapshot date
    const lastEffect = await prisma.transactionBalanceEffect.findFirst({
      where: {
        accountId: account.id,
        transaction: { occurredOn: { lte: snapshotDate } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const balance = lastEffect?.balanceAfterMinor ?? account.openingBalanceMinor

    if (account.classification === 'asset') {
      assetTotalMinor += balance
    } else {
      liabilityTotalMinor += balance
      // For credit card liabilities, the balance is what's owed (positive number)
      if (account.creditCardDetail) {
        cardDebtMinor += balance
      }
    }
  }

  return {
    assetTotalMinor,
    liabilityTotalMinor,
    netWorthMinor: assetTotalMinor - liabilityTotalMinor,
    cardDebtMinor,
  }
}
