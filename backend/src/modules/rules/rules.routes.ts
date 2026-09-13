import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { applyRuleActions, matchesRule } from './rules.engine.js'

const conditions = z.object({ merchantContains: z.string().max(120).optional(), merchantEquals: z.string().max(120).optional(), titleContains: z.string().max(120).optional(), minAmountMinor: z.string().regex(/^\d+$/).optional(), maxAmountMinor: z.string().regex(/^\d+$/).optional(), accountId: z.string().uuid().optional(), type: z.enum(['income', 'expense', 'transfer']).optional(), source: z.enum(['manual', 'ocr', 'recurring', 'import']).optional(), currencyCode: z.string().length(3).optional() })
const actions = z.object({ normalizedMerchant: z.string().max(120).optional(), categoryId: z.string().uuid().optional(), addTags: z.array(z.string().trim().min(1).max(40)).max(20).optional(), note: z.string().max(500).optional(), type: z.enum(['income', 'expense', 'transfer']).optional() })
const ruleInput = z.object({ name: z.string().trim().min(1).max(120), enabled: z.boolean().default(true), priority: z.number().int().min(0).max(10000).default(100), conditions, actions })
const idSchema = z.object({ id: z.string().uuid() })
export async function rulesRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string }) {
  const { prisma } = options
  app.addHook('preHandler', authGuard({ prisma }))
  app.get('/rules', async (req) => prisma.transactionRule.findMany({ where: { userId: req.user!.id }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }))
  app.post('/rules', { preHandler: originCheckPreHandler({ APP_ORIGIN: options.appOrigin }) }, async (req, reply) => reply.code(201).send(await prisma.transactionRule.create({ data: { userId: req.user!.id, ...ruleInput.parse(req.body) } })))
  app.patch<{ Params: { id: string } }>('/rules/:id', { preHandler: originCheckPreHandler({ APP_ORIGIN: options.appOrigin }) }, async (req, reply) => { const { id } = idSchema.parse(req.params); const owned = await prisma.transactionRule.findFirst({ where: { id, userId: req.user!.id } }); if (!owned) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rule not found.' } }); return prisma.transactionRule.update({ where: { id }, data: ruleInput.partial().parse(req.body) }) })
  app.delete<{ Params: { id: string } }>('/rules/:id', { preHandler: originCheckPreHandler({ APP_ORIGIN: options.appOrigin }) }, async (req, reply) => { const { id } = idSchema.parse(req.params); const result = await prisma.transactionRule.deleteMany({ where: { id, userId: req.user!.id } }); return result.count ? reply.code(204).send() : reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rule not found.' } }) })
  app.post('/rules/preview', async (req) => { const input = z.object({ transaction: z.any(), rule: ruleInput.pick({ conditions: true, actions: true }) }).parse(req.body); const tx = { ...input.transaction, amountMinor: BigInt(String(input.transaction.amountMinor)) }; const result = matchesRule(tx, input.rule.conditions) ? applyRuleActions(tx, input.rule.actions) : tx; return { ...result, amountMinor: result.amountMinor.toString() } })
}
