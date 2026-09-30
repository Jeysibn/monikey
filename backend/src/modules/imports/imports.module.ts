/**
 * Imports module factory.
 * Creates the imports service and returns route registration function.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { createImportsRoutes, type ImportsRoutesOptions } from './imports.routes.js'

export type CreateImportsModuleOptions = ImportsRoutesOptions

export function createImportsModule(options: CreateImportsModuleOptions) {
  const registerRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
    await createImportsRoutes(app, options)
  }

  return {
    registerRoutes,
  }
}
