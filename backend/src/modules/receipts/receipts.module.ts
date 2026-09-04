/**
 * Receipt module factory.
 * Creates and wires the receipt service with OCR and object store adapters.
 * External OCR is disabled by default; enabled only when user opts in.
 */

import type { PrismaClient } from '@prisma/client'
import type { Env } from '../../config/env.js'
import type { OcrProvider } from '../../integrations/interfaces/ocrProvider.js'
import { StubOcrAdapter } from '../../integrations/adapters/ocr-space/stub.adapter.js'
import { OcrSpaceAdapter } from '../../integrations/adapters/ocr-space/ocr-space.adapter.js'
import { FilesystemObjectStoreAdapter } from '../../integrations/adapters/filesystem-object-store/filesystem.adapter.js'
import { receiptsRoutes, type ReceiptsRoutesOptions } from './receipts.routes.js'
import type { LedgerService } from '../ledger/ledger.service.js'

/**
 * Creates and initializes the receipts module.
 * Selects adapters based on environment configuration.
 */
export function createReceiptsModule(
  prisma: PrismaClient,
  env: Env,
  ledgerService: LedgerService,
) {
  // Initialize OCR provider based on configuration
  let ocrProvider: OcrProvider
  if (env.OCR_PROVIDER === 'ocrspace') {
    if (!env.OCRSPACE_API_KEY) {
      throw new Error('OCRSPACE_API_KEY is required when OCR_PROVIDER=ocrspace')
    }
    ocrProvider = new OcrSpaceAdapter({
      apiKey: env.OCRSPACE_API_KEY,
    })
  } else {
    // Default to stub
    ocrProvider = new StubOcrAdapter()
  }

  // Initialize object store
  const objectStore = new FilesystemObjectStoreAdapter({
    basePath: env.RECEIPT_STORAGE_PATH,
  })

  const registerRoutes = async (app: any, appOrigin: string) => {
    await app.register(receiptsRoutes, {
      prisma,
      objectStore,
      ocrProvider,
      ledgerService,
      appOrigin,
    } as ReceiptsRoutesOptions)
  }

  return {
    registerRoutes,
  }
}
