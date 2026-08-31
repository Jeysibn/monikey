import { LedgerService } from './ledger.service.js.js.js.js';
import { LedgerRepository } from './ledger.repository.js.js.js.js';
import { ledgerRoutes } from './ledger.routes.js.js.js.js';
import { PrismaClient } from '@prisma/client';

export interface LedgerModule {
  service: LedgerService;
  repo: LedgerRepository;
  registerRoutes(app: any): Promise<void>;
}

export function createLedgerModule(prisma: PrismaClient): LedgerModule {
  const repo = new LedgerRepository(prisma);
  const service = new LedgerService(prisma, repo);

  return {
    service,
    repo,
    async registerRoutes(app: any) {
      await app.register(ledgerRoutes, { prefix: '/api/v1', service });
    },
  };
}