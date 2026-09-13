import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { pingDatabase } from '../../db/client.js'
import { renderDatabaseMetrics } from './metrics.js'

export interface HealthRoutesOptions {
  prisma: PrismaClient
}

/**
 * Operational health endpoints. `/health/live` never touches external
 * dependencies (process is up). `/health/ready` additionally verifies
 * database connectivity so orchestrators/compose healthchecks can gate
 * traffic on real readiness.
 */
export async function healthRoutes(app: FastifyInstance, opts: HealthRoutesOptions): Promise<void> {
  app.get('/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8')
    return renderDatabaseMetrics(opts.prisma)
  })

  app.get('/health/live', async () => {
    return { status: 'ok' as const }
  })

  app.get('/health/ready', async (request, reply) => {
    try {
      await pingDatabase(opts.prisma)
      return { status: 'ok' as const, db: 'ok' as const }
    } catch (err) {
      request.log.error({ err }, 'readiness check failed: database unreachable')
      reply.status(503)
      return { status: 'unavailable' as const, db: 'unavailable' as const }
    }
  })
}
