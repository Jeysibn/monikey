import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { getUTCDateForLocalDateTime } from '../../common/timezone.js'

const periodSchema = z.object({ periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), incomePoolMinor: z.number().int().nonnegative().default(0) })
const allocationSchema = z.object({ categoryId: z.string().uuid(), allocatedMinor: z.number().int().nonnegative() })
const categorySchema = z.object({ name: z.string().trim().min(1).max(100), color: z.string().trim().min(1).max(64), budgetable: z.boolean().default(true), allowsIncome: z.boolean().default(false), allowsExpense: z.boolean().default(true) })

// UUID validation for path parameters (D8: malformed UUID handling)
const budgetIdParamSchema = z.object({ id: z.string().uuid('Invalid budget ID format') })

type PeriodWithAllocations = { id: string; userId: string; periodStart: Date; periodEnd: Date; incomePoolMinor: bigint; createdAt: Date; updatedAt: Date; allocations: Array<{ id: string; budgetPeriodId: string; categoryId: string; allocatedMinor: bigint; createdAt: Date; updatedAt: Date }> }

// Computes a server-authoritative `spentMinor` per allocation by summing
// qualifying cleared expense transactions in that category for the period's
// date range. Card payments, income, and goal funding are never counted here
// because they are not `type: 'expense'` (plan §2.2 rule 12/13). This keeps
// the "budget vs actual" figure the frontend renders in sync with the
// server's own transaction ledger instead of a client-side recomputation.
async function attachSpentMinor(prisma: PrismaClient, userId: string, period: PeriodWithAllocations) {
  const categoryIds = period.allocations.map((a) => a.categoryId)
  let spentByCategory = new Map<string, bigint>()
  if (categoryIds.length > 0) {
    const grouped = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'expense',
        status: 'cleared',
        categoryId: { in: categoryIds },
        occurredOn: { gte: period.periodStart, lte: period.periodEnd },
      },
      _sum: { amountMinor: true },
    })
    spentByCategory = new Map(grouped.map((g) => [g.categoryId as string, g._sum.amountMinor ?? 0n]))
  }
  return {
    ...period,
    incomePoolMinor: Number(period.incomePoolMinor),
    allocations: period.allocations.map((a) => ({
      ...a,
      allocatedMinor: Number(a.allocatedMinor),
      spentMinor: Number(spentByCategory.get(a.categoryId) ?? 0n),
    })),
  }
}

export async function budgetRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string }) {
  const { prisma, appOrigin } = options
  app.addHook('preHandler', authGuard({ prisma }))
  app.post('/categories', { preHandler: originCheckPreHandler({ APP_ORIGIN: appOrigin }) }, async (request, reply) => {
    const input = categorySchema.parse(request.body)
    const category = await prisma.category.create({ data: { userId: request.user!.id, ...input } })
    return reply.code(201).send(category)
  })
  app.get('/budgets', async (request) => {
    const periods = await prisma.budgetPeriod.findMany({ where: { userId: request.user!.id }, include: { allocations: true }, orderBy: { periodStart: 'desc' } })
    return Promise.all(periods.map((period) => attachSpentMinor(prisma, request.user!.id, period)))
  })
  app.post('/budgets', { preHandler: originCheckPreHandler({ APP_ORIGIN: appOrigin }) }, async (request, reply) => {
    const input = periodSchema.parse(request.body)
    const userTimezone = request.user!.timezone

    // Parse period dates from local dates to UTC using user's timezone
    // Period start: YYYY-MM-DD at 00:00:00 local → UTC
    const [startYear, startMonth, startDay] = input.periodStart.split('-').map(Number) as [number, number, number]
    const periodStartUTC = getUTCDateForLocalDateTime(startYear, startMonth, startDay, 0, 0, 0, userTimezone)

    // Period end: YYYY-MM-DD at 00:00:00 local → UTC
    const [endYear, endMonth, endDay] = input.periodEnd.split('-').map(Number) as [number, number, number]
    const periodEndUTC = getUTCDateForLocalDateTime(endYear, endMonth, endDay, 0, 0, 0, userTimezone)

    const period = await prisma.budgetPeriod.upsert({ where: { userId_periodStart_periodEnd: { userId: request.user!.id, periodStart: periodStartUTC, periodEnd: periodEndUTC } }, create: { userId: request.user!.id, periodStart: periodStartUTC, periodEnd: periodEndUTC, incomePoolMinor: BigInt(input.incomePoolMinor) }, update: { incomePoolMinor: BigInt(input.incomePoolMinor) }, include: { allocations: true } })
    return reply.code(201).send(await attachSpentMinor(prisma, request.user!.id, period))
  })
  app.post<{ Params: { id: string } }>('/budgets/:id/allocations', { preHandler: originCheckPreHandler({ APP_ORIGIN: appOrigin }) }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = budgetIdParamSchema.parse(request.params)
    const input = allocationSchema.parse(request.body)
    const period = await prisma.budgetPeriod.findFirst({ where: { id, userId: request.user!.id } })
    if (!period) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Budget period not found.', requestId: request.id } })

    // Verify the category exists and belongs to the user or is a system category
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, OR: [{ userId: request.user!.id }, { userId: null }] } })
    if (!category) return reply.code(422).send({ error: { code: 'UNKNOWN_CATEGORY', message: 'Category not found.', field: 'categoryId', requestId: request.id } })

    const allocation = await prisma.budgetAllocation.upsert({ where: { budgetPeriodId_categoryId: { budgetPeriodId: period.id, categoryId: input.categoryId } }, create: { budgetPeriodId: period.id, categoryId: input.categoryId, allocatedMinor: BigInt(input.allocatedMinor) }, update: { allocatedMinor: BigInt(input.allocatedMinor) } })
    const summary = await attachSpentMinor(prisma, request.user!.id, { ...period, allocations: [allocation] })
    return reply.code(201).send(summary.allocations[0])
  })
}
