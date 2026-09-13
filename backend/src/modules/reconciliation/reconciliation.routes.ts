import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'

const bodySchema = z.object({ accountId: z.string().uuid(), statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), statementBalanceMinor: z.union([z.string().regex(/^-?\d+$/), z.number().int()]).transform(String) })
const paramsSchema = z.object({ id: z.string().uuid() })
const reconciliationJson = { type: 'object', required: ['id', 'userId', 'accountId', 'statementDate', 'statementBalanceMinor', 'calculatedBalanceMinor', 'differenceMinor', 'status'], properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' }, accountId: { type: 'string', format: 'uuid' }, statementDate: { type: 'string', format: 'date' }, statementBalanceMinor: { type: 'string', pattern: '^-?\\d+$' }, calculatedBalanceMinor: { type: 'string', pattern: '^-?\\d+$' }, differenceMinor: { type: 'string', pattern: '^-?\\d+$' }, status: { type: 'string', enum: ['reconciled', 'unreconciled'] } } } as const
const reconciliationBodyJson = { type: 'object', required: ['accountId', 'statementDate', 'statementBalanceMinor'], additionalProperties: false, properties: { accountId: { type: 'string', format: 'uuid' }, statementDate: { type: 'string', format: 'date' }, statementBalanceMinor: { type: 'string', pattern: '^-?\\d+$' } } } as const

export async function reconciliationRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string }) {
  const { prisma } = options
  app.addHook('preHandler', authGuard({ prisma }))
  app.post('/reconciliations', { preHandler: originCheckPreHandler({ APP_ORIGIN: options.appOrigin }), schema: { body: reconciliationBodyJson, response: { 201: reconciliationJson, 400: { type: 'object' }, 404: { type: 'object' } } } }, async (request, reply) => {
    const input = bodySchema.parse(request.body)
    const userId = request.user!.id
    const account = await prisma.financialAccount.findFirst({ where: { id: input.accountId, userId, archivedAt: null } })
    if (!account) return reply.code(404).send({ error: { code: 'UNKNOWN_ACCOUNT', message: 'Account not found.' } })
    const statementDate = new Date(`${input.statementDate}T00:00:00Z`)
    if (Number.isNaN(statementDate.getTime())) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Invalid statement date.' } })
    const effects = await prisma.transactionBalanceEffect.findMany({ where: { accountId: account.id, transaction: { userId, status: 'cleared', occurredOn: { lte: statementDate } } }, select: { deltaMinor: true } })
    const calculated = account.openingBalanceMinor + effects.reduce((sum, effect) => sum + effect.deltaMinor, 0n)
    const statement = BigInt(input.statementBalanceMinor)
    const difference = statement - calculated
    const record = await prisma.reconciliation.create({ data: { userId, accountId: account.id, statementDate, statementBalanceMinor: statement, calculatedBalanceMinor: calculated, differenceMinor: difference, status: difference === 0n ? 'reconciled' : 'unreconciled' } })
    return reply.code(201).send({ id: record.id, userId: record.userId, accountId: record.accountId, statementDate: input.statementDate, statementBalanceMinor: statement.toString(), calculatedBalanceMinor: calculated.toString(), differenceMinor: difference.toString(), status: record.status })
  })
  app.get('/reconciliations', { schema: { response: { 200: { type: 'array', items: reconciliationJson } } } }, async (request) => {
    const rows = await prisma.reconciliation.findMany({ where: { userId: request.user!.id }, orderBy: { statementDate: 'desc' }, take: 50 })
    return rows.map((row) => ({ ...row, statementDate: row.statementDate.toISOString().slice(0, 10), statementBalanceMinor: row.statementBalanceMinor.toString(), calculatedBalanceMinor: row.calculatedBalanceMinor.toString(), differenceMinor: row.differenceMinor.toString() }))
  })
  app.get<{ Params: { id: string } }>('/reconciliations/:id', { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: reconciliationJson, 404: { type: 'object' } } } }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params)
    const record = await prisma.reconciliation.findFirst({ where: { id, userId: request.user!.id } })
    if (!record) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Reconciliation not found.' } })
    return { ...record, statementDate: record.statementDate.toISOString().slice(0, 10), statementBalanceMinor: record.statementBalanceMinor.toString(), calculatedBalanceMinor: record.calculatedBalanceMinor.toString(), differenceMinor: record.differenceMinor.toString() }
  })
}
