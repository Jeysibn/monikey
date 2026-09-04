import { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import type { LedgerService } from '../ledger/ledger.service.js'
import type { GoalsService } from './goals.service.js'
import { createGoalSchema, updateGoalSchema, fundGoalSchema } from './goals.schemas.js'
import type { CreateGoalInput, UpdateGoalInput, FundGoalInput } from './goals.schemas.js'

// UUID validation for path parameters (D8: malformed UUID handling)
const goalIdParamSchema = z.object({ id: z.string().uuid('Invalid goal ID format') })

export async function goalsRoutes(fastify: FastifyInstance, options: { service: GoalsService; ledgerService: LedgerService; prisma: PrismaClient; appOrigin: string }) {
  const { service, ledgerService, prisma, appOrigin } = options
  const f = fastify.withTypeProvider<ZodTypeProvider>()
  const requireAuth = authGuard({ prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: appOrigin })
  f.addHook('preHandler', requireAuth)

  f.post<{ Body: CreateGoalInput }>('/goals', { preHandler: requireOrigin }, async (request, reply) => {
    const input = createGoalSchema.parse(request.body)
    const goal = await service.createGoal(request.user!.id, input)
    return reply.code(201).send({ ...goal, targetMinor: goal.targetMinor, currentMinor: goal.currentMinor, monthlyContributionMinor: goal.monthlyContributionMinor })
  })

  f.patch<{ Params: { id: string }; Body: UpdateGoalInput }>('/goals/:id', { preHandler: requireOrigin }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = goalIdParamSchema.parse(request.params)
    const input = updateGoalSchema.parse(request.body)
    const goal = await service.updateGoal(request.user!.id, id, input)
    return reply.code(200).send({ ...goal, targetMinor: goal.targetMinor, currentMinor: goal.currentMinor, monthlyContributionMinor: goal.monthlyContributionMinor })
  })

  f.delete<{ Params: { id: string } }>('/goals/:id', { preHandler: requireOrigin }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = goalIdParamSchema.parse(request.params)
    await service.deleteGoal(request.user!.id, id)
    return reply.code(204).send()
  })

  f.post<{ Params: { id: string }; Body: FundGoalInput }>('/goals/:id/fund', { preHandler: requireOrigin }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = goalIdParamSchema.parse(request.params)
    const input = fundGoalSchema.parse(request.body)
    const result = await ledgerService.postTransaction(request.user!.id, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: id, fromAccountId: input.sourceAccountId, toAccountId: null, occurredOn: input.occurredOn, occurredTime: null, amountMinor: input.amountMinor, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: input.idempotencyKey })
    return reply.code(201).send(result)
  })
}
