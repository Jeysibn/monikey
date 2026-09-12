import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authGuard } from '../../common/auth/authGuard.js';
import { originCheckPreHandler } from '../../common/auth/originCheck.js';
import type { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service.js';
import { postTransactionSchema, reverseTransactionSchema, updateTransactionSchema } from './ledger.schemas.js';
import type { PostTransactionInput, ReverseTransactionInput, UpdateTransactionInput } from './ledger.schemas.js';

// UUID validation for path parameters (D8: malformed UUID handling)
const transactionIdParamSchema = z.object({ id: z.string().uuid('Invalid transaction ID format') });

export async function ledgerRoutes(fastify: FastifyInstance, options: { service: LedgerService; prisma: PrismaClient }) {
  const { service, prisma } = options;
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook('preHandler', authGuard({ prisma }));

  // POST /transactions
  f.post<{ Body: PostTransactionInput }>(
    '/transactions',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      const result = await service.postTransaction(req.user!.id, postTransactionSchema.parse(req.body));
      return reply.code(201).send(result);
    }
  );

  // GET /transactions
  f.get(
    '/transactions',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            fromDate: { type: 'string', format: 'date' },
            toDate: { type: 'string', format: 'date' },
            type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
            categoryId: { type: 'string', format: 'uuid' },
            accountId: { type: 'string', format: 'uuid' },
            tagId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req) => {
      const { cursor, limit, fromDate, toDate, type, categoryId, accountId, tagId } = req.query as any;
      const result = await service.listTransactions({
        userId: req.user!.id,
        cursor,
        limit,
        fromDate,
        toDate,
        type,
        categoryId,
        accountId,
        tagId,
      });
      return result;
    }
  );

  // GET /transactions/:id
  f.get<{ Params: { id: string } }>(
    '/transactions/:id',
    async (req, reply) => {
      // D8: Validate UUID path parameter
      const { id } = transactionIdParamSchema.parse(req.params);
      const transaction = await service.getTransaction(req.user!.id, id);
      if (!transaction) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transaction not found.', requestId: req.id } });
      }
      return transaction;
    }
  );

  f.get<{ Params: { id: string } }>('/transactions/:id/splits', async (req, reply) => {
    const { id } = transactionIdParamSchema.parse(req.params)
    const transaction = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id }, include: { splits: true } })
    if (!transaction) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transaction not found.' } })
    return transaction.splits.map((split) => ({ ...split, amountMinor: split.amountMinor.toString(), createdAt: split.createdAt.toISOString(), updatedAt: split.updatedAt.toISOString() }))
  })

  f.put<{ Params: { id: string } }>('/transactions/:id/splits', { preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }) }, async (req, reply) => {
    const { id } = transactionIdParamSchema.parse(req.params)
    const input = z.object({ splits: z.array(z.object({ categoryId: z.string().uuid(), amountMinor: z.string().regex(/^\d+$/), note: z.string().max(500).optional() })).min(2).max(50) }).parse(req.body)
    const transaction = await prisma.transaction.findFirst({ where: { id, userId: req.user!.id } })
    if (!transaction) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transaction not found.' } })
    const total = input.splits.reduce((sum, split) => sum + BigInt(split.amountMinor), 0n)
    if (total !== transaction.amountMinor) return reply.code(422).send({ error: { code: 'INVALID_REQUEST', message: 'Split amounts must equal the parent transaction amount.' } })
    const categoryIds = [...new Set(input.splits.map((split) => split.categoryId))]
    const categories = await prisma.category.findMany({ where: { id: { in: categoryIds }, OR: [{ userId: req.user!.id }, { userId: null }] }, select: { id: true } })
    if (categories.length !== categoryIds.length) return reply.code(422).send({ error: { code: 'UNKNOWN_CATEGORY', message: 'One or more split categories are not available.' } })
    const splits = await prisma.$transaction(async (tx) => { await tx.transactionSplit.deleteMany({ where: { transactionId: id } }); return Promise.all(input.splits.map((split) => tx.transactionSplit.create({ data: { transactionId: id, categoryId: split.categoryId, amountMinor: BigInt(split.amountMinor), note: split.note } }))) })
    return reply.send(splits.map((split) => ({ ...split, amountMinor: split.amountMinor.toString(), createdAt: split.createdAt.toISOString(), updatedAt: split.updatedAt.toISOString() })))
  })

  // POST /transactions/:id/reverse
  f.post<{ Params: { id: string }; Body: ReverseTransactionInput }>(
    '/transactions/:id/reverse',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      // D8: Validate UUID path parameter
      const { id } = transactionIdParamSchema.parse(req.params);
      const result = await service.reverseTransaction(req.user!.id, id, reverseTransactionSchema.parse(req.body));
      return reply.code(201).send(result);
    }
  );

  // PATCH /transactions/:id
  f.patch<{ Params: { id: string }; Body: UpdateTransactionInput }>(
    '/transactions/:id',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      // D8: Validate UUID path parameter
      const { id } = transactionIdParamSchema.parse(req.params);
      const result = await service.updateTransaction(req.user!.id, id, updateTransactionSchema.parse(req.body));
      return reply.code(200).send(result);
    }
  );

  // DELETE /transactions/:id (uses reversal pattern to maintain audit trail)
  f.delete<{ Params: { id: string } }>(
    '/transactions/:id',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      // D8: Validate UUID path parameter
      const { id } = transactionIdParamSchema.parse(req.params);
      const result = await service.reverseTransaction(req.user!.id, id, {});
      return reply.code(200).send(result);
    }
  );
}
