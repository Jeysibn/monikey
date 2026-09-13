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
const goalJson = { type: 'object', required: ['id', 'userId', 'name', 'targetMinor', 'currentMinor', 'currencyCode', 'targetDate', 'completedDate', 'monthlyContributionMinor', 'status', 'active', 'createdAt', 'updatedAt'], properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, targetMinor: { type: 'string', pattern: '^\\d+$' }, currentMinor: { type: 'string', pattern: '^\\d+$' }, currencyCode: { type: 'string', minLength: 3, maxLength: 3 }, targetDate: { type: 'string', format: 'date-time' }, completedDate: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }, monthlyContributionMinor: { anyOf: [{ type: 'string', pattern: '^\\d+$' }, { type: 'null' }] }, status: { type: 'string' }, active: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } } as const
const minorJson = { type: 'string', pattern: '^\\d+$' } as const
const goalBody = { type: 'object', required: ['name', 'targetMinor', 'targetDate'], additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, targetMinor: minorJson, targetDate: { type: 'string', format: 'date' }, monthlyContributionMinor: { anyOf: [minorJson, { type: 'null' }] }, currencyCode: { type: 'string', minLength: 3, maxLength: 3 } } } as const
const updateGoalBody = { type: 'object', additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, targetMinor: minorJson, targetDate: { type: 'string', format: 'date' }, monthlyContributionMinor: { anyOf: [minorJson, { type: 'null' }] } } } as const
const fundGoalBody = { type: 'object', required: ['sourceAccountId', 'amountMinor', 'occurredOn'], additionalProperties: false, properties: { sourceAccountId: { type: 'string', format: 'uuid' }, amountMinor: minorJson, occurredOn: { type: 'string', format: 'date' }, idempotencyKey: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } as const

export async function goalsRoutes(fastify: FastifyInstance, options: { service: GoalsService; ledgerService: LedgerService; prisma: PrismaClient; appOrigin: string }) {
  const { service, ledgerService, prisma, appOrigin } = options
  const f = fastify.withTypeProvider<ZodTypeProvider>()
  const requireAuth = authGuard({ prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: appOrigin })
  f.addHook('preHandler', requireAuth)

  f.post<{ Body: CreateGoalInput }>('/goals', { preHandler: requireOrigin, schema: { body: goalBody, response: { 201: goalJson } } }, async (request, reply) => {
    const input = createGoalSchema.parse(request.body)
    const goal = await service.createGoal(request.user!.id, input)
    return reply.code(201).send({ ...goal, targetMinor: goal.targetMinor, currentMinor: goal.currentMinor, monthlyContributionMinor: goal.monthlyContributionMinor })
  })

  f.patch<{ Params: { id: string }; Body: UpdateGoalInput }>('/goals/:id', { preHandler: requireOrigin, schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, body: updateGoalBody, response: { 200: goalJson } } }, async (request, reply) => {
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

  f.post<{ Params: { id: string }; Body: FundGoalInput }>('/goals/:id/fund', { preHandler: requireOrigin, schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, body: fundGoalBody } }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = goalIdParamSchema.parse(request.params)
    const input = fundGoalSchema.parse(request.body)
    const result = await ledgerService.postTransaction(request.user!.id, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: id, fromAccountId: input.sourceAccountId, toAccountId: null, occurredOn: input.occurredOn, occurredTime: null, amountMinor: BigInt(input.amountMinor), feeMinor: 0n, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: input.idempotencyKey })
    return reply.code(201).send(result)
  })
}
