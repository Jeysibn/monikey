import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { RecurringItem } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { LedgerService } from '../ledger/ledger.service.js'
import { MAX_MINOR_UNITS, minorUnitTransportInput } from '../ledger/ledger.schemas.js'
import { detectMonthlyCandidates } from './detection.js'
import { RecurringService, type RecurringConflict, type RecurringResult } from './recurring.service.js'
import { isoDate } from './recurring.schedule.js'
import { localDateIso } from '../../common/timezone.js'

const frequency = z.enum(['weekly', 'monthly', 'yearly'])
const createSchema = z.object({ merchant: z.string().trim().min(1).max(160), amountMinor: minorUnitTransportInput.pipe(z.bigint().positive()), frequency, nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string().uuid(), categoryId: z.string().uuid(), autopay: z.boolean().default(false) })
const statusSchema = z.object({ status: z.enum(['active', 'paused']) })
const updateSchema = z.object({ merchant: z.string().trim().min(1).max(160).optional(), amountMinor: minorUnitTransportInput.pipe(z.bigint().positive()).optional(), frequency: frequency.optional(), nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), accountId: z.string().uuid().optional(), categoryId: z.string().uuid().optional(), autopay: z.boolean().optional() })

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const confirmSchema = z.object({ expectedDueDate: dateOnly, amountMinor: minorUnitTransportInput.pipe(z.bigint().positive()), accountId: z.string().uuid().optional(), paidOn: dateOnly, allowPossibleDuplicate: z.boolean().optional() })
const cycleSchema = z.object({ expectedDueDate: dateOnly })
const linkSchema = z.object({ expectedDueDate: dateOnly, transactionId: z.string().uuid() })

// UUID validation for path parameters (D8: malformed UUID handling)
const recurringIdParamSchema = z.object({ id: z.string().uuid('Invalid recurring item ID format') })

function view(item: RecurringItem) {
  return { id: item.id, userId: item.userId, merchant: item.merchant, amountMinor: String(item.amountMinor), frequency: item.frequency, nextDueDate: item.nextDueDate.toISOString().slice(0, 10), accountId: item.accountId, categoryId: item.categoryId, autopay: item.autopay, status: item.status, lastPaidDate: item.lastPaidDate?.toISOString().slice(0, 10) ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }
}

const minorJson = { type: 'string', pattern: '^\\d+$' } as const
const validationErrorJson = { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message', 'requestId'], properties: { code: { type: 'string' }, message: { type: 'string' }, field: { type: 'string' }, requestId: { type: 'string' } } } } } as const
const recurringJson = { type: 'object', required: ['id', 'userId', 'merchant', 'amountMinor', 'frequency', 'nextDueDate', 'accountId', 'categoryId', 'autopay', 'status', 'lastPaidDate', 'createdAt', 'updatedAt'], properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' }, merchant: { type: 'string' }, amountMinor: minorJson, frequency: { type: 'string', enum: ['weekly', 'monthly', 'yearly'] }, nextDueDate: { type: 'string', format: 'date' }, accountId: { type: 'string', format: 'uuid' }, categoryId: { type: 'string', format: 'uuid' }, autopay: { type: 'boolean' }, status: { type: 'string', enum: ['active', 'paused'] }, lastPaidDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } } as const
const candidateJson = { type: 'object', required: ['transactionId', 'title', 'amountMinor', 'occurredOn', 'matchedOn'], properties: { transactionId: { type: 'string' }, title: { type: 'string' }, amountMinor: minorJson, occurredOn: { type: 'string' }, accountId: { type: 'string', nullable: true }, categoryId: { type: 'string', nullable: true }, matchedOn: { type: 'array', items: { type: 'string' } } } } as const
const confirmBody = { type: 'object', required: ['expectedDueDate', 'amountMinor', 'paidOn'], additionalProperties: false, properties: { expectedDueDate: { type: 'string', format: 'date' }, amountMinor: minorJson, accountId: { type: 'string', format: 'uuid' }, paidOn: { type: 'string', format: 'date' }, allowPossibleDuplicate: { type: 'boolean' } } } as const
const cycleBody = { type: 'object', required: ['expectedDueDate'], additionalProperties: false, properties: { expectedDueDate: { type: 'string', format: 'date' } } } as const
const linkBody = { type: 'object', required: ['expectedDueDate', 'transactionId'], additionalProperties: false, properties: { expectedDueDate: { type: 'string', format: 'date' }, transactionId: { type: 'string', format: 'uuid' } } } as const
const recurringBody = { type: 'object', required: ['merchant', 'amountMinor', 'frequency', 'nextDueDate', 'accountId', 'categoryId'], additionalProperties: false, properties: { merchant: { type: 'string', minLength: 1, maxLength: 160 }, amountMinor: minorJson, frequency: { type: 'string', enum: ['weekly', 'monthly', 'yearly'] }, nextDueDate: { type: 'string', format: 'date' }, accountId: { type: 'string', format: 'uuid' }, categoryId: { type: 'string', format: 'uuid' }, autopay: { type: 'boolean' } } } as const
const recurringUpdateBody = { ...recurringBody, required: [], properties: { ...recurringBody.properties, merchant: { type: 'string', minLength: 1, maxLength: 160 } } } as const

export async function recurringRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string; ledgerService: LedgerService; confirmationsDisabled?: boolean }) {
  const requireAuth = authGuard({ prisma: options.prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: options.appOrigin })
  const service = new RecurringService(options.prisma, options.ledgerService)
  const todayFor = (request: { user?: { timezone?: string } | null }) => localDateIso(request.user?.timezone ?? 'UTC')
  const disabled = (request: { id: string }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => options.confirmationsDisabled ? reply.code(503).send({ error: { code: 'RECURRING_CONFIRMATION_DISABLED', message: 'Recording recurring payments is temporarily switched off. Nothing was changed.', requestId: request.id } }) : null
  const conflictReply = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, request: { id: string }, c: RecurringConflict) => reply.code(c.status).send({ error: { code: c.code, message: c.message, ...(c.field ? { field: c.field } : {}), requestId: request.id, ...(c.transaction ? { transaction: c.transaction } : {}), ...(c.candidates ? { candidates: c.candidates } : {}) } })
  const paymentReply = (result: Exclude<RecurringResult, RecurringConflict>) => ({ outcome: result.outcome, recurring: view(result.item), occurrence: { dueDate: isoDate(result.occurrence.dueDate), status: result.occurrence.status, transactionId: result.occurrence.transactionId, paidOn: result.occurrence.paidOn ? isoDate(result.occurrence.paidOn) : null }, transaction: result.transaction })
  app.get('/recurring', { preHandler: requireAuth, schema: { response: { 200: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: recurringJson } } } } } }, async (request) => {
    const items = await options.prisma.recurringItem.findMany({ where: { userId: request.user!.id }, orderBy: { nextDueDate: 'asc' } })
    return { items: items.map(view) }
  })
  app.get('/recurring/suggestions', { preHandler: requireAuth, schema: { response: { 200: { type: 'object', required: ['suggestions'], properties: { suggestions: { type: 'array', items: { type: 'object', required: ['merchant', 'amountMinor', 'frequency', 'occurrences', 'explanation'], properties: { merchant: { type: 'string' }, amountMinor: minorJson, frequency: { type: 'string', enum: ['monthly'] }, occurrences: { type: 'integer' }, explanation: { type: 'string' } } } } } } } } }, async (request) => {
    const since = new Date(Date.now() - 366 * 86_400_000)
    const rows = await options.prisma.transaction.findMany({ where: { userId: request.user!.id, type: 'expense', status: 'cleared', occurredOn: { gte: since } }, select: { title: true, amountMinor: true, occurredOn: true }, orderBy: { occurredOn: 'asc' } })
    return { suggestions: detectMonthlyCandidates(rows) }
  })
  app.post('/recurring', { preHandler: [requireOrigin, requireAuth], schema: { body: recurringBody, response: { 201: recurringJson, 422: validationErrorJson } } }, async (request, reply) => {
    const input = createSchema.parse(request.body)
    const [account, category] = await Promise.all([
      options.prisma.financialAccount.findFirst({ where: { id: input.accountId, userId: request.user!.id, archivedAt: null } }),
      options.prisma.category.findFirst({ where: { id: input.categoryId, OR: [{ userId: request.user!.id }, { userId: null }], archivedAt: null, allowsExpense: true } }),
    ])
    if (!account) return reply.code(422).send({ error: { code: 'UNKNOWN_ACCOUNT', message: 'Linked account not found.', field: 'accountId', requestId: request.id } })
    if (!category) return reply.code(422).send({ error: { code: 'UNKNOWN_CATEGORY', message: 'Expense category not found.', field: 'categoryId', requestId: request.id } })
    const item = await options.prisma.recurringItem.create({ data: { userId: request.user!.id, merchant: input.merchant, amountMinor: input.amountMinor, frequency: input.frequency, nextDueDate: new Date(`${input.nextDueDate}T00:00:00Z`), accountId: input.accountId, categoryId: input.categoryId, autopay: input.autopay, anchorDay: Number(input.nextDueDate.slice(8, 10)) } })
    return reply.code(201).send(view(item))
  })
  app.patch<{ Params: { id: string } }>('/recurring/:id/status', { preHandler: [requireOrigin, requireAuth], schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: recurringJson } } }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = recurringIdParamSchema.parse(request.params)
    const input = statusSchema.parse(request.body)
    const item = await options.prisma.recurringItem.updateMany({ where: { id, userId: request.user!.id }, data: { status: input.status } })
    if (item.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurring item not found.', requestId: request.id } })
    const updated = await options.prisma.recurringItem.findFirstOrThrow({ where: { id, userId: request.user!.id } })
    return view(updated)
  })
  const paramsJson = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } as const
  const dateJson = { type: 'string', format: 'date' } as const
  const conflictJson = { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message', 'requestId'], properties: { code: { type: 'string' }, message: { type: 'string' }, field: { type: 'string' }, requestId: { type: 'string' }, transaction: { type: 'object', nullable: true, additionalProperties: true }, candidates: { type: 'array', items: candidateJson } } } } } as const
  const paymentJson = { type: 'object', required: ['outcome', 'recurring', 'occurrence', 'transaction'], properties: { outcome: { type: 'string', enum: ['confirmed', 'replayed', 'reconciled_existing', 'skipped', 'linked'] }, recurring: recurringJson, occurrence: { type: 'object', required: ['dueDate', 'status', 'transactionId', 'paidOn'], properties: { dueDate: dateJson, status: { type: 'string', enum: ['confirmed', 'skipped'] }, transactionId: { type: 'string', nullable: true }, paidOn: { type: 'string', nullable: true } } }, transaction: { type: 'object', nullable: true, additionalProperties: true } } } as const
  const responses = { 200: paymentJson, 201: paymentJson, 404: conflictJson, 409: conflictJson, 422: conflictJson, 503: conflictJson } as const

  // The only route that records a recurring payment. The caller must name the cycle (expectedDueDate); the
  // ledger key is derived from item + cycle, so a retry can never pay a different cycle or post twice.
  app.post<{ Params: { id: string } }>('/recurring/:id/confirm-payment', { preHandler: [requireOrigin, requireAuth], schema: { params: paramsJson, body: confirmBody, response: responses } }, async (request, reply) => {
    const { id } = recurringIdParamSchema.parse(request.params)
    const off = disabled(request, reply); if (off) return off
    const input = confirmSchema.parse(request.body)
    const result = await service.confirm(request.user!.id, id, input, todayFor(request))
    if (result.kind === 'conflict') return conflictReply(reply, request, result)
    return reply.code(result.outcome === 'replayed' ? 200 : 201).send(paymentReply(result))
  })
  app.get<{ Params: { id: string }; Querystring: { dueDate?: string; amountMinor?: string; accountId?: string } }>('/recurring/:id/payment-candidates', { preHandler: requireAuth, schema: { params: paramsJson, querystring: { type: 'object', properties: { dueDate: dateJson, amountMinor: minorJson, accountId: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object', required: ['dueDate', 'candidates'], properties: { dueDate: dateJson, candidates: { type: 'array', items: candidateJson } } }, 404: conflictJson } } }, async (request, reply) => {
    const { id } = recurringIdParamSchema.parse(request.params)
    if (request.query.amountMinor && BigInt(request.query.amountMinor) > MAX_MINOR_UNITS) return conflictReply(reply, request, { kind: 'conflict', status: 422, code: 'VALIDATION_ERROR', message: 'Amount is too large.', field: 'amountMinor' })
    const found = await service.candidates(request.user!.id, id, request.query.dueDate, todayFor(request), request.query.amountMinor ? BigInt(request.query.amountMinor) : undefined, request.query.accountId)
    if (!found) return conflictReply(reply, request, { kind: 'conflict', status: 404, code: 'NOT_FOUND', message: 'Recurring item not found.' })
    return { dueDate: found.dueDate, candidates: found.candidates }
  })
  app.post<{ Params: { id: string } }>('/recurring/:id/skip-cycle', { preHandler: [requireOrigin, requireAuth], schema: { params: paramsJson, body: cycleBody, response: responses } }, async (request, reply) => {
    const { id } = recurringIdParamSchema.parse(request.params)
    const input = cycleSchema.parse(request.body)
    const result = await service.skip(request.user!.id, id, input.expectedDueDate, todayFor(request))
    if (result.kind === 'conflict') return conflictReply(reply, request, result)
    return reply.code(result.outcome === 'replayed' ? 200 : 201).send(paymentReply(result))
  })
  app.post<{ Params: { id: string } }>('/recurring/:id/link-payment', { preHandler: [requireOrigin, requireAuth], schema: { params: paramsJson, body: linkBody, response: responses } }, async (request, reply) => {
    const { id } = recurringIdParamSchema.parse(request.params)
    const off = disabled(request, reply); if (off) return off
    const input = linkSchema.parse(request.body)
    const result = await service.linkExisting(request.user!.id, id, input.expectedDueDate, input.transactionId, todayFor(request))
    if (result.kind === 'conflict') return conflictReply(reply, request, result)
    return reply.code(result.outcome === 'replayed' ? 200 : 201).send(paymentReply(result))
  })
  // Legacy compatibility. It used to post the scheduled amount immediately, without a body. It now goes through
  // the same confirmation service (current cycle only, due or overdue, duplicate warning, atomic, idempotent),
  // recording the scheduled amount and account with today's date as the payment date.
  app.post<{ Params: { id: string } }>('/recurring/:id/mark-paid', { preHandler: [requireOrigin, requireAuth], schema: { params: paramsJson, response: { 201: recurringJson, 404: conflictJson, 409: conflictJson, 422: conflictJson, 503: conflictJson } } }, async (request, reply) => {
    const { id } = recurringIdParamSchema.parse(request.params)
    const off = disabled(request, reply); if (off) return off
    const item = await options.prisma.recurringItem.findFirst({ where: { id, userId: request.user!.id, status: 'active' } })
    if (!item) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Active recurring item not found.', requestId: request.id } })
    const result = await service.confirm(request.user!.id, id, { expectedDueDate: isoDate(item.nextDueDate), amountMinor: item.amountMinor, paidOn: todayFor(request) }, todayFor(request))
    if (result.kind === 'conflict') return conflictReply(reply, request, result)
    return reply.code(201).send(view(result.item))
  })
  app.patch<{ Params: { id: string } }>('/recurring/:id', { preHandler: [requireOrigin, requireAuth], schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, body: recurringUpdateBody, response: { 200: recurringJson } } }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = recurringIdParamSchema.parse(request.params)
    const input = updateSchema.parse(request.body)
    const item = await options.prisma.recurringItem.findFirst({ where: { id, userId: request.user!.id } })
    if (!item) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurring item not found.', requestId: request.id } })
    // Validate referenced account and category if they are being updated
    if (input.accountId || input.categoryId) {
      const [account, category] = await Promise.all([
        input.accountId ? options.prisma.financialAccount.findFirst({ where: { id: input.accountId, userId: request.user!.id, archivedAt: null } }) : Promise.resolve(true),
        input.categoryId ? options.prisma.category.findFirst({ where: { id: input.categoryId, OR: [{ userId: request.user!.id }, { userId: null }], archivedAt: null, allowsExpense: true } }) : Promise.resolve(true),
      ])
      if (input.accountId && !account) return reply.code(422).send({ error: { code: 'UNKNOWN_ACCOUNT', message: 'Linked account not found.', field: 'accountId', requestId: request.id } })
      if (input.categoryId && !category) return reply.code(422).send({ error: { code: 'UNKNOWN_CATEGORY', message: 'Expense category not found.', field: 'categoryId', requestId: request.id } })
    }
    const updateData: Record<string, unknown> = {}
    if (input.merchant !== undefined) updateData.merchant = input.merchant
    if (input.amountMinor !== undefined) updateData.amountMinor = input.amountMinor
    if (input.frequency !== undefined) updateData.frequency = input.frequency
    if (input.nextDueDate !== undefined) { updateData.nextDueDate = new Date(`${input.nextDueDate}T00:00:00Z`); updateData.anchorDay = Number(input.nextDueDate.slice(8, 10)) }
    if (input.accountId !== undefined) updateData.accountId = input.accountId
    if (input.categoryId !== undefined) updateData.categoryId = input.categoryId
    if (input.autopay !== undefined) updateData.autopay = input.autopay
    const updated = await options.prisma.recurringItem.update({ where: { id }, data: updateData })
    return view(updated)
  })
  app.delete<{ Params: { id: string } }>('/recurring/:id', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    // D8: Validate UUID path parameter
    const { id } = recurringIdParamSchema.parse(request.params)
    const item = await options.prisma.recurringItem.findFirst({ where: { id, userId: request.user!.id } })
    if (!item) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurring item not found.', requestId: request.id } })
    await options.prisma.recurringItem.delete({ where: { id } })
    return reply.code(204).send()
  })
}
