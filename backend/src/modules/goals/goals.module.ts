import { GoalsService } from './goals.service.js'
import { GoalsRepository } from './goals.repository.js'
import { goalsRoutes } from './goals.routes.js'
import { PrismaClient } from '@prisma/client'
import type { LedgerService } from '../ledger/ledger.service.js'

export interface GoalsModule {
  service: GoalsService
  repo: GoalsRepository
  registerRoutes(app: any, ledgerService: LedgerService, appOrigin: string): Promise<void>
}

export function createGoalsModule(prisma: PrismaClient): GoalsModule {
  const repo = new GoalsRepository(prisma)
  const service = new GoalsService(prisma, repo)

  return {
    service,
    repo,
    async registerRoutes(app: any, ledgerService: LedgerService, appOrigin: string) {
      await app.register(goalsRoutes, { service, ledgerService, prisma, appOrigin })
    },
  }
}
