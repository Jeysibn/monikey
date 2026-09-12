import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import type { PrismaClient } from '@prisma/client'

const idSchema = z.object({ id: z.string().uuid() })
const tagSchema = z.object({ name: z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}_-]+$/u) })
const transactionTagsSchema = z.object({ tagIds: z.array(z.string().uuid()).max(50) })

export async function tagsRoutes(app: FastifyInstance, opts: { prisma: PrismaClient }): Promise<void> {
  const { prisma } = opts
  app.addHook('preHandler', authGuard({ prisma }))
  app.get('/tags', async (request) => prisma.transactionTag.findMany({ where: { userId: request.user!.id }, orderBy: { name: 'asc' } }))
  app.post('/tags', { preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }) }, async (request, reply) => {
    const input = tagSchema.parse(request.body)
    return reply.code(201).send(await prisma.transactionTag.upsert({ where: { userId_name: { userId: request.user!.id, name: input.name } }, update: {}, create: { userId: request.user!.id, name: input.name } }))
  })
  app.delete<{ Params: { id: string } }>('/tags/:id', { preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }) }, async (request, reply) => {
    const { id } = idSchema.parse(request.params)
    await prisma.transactionTag.deleteMany({ where: { id, userId: request.user!.id } })
    return reply.code(204).send()
  })
  app.get<{ Params: { id: string } }>('/transactions/:id/tags', async (request, reply) => {
    const { id } = idSchema.parse(request.params)
    const transaction = await prisma.transaction.findFirst({ where: { id, userId: request.user!.id } })
    if (!transaction) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transaction not found.' } })
    return prisma.transactionTagOnTransaction.findMany({ where: { transactionId: id }, include: { tag: true }, orderBy: { tag: { name: 'asc' } } }).then((rows) => rows.map((row) => row.tag))
  })
  app.put<{ Params: { id: string } }>('/transactions/:id/tags', { preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }) }, async (request, reply) => {
    const { id } = idSchema.parse(request.params); const { tagIds } = transactionTagsSchema.parse(request.body)
    const transaction = await prisma.transaction.findFirst({ where: { id, userId: request.user!.id } })
    if (!transaction) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transaction not found.' } })
    const tags = await prisma.transactionTag.findMany({ where: { id: { in: tagIds }, userId: request.user!.id }, select: { id: true } })
    if (tags.length !== new Set(tagIds).size) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'One or more tags are not owned by the user.' } })
    await prisma.$transaction([prisma.transactionTagOnTransaction.deleteMany({ where: { transactionId: id } }), prisma.transactionTagOnTransaction.createMany({ data: tagIds.map((tagId) => ({ transactionId: id, tagId })) })])
    return prisma.transactionTag.findMany({ where: { id: { in: tagIds } }, orderBy: { name: 'asc' } })
  })
}
