import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'

const periodSchema = z.object({ periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), incomePoolMinor: z.number().int().nonnegative().default(0) })
const allocationSchema = z.object({ categoryId: z.string().uuid(), allocatedMinor: z.number().int().nonnegative() })

export async function budgetRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string }) {
  const { prisma, appOrigin } = options
  app.addHook('preHandler', authGuard({ prisma }))
  app.get('/budgets', async (request) => prisma.budgetPeriod.findMany({ where: { userId: request.user!.id }, include: { allocations: true }, orderBy: { periodStart: 'desc' } }))
  app.post('/budgets', { preHandler: originCheckPreHandler({ APP_ORIGIN: appOrigin }) }, async (request, reply) => {
    const input = periodSchema.parse(request.body)
    const period = await prisma.budgetPeriod.upsert({ where: { userId_periodStart_periodEnd: { userId: request.user!.id, periodStart: new Date(`${input.periodStart}T00:00:00Z`), periodEnd: new Date(`${input.periodEnd}T00:00:00Z`) } }, create: { userId: request.user!.id, periodStart: new Date(`${input.periodStart}T00:00:00Z`), periodEnd: new Date(`${input.periodEnd}T00:00:00Z`), incomePoolMinor: BigInt(input.incomePoolMinor) }, update: { incomePoolMinor: BigInt(input.incomePoolMinor) }, include: { allocations: true } })
    return reply.code(201).send({ ...period, incomePoolMinor: Number(period.incomePoolMinor), allocations: period.allocations.map((a) => ({ ...a, allocatedMinor: Number(a.allocatedMinor) })) })
  })
  app.post<{ Params: { id: string } }>('/budgets/:id/allocations', { preHandler: originCheckPreHandler({ APP_ORIGIN: appOrigin }) }, async (request, reply) => {
    const input = allocationSchema.parse(request.body)
    const period = await prisma.budgetPeriod.findFirst({ where: { id: request.params.id, userId: request.user!.id } })
    if (!period) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Budget period not found.', requestId: request.id } })
    const allocation = await prisma.budgetAllocation.upsert({ where: { budgetPeriodId_categoryId: { budgetPeriodId: period.id, categoryId: input.categoryId } }, create: { budgetPeriodId: period.id, categoryId: input.categoryId, allocatedMinor: BigInt(input.allocatedMinor) }, update: { allocatedMinor: BigInt(input.allocatedMinor) } })
    return reply.code(201).send({ ...allocation, allocatedMinor: Number(allocation.allocatedMinor) })
  })
}
