import { PrismaClient } from '@prisma/client'
import { FxRateService } from './fx.service.js'
import { FxRateRepository } from './fx.repository.js'
import { FxRatesProvider } from '../../integrations/interfaces/fxRatesProvider.js'

/**
 * Factory for creating the FX module with all dependencies wired.
 */
export function createFxModule(
  prisma: PrismaClient,
  provider: FxRatesProvider,
  logger?: { warn: (obj: unknown, msg?: string) => void; info: (obj: unknown, msg?: string) => void },
): FxRateService {
  const repository = new FxRateRepository(prisma)
  return new FxRateService(provider, repository, logger)
}

export { FxRateService, FxRateRepository }
