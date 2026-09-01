import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authGuard } from '../../common/auth/authGuard.js';
import { originCheckPreHandler } from '../../common/auth/originCheck.js';
import type { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service.js';
import { postTransactionSchema, reverseTransactionSchema } from './ledger.schemas.js';
import type { PostTransactionInput, ReverseTransactionInput } from './ledger.schemas.js';

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
          },
        },
      },
    },
    async (req) => {
      const { cursor, limit, fromDate, toDate, type, categoryId, accountId } = req.query as any;
      const result = await service.listTransactions({
        userId: req.user!.id,
        cursor,
        limit,
        fromDate,
        toDate,
        type,
        categoryId,
        accountId,
      });
      return result;
    }
  );

  // GET /transactions/:id
  f.get<{ Params: { id: string } }>(
    '/transactions/:id',
    { schema: { params: transactionIdParamSchema } },
    async (req, reply) => {
      const transaction = await service.getTransaction(req.user!.id, req.params.id);
      if (!transaction) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Transaction not found.', requestId: req.id } });
      }
      return transaction;
    }
  );

  // POST /transactions/:id/reverse
  f.post<{ Params: { id: string }; Body: ReverseTransactionInput }>(
    '/transactions/:id/reverse',
    {
      schema: { params: transactionIdParamSchema },
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      const result = await service.reverseTransaction(req.user!.id, req.params.id, reverseTransactionSchema.parse(req.body));
      return reply.code(201).send(result);
    }
  );
}
