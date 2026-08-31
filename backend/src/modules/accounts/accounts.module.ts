import { AccountsService } from './accounts.service.js.js.js.js';
import { AccountsRepository } from './accounts.repository.js.js.js.js';
import { accountsRoutes } from './accounts.routes.js.js.js.js';
import { PrismaClient } from '@prisma/client';

export interface AccountsModule {
  service: AccountsService;
  repo: AccountsRepository;
  registerRoutes(app: any): Promise<void>;
}

export function createAccountsModule(prisma: PrismaClient): AccountsModule {
  const repo = new AccountsRepository(prisma);
  const service = new AccountsService(prisma, repo);

  return {
    service,
    repo,
    async registerRoutes(app: any) {
      await app.register(accountsRoutes, { prefix: '/api/v1', service });
    },
  };
}