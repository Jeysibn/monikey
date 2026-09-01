/**
 * Imports module factory.
 * Creates the imports service and returns route registration function.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { LedgerService } from '../ledger/ledger.service.js'
import type { Env } from '../../config/env.js'
import type { BankAggregationProvider } from '../../integrations/interfaces/bankDataProvider.js'
import { createImportsRoutes } from './imports.routes.js'

export interface CreateImportsModuleOptions {
  prisma: PrismaClient
  ledgerService: LedgerService
  bankProvider: BankAggregationProvider
  env: Env
  appOrigin: string
}

export function createImportsModule(options: CreateImportsModuleOptions) {
  const registerRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
    await createImportsRoutes(app, options)
  }

  return {
    registerRoutes,
  }
}
