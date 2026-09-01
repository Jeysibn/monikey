import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'

export interface ReportSummary {
  income: number
  expenses: number
  netCashFlow: number
  cardDebtChange: number
  netWorthChange: number
  cardDebtAtEnd: number
  netWorthAtEnd: number
}

export interface CashFlowItem {
  date: string
  income: number
  expenses: number
  netFlow: number
}

export interface SpendingByCategory {
  categoryId: string
  categoryName: string
  spent: number
  budget?: number
  remaining?: number
  utilization?: number
}

export interface NetWorthTrend {
  date: string
  assetTotal: number
  liabilityTotal: number
  netWorth: number
}

export interface BudgetPerformanceCategory {
  categoryId: string
  categoryName: string
  allocated: number
  spent: number
  remaining: number
  utilization: number
}

export interface BudgetPerformance {
  periodStart: string
  periodEnd: string
  categories: BudgetPerformanceCategory[]
  totalAllocated: number
  totalSpent: number
  totalRemaining: number
}

export interface GoalReport {
  goalId: string
  name: string
  target: number
  current: number
  targetDate: string
  monthlyContribution?: number
  progress: number
  completed: boolean
  completedDate?: string
}

export interface InvestmentReport {
  instrumentId: string
  ticker: string
  name: string
  units: number
  currentPrice: number
  marketValue: number
  costBasis: number
  gainLoss: number
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

  const income = Number(incomeSum._sum.amountMinor ?? 0n)
  const expenses = Number(expenseSum._sum.amountMinor ?? 0n)
  const cardDebtAtEnd = Number(cardDebtEndSum._sum.deltaMinor ?? 0n)
  const cardDebtAtStart = Number(cardDebtStartSum._sum.deltaMinor ?? 0n)
  const netWorthAtEnd = endSnapshot?.netWorthMinor ?? 0n
  const netWorthAtStart = startSnapshot?.netWorthMinor ?? 0n

  return {
    income,
    expenses,
    netCashFlow: income - expenses,
    cardDebtChange: cardDebtAtEnd - cardDebtAtStart,
    netWorthChange: Number(netWorthAtEnd - netWorthAtStart),
    cardDebtAtEnd,
    netWorthAtEnd: Number(netWorthAtEnd),
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

  const incomeMap = new Map(incomeByDate.map((g) => [g.occurredOn.toISOString().slice(0, 10), Number(g._sum.amountMinor ?? 0n)]))
  const expenseMap = new Map(expenseByDate.map((g) => [g.occurredOn.toISOString().slice(0, 10), Number(g._sum.amountMinor ?? 0n)]))

  // Build result with all dates in range
  const result: CashFlowItem[] = []
  let current = new Date(dateFrom)
  while (current <= dateTo) {
    const dateStr = current.toISOString().slice(0, 10)
    const income = incomeMap.get(dateStr) ?? 0
    const expenses = expenseMap.get(dateStr) ?? 0
    result.push({
      date: dateStr,
      income,
      expenses,
      netFlow: income - expenses,
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
  const expenses = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      type: 'expense',
      status: 'cleared',
      occurredOn: { gte: dateFrom, lte: dateTo },
    },
    _sum: { amountMinor: true },
  })

  const categories = await prisma.category.findMany({
    where: { userId },
  })

  const categoryMap = new Map(categories.map((c) => [c.id, { name: c.name, budgetable: c.budgetable }]))

  return expenses.map((e) => ({
    categoryId: e.categoryId as string,
    categoryName: categoryMap.get(e.categoryId as string)?.name ?? 'Unknown',
    spent: Number(e._sum.amountMinor ?? 0n),
  }))
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
      assetTotal: Number(s.assetTotalMinor),
      liabilityTotal: Number(s.liabilityTotalMinor),
      netWorth: Number(s.netWorthMinor),
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

  const spentMap = new Map(expensesByCategory.map((e) => [e.categoryId as string, Number(e._sum.amountMinor ?? 0n)]))

  const categories = period.allocations.map((a) => {
    const spent = spentMap.get(a.categoryId) ?? 0
    const allocated = Number(a.allocatedMinor)
    const remaining = allocated - spent
    return {
      categoryId: a.categoryId,
      categoryName: a.category.name,
      allocated,
      spent,
      remaining,
      utilization: allocated > 0 ? Math.round((spent / allocated) * 100) : 0,
    }
  })

  const totalAllocated = categories.reduce((sum, c) => sum + c.allocated, 0)
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0)
  const totalRemaining = categories.reduce((sum, c) => sum + c.remaining, 0)

  return {
    periodStart: period.periodStart.toISOString().slice(0, 10),
    periodEnd: period.periodEnd.toISOString().slice(0, 10),
    categories,
    totalAllocated,
    totalSpent,
    totalRemaining,
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
    target: Number(g.targetMinor),
    current: Number(g.currentMinor),
    targetDate: g.targetDate.toISOString().slice(0, 10),
    monthlyContribution: g.monthlyContributionMinor ? Number(g.monthlyContributionMinor) : undefined,
    progress: g.targetMinor > 0n ? Math.round((Number(g.currentMinor) / Number(g.targetMinor)) * 100) : 0,
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
        units: holding.units.toNumber(),
        currentPrice: currentPriceMinor.toNumber(),
        marketValue: marketValueMinor.toNumber(),
        costBasis: holding.costBasisMinor.toNumber(),
        gainLoss: gainLossMinor.toNumber(),
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
