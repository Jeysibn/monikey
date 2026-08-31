import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'

const frequency = z.enum(['weekly', 'monthly', 'yearly'])
const createSchema = z.object({ merchant: z.string().trim().min(1).max(160), amountMinor: z.number().int().positive(), frequency, nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string().uuid(), categoryId: z.string().uuid(), autopay: z.boolean().default(false) })
const statusSchema = z.object({ status: z.enum(['active', 'paused']) })

function view(item: any) {
  return { id: item.id, userId: item.userId, merchant: item.merchant, amountMinor: Number(item.amountMinor), frequency: item.frequency, nextDueDate: item.nextDueDate.toISOString().slice(0, 10), accountId: item.accountId, categoryId: item.categoryId, autopay: item.autopay, status: item.status, lastPaidDate: item.lastPaidDate?.toISOString().slice(0, 10) ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }
}

export async function recurringRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string }) {
  const requireAuth = authGuard({ prisma: options.prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: options.appOrigin })
  app.get('/recurring', { preHandler: requireAuth }, async (request) => {
    const items = await options.prisma.recurringItem.findMany({ where: { userId: request.user!.id }, orderBy: { nextDueDate: 'asc' } })
    return { items: items.map(view) }
  })
  app.post('/recurring', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const input = createSchema.parse(request.body)
    const [account, category] = await Promise.all([
      options.prisma.financialAccount.findFirst({ where: { id: input.accountId, userId: request.user!.id, archivedAt: null } }),
      options.prisma.category.findFirst({ where: { id: input.categoryId, OR: [{ userId: request.user!.id }, { userId: null }], archivedAt: null, allowsExpense: true } }),
    ])
    if (!account) return reply.code(422).send({ error: { code: 'UNKNOWN_ACCOUNT', message: 'Linked account not found.', field: 'accountId', requestId: request.id } })
    if (!category) return reply.code(422).send({ error: { code: 'UNKNOWN_CATEGORY', message: 'Expense category not found.', field: 'categoryId', requestId: request.id } })
    const item = await options.prisma.recurringItem.create({ data: { userId: request.user!.id, merchant: input.merchant, amountMinor: BigInt(input.amountMinor), frequency: input.frequency, nextDueDate: new Date(`${input.nextDueDate}T00:00:00Z`), accountId: input.accountId, categoryId: input.categoryId, autopay: input.autopay } })
    return reply.code(201).send(view(item))
  })
  app.patch<{ Params: { id: string } }>('/recurring/:id/status', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const input = statusSchema.parse(request.body)
    const item = await options.prisma.recurringItem.updateMany({ where: { id: request.params.id, userId: request.user!.id }, data: { status: input.status } })
    if (item.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurring item not found.', requestId: request.id } })
    const updated = await options.prisma.recurringItem.findFirstOrThrow({ where: { id: request.params.id, userId: request.user!.id } })
    return view(updated)
  })
}
