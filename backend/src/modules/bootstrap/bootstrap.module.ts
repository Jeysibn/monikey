import { BootstrapService } from './bootstrap.service.js';
import { bootstrapRoutes } from './bootstrap.routes.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

export interface BootstrapModule {
  service: BootstrapService;
  registerRoutes(app: FastifyInstance): Promise<void>;
}

export function createBootstrapModule(prisma: PrismaClient, ledgerService: LedgerService, accountsService: AccountsService): BootstrapModule {
  const service = new BootstrapService(prisma, ledgerService, accountsService);

  return {
    service,
    async registerRoutes(app: FastifyInstance) {
      await app.register(bootstrapRoutes, { service, prisma });
    },
  };
}
