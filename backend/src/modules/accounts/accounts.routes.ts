import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { authGuard } from '../../common/auth/authGuard';
import { originCheck } from '../../common/auth/originCheck';
import { AccountsService } from './accounts.service.js.js.js.js';
import { createAccountSchema, createCreditCardSchema, updateAccountSchema } from './accounts.schemas.js.js.js.js';
import type { CreateAccountInput, CreateCreditCardInput, UpdateAccountInput } from './accounts.schemas.js.js.js.js';

export async function accountsRoutes(fastify: FastifyInstance, service: AccountsService) {
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook('preHandler', authGuard);

  // GET /accounts
  f.get(
    '/accounts',
    async (req, reply) => {
      const accounts = await service.listAccounts(req.user!.id);
      return accounts;
    }
  );

  // POST /accounts
  f.post<{ Body: CreateAccountInput }>(
    '/accounts',
    {
      preHandler: originCheck,
      schema: { body: createAccountSchema },
    },
    async (req, reply) => {
      const account = await service.createAccount(req.user!.id, req.body);
      return reply.code(201).send(account);
    }
  );

  // POST /credit-cards
  f.post<{ Body: CreateCreditCardInput }>(
    '/credit-cards',
    {
      preHandler: originCheck,
      schema: { body: createCreditCardSchema },
    },
    async (req, reply) => {
      const account = await service.createCreditCard(req.user!.id, req.body);
      return reply.code(201).send(account);
    }
  );

  // PATCH /accounts/:id
  f.patch<{ Params: { id: string }; Body: UpdateAccountInput }>(
    '/accounts/:id',
    {
      preHandler: originCheck,
      schema: { body: updateAccountSchema },
    },
    async (req, reply) => {
      const account = await service.updateAccount(req.user!.id, req.params.id, req.body);
      return account;
    }
  );

  // POST /accounts/:id/archive
  f.post<{ Params: { id: string } }>(
    '/accounts/:id/archive',
    {
      preHandler: originCheck,
    },
    async (req, reply) => {
      await service.archiveAccount(req.user!.id, req.params.id);
      return reply.code(204).send();
    }
  );
}