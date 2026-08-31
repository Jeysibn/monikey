import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { PrismaClient } from '@prisma/client'
import type { Env } from './config/env.js'
import { buildLoggerOptions } from './config/logger.js'
import { registerErrorHandler } from './common/errors/errorHandler.js'
import { generateRequestId, REQUEST_ID_HEADER } from './common/http/requestId.js'
import { healthRoutes } from './modules/health/health.routes.js'

export interface BuildAppOptions {
  env: Env
  prisma: PrismaClient
}

/**
 * Builds a fully-wired Fastify instance without starting it. Kept separate
 * from server.ts/worker.ts (process startup) so tests can `app.inject()`
 * against a real app without binding a port.
 */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { env, prisma } = opts

  const app = Fastify({
    logger: buildLoggerOptions(env),
    genReqId: generateRequestId,
    trustProxy: true,
  })

  // Echo the resolved request ID back to the caller on every response.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(REQUEST_ID_HEADER, request.id)
    return payload
  })

  await app.register(sensible)
  await app.register(cors, {
    origin: env.APP_ORIGIN,
    credentials: true,
  })

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Monikey API',
        description: 'Monikey personal finance backend API.',
        version: '0.1.0',
      },
      servers: [{ url: '/api/v1' }],
    },
  })
  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })

  registerErrorHandler(app)

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes, { prisma })
    },
    { prefix: '/api/v1' },
  )

  app.get('/openapi.json', async () => app.swagger())

  return app
}
