import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authGuard } from '../../common/auth/authGuard';
import { originCheck } from '../../common/auth/originCheck';
import { idempotencyKeyHook } from '../../common/idempotency/idempotencyKey';
import { LedgerService } from './ledger.service.js.js.js.js';
import { postTransactionSchema, reverseTransactionSchema } from './ledger.schemas.js.js.js.js';
import type { PostTransactionInput, ReverseTransactionInput } from './ledger.schemas.js.js.js.js';

export async function ledgerRoutes(fastify: FastifyInstance, service: LedgerService) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook('preHandler', authGuard);

  // POST /transactions
  f.post<{ Body: PostTransactionInput }>(
    '/transactions',
    {
      preHandler: [originCheck, idempotencyKeyHook],
      schema: { body: postTransactionSchema },
    },
    async (req, reply) => {
      const result = await service.postTransaction(req.user!.id, req.body);
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
    async (req, reply) => {
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
      preHandler: [originCheck, idempotencyKeyHook],
      schema: { body: reverseTransactionSchema },
    },
    async (req, reply) => {
      const result = await service.reverseTransaction(req.user!.id, req.params.id, req.body);
      return reply.code(201).send(result);
    }
  );
}