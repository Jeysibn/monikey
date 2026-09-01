import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authGuard } from '../../common/auth/authGuard.js';
import { originCheckPreHandler } from '../../common/auth/originCheck.js';
import type { PrismaClient } from '@prisma/client';
import { AccountsService } from './accounts.service.js';
import { createAccountSchema, createCreditCardSchema, updateAccountSchema } from './accounts.schemas.js';
import type { CreateAccountInput, CreateCreditCardInput, UpdateAccountInput } from './accounts.schemas.js';

// UUID validation for path parameters (D8: malformed UUID handling)
const idParamSchema = z.object({ id: z.string().uuid('Invalid account ID format') });

export async function accountsRoutes(fastify: FastifyInstance, options: { service: AccountsService; prisma: PrismaClient }) {
  const { service, prisma } = options;
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook('preHandler', authGuard({ prisma }));

  // GET /accounts
  f.get(
    '/accounts',
    async (req) => {
      const accounts = await service.listAccounts(req.user!.id);
      return accounts;
    }
  );

  // POST /accounts
  f.post<{ Body: CreateAccountInput }>(
    '/accounts',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      const account = await service.createAccount(req.user!.id, createAccountSchema.parse(req.body));
      return reply.code(201).send(account);
    }
  );

  // POST /credit-cards
  f.post<{ Body: CreateCreditCardInput }>(
    '/credit-cards',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      const account = await service.createCreditCard(req.user!.id, createCreditCardSchema.parse(req.body));
      return reply.code(201).send(account);
    }
  );

  // PATCH /accounts/:id
  f.patch<{ Params: { id: string }; Body: UpdateAccountInput }>(
    '/accounts/:id',
    {
      schema: { params: idParamSchema },
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req) => {
      const account = await service.updateAccount(req.user!.id, req.params.id, updateAccountSchema.parse(req.body));
      return account;
    }
  );

  // POST /accounts/:id/archive
  f.post<{ Params: { id: string } }>(
    '/accounts/:id/archive',
    {
      schema: { params: idParamSchema },
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      await service.archiveAccount(req.user!.id, req.params.id);
      return reply.code(204).send();
    }
  );
}
