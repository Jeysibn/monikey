import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { LedgerService } from '../ledger/ledger.service.js'

const createGoalSchema = z.object({ name: z.string().trim().min(1).max(100), targetMinor: z.number().int().positive(), targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), monthlyContributionMinor: z.number().int().positive().nullable().optional(), currencyCode: z.string().length(3).default('PHP') })
const fundGoalSchema = z.object({ sourceAccountId: z.string().uuid(), amountMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), idempotencyKey: z.string().max(128).nullable().optional() })

// UUID validation for path parameters (D8: malformed UUID handling)
const goalIdParamSchema = z.object({ id: z.string().uuid('Invalid goal ID format') })

export async function goalsRoutes(app: FastifyInstance, options: { prisma: PrismaClient; ledgerService: LedgerService; appOrigin: string }) {
  const { prisma, ledgerService, appOrigin } = options
  const requireAuth = authGuard({ prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: appOrigin })
  app.addHook('preHandler', requireAuth)

  app.post('/goals', { preHandler: requireOrigin }, async (request, reply) => {
    const input = createGoalSchema.parse(request.body)
    const goal = await prisma.goal.create({ data: { userId: request.user!.id, name: input.name, targetMinor: BigInt(input.targetMinor), currencyCode: input.currencyCode, targetDate: new Date(`${input.targetDate}T00:00:00Z`), monthlyContributionMinor: input.monthlyContributionMinor == null ? null : BigInt(input.monthlyContributionMinor), status: 'just_started', active: true } })
    return reply.code(201).send({ ...goal, targetMinor: Number(goal.targetMinor), currentMinor: Number(goal.currentMinor), monthlyContributionMinor: goal.monthlyContributionMinor == null ? null : Number(goal.monthlyContributionMinor) })
  })

  app.post<{ Params: { id: string } }>('/goals/:id/fund', { schema: { params: goalIdParamSchema }, preHandler: requireOrigin }, async (request, reply) => {
    const input = fundGoalSchema.parse(request.body)
    const result = await ledgerService.postTransaction(request.user!.id, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: request.params.id, fromAccountId: input.sourceAccountId, toAccountId: null, occurredOn: input.occurredOn, occurredTime: null, amountMinor: input.amountMinor, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: input.idempotencyKey })
    return reply.code(201).send(result)
  })
}
