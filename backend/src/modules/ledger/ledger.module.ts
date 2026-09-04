import { LedgerService } from './ledger.service.js';
import { LedgerRepository } from './ledger.repository.js';
import { ledgerRoutes } from './ledger.routes.js';
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
      await app.register(ledgerRoutes, { service, prisma });
    },
  };
}
