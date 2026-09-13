import { AccountsService } from './accounts.service.js';
import { AccountsRepository } from './accounts.repository.js';
import { accountsRoutes } from './accounts.routes.js';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

export interface AccountsModule {
  service: AccountsService;
  repo: AccountsRepository;
  registerRoutes(app: FastifyInstance): Promise<void>;
}

export function createAccountsModule(prisma: PrismaClient): AccountsModule {
  const repo = new AccountsRepository(prisma);
  const service = new AccountsService(prisma, repo);

  return {
    service,
    repo,
    async registerRoutes(app: FastifyInstance) {
      await app.register(accountsRoutes, { service, prisma });
    },
  };
}
