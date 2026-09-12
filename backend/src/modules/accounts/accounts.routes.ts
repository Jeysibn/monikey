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
const minorInputJsonSchema = { type: 'string', pattern: '^\\d+$' } as const;
const creditCardDetailResponseSchema = {
  type: 'object',
  required: ['network', 'creditLimitMinor', 'dueDay', 'minimumPaymentMinor', 'createdAt', 'updatedAt'],
  properties: {
    network: { type: 'string', enum: ['visa', 'mastercard'] },
    creditLimitMinor: { type: 'string', pattern: '^\\d+$' },
    dueDay: { type: 'integer', minimum: 1, maximum: 31 },
    minimumPaymentMinor: { type: 'string', pattern: '^\\d+$' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;
const accountResponseSchema = {
  type: 'object',
  required: ['id', 'userId', 'name', 'institution', 'accountType', 'classification', 'currencyCode', 'openingBalanceMinor', 'currentBalanceMinor', 'lastFour', 'syncStatus', 'manual', 'version', 'archivedAt', 'createdAt', 'updatedAt', 'creditCardDetail'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    institution: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    accountType: { type: 'string', enum: ['cash', 'checking', 'savings', 'ewallet', 'credit_card'] },
    classification: { type: 'string', enum: ['asset', 'liability'] },
    currencyCode: { type: 'string', minLength: 3, maxLength: 3 },
    openingBalanceMinor: { type: 'string', pattern: '^-?\\d+$' },
    currentBalanceMinor: { type: 'string', pattern: '^-?\\d+$' },
    lastFour: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    syncStatus: { type: 'string' },
    manual: { type: 'boolean' },
    version: { type: 'integer' },
    archivedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    creditCardDetail: { anyOf: [creditCardDetailResponseSchema, { type: 'null' }] },
  },
} as const;
const createAccountBodySchema = {
  type: 'object',
  required: ['name', 'accountType'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    institution: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
    accountType: { type: 'string', enum: ['cash', 'checking', 'savings', 'ewallet'] },
    currencyCode: { type: 'string', minLength: 3, maxLength: 3, default: 'PHP' },
    openingBalanceMinor: { ...minorInputJsonSchema, default: '0' },
    lastFour: { anyOf: [{ type: 'string', minLength: 4, maxLength: 4 }, { type: 'null' }] },
  },
} as const;
const createCreditCardBodySchema = {
  type: 'object',
  required: ['name', 'network', 'creditLimitMinor', 'dueDay'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    institution: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
    currencyCode: { type: 'string', minLength: 3, maxLength: 3, default: 'PHP' },
    openingBalanceMinor: { ...minorInputJsonSchema, default: '0' },
    lastFour: { anyOf: [{ type: 'string', minLength: 4, maxLength: 4 }, { type: 'null' }] },
    network: { type: 'string', enum: ['visa', 'mastercard'] },
    creditLimitMinor: minorInputJsonSchema,
    dueDay: { type: 'integer', minimum: 1, maximum: 31 },
    minimumPaymentMinor: { ...minorInputJsonSchema, default: '0' },
  },
} as const;
const updateAccountBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    institution: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
    lastFour: { anyOf: [{ type: 'string', minLength: 4, maxLength: 4 }, { type: 'null' }] },
    currentBalanceMinor: minorInputJsonSchema,
  },
} as const;

export async function accountsRoutes(fastify: FastifyInstance, options: { service: AccountsService; prisma: PrismaClient }) {
  const { service, prisma } = options;
  const f = fastify.withTypeProvider<ZodTypeProvider>();

  f.addHook('preHandler', authGuard({ prisma }));

  // GET /accounts
  f.get(
    '/accounts',
    { schema: { response: { 200: { type: 'array', items: accountResponseSchema } } } },
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
      schema: { body: createAccountBodySchema, response: { 201: accountResponseSchema } },
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
      schema: { body: createCreditCardBodySchema, response: { 201: accountResponseSchema } },
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
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } }, body: updateAccountBodySchema, response: { 200: accountResponseSchema } },
    },
    async (req) => {
      // D8: Validate UUID path parameter
      const { id } = idParamSchema.parse(req.params);
      const account = await service.updateAccount(req.user!.id, id, updateAccountSchema.parse(req.body));
      return account;
    }
  );

  // POST /accounts/:id/archive
  f.post<{ Params: { id: string } }>(
    '/accounts/:id/archive',
    {
      preHandler: originCheckPreHandler({ APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:8080' }),
    },
    async (req, reply) => {
      // D8: Validate UUID path parameter
      const { id } = idParamSchema.parse(req.params);
      await service.archiveAccount(req.user!.id, id);
      return reply.code(204).send();
    }
  );
}
