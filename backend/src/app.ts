import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { PrismaClient } from '@prisma/client'
import type { Env } from './config/env.js'
import { buildLoggerOptions } from './config/logger.js'
import { registerErrorHandler } from './common/errors/errorHandler.js'
import { AppError } from './common/errors/appError.js'
import { generateRequestId, REQUEST_ID_HEADER } from './common/http/requestId.js'
import type { Clock } from './common/auth/authGuard.js'
import './common/auth/types.js'
import { healthRoutes } from './modules/health/health.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { settingsRoutes } from './modules/settings/settings.routes.js'
import { createLedgerModule } from './modules/ledger/ledger.module.js'
import { createAccountsModule } from './modules/accounts/accounts.module.js'
import { createBootstrapModule } from './modules/bootstrap/bootstrap.module.js'
import { goalsRoutes } from './modules/goals/goals.routes.js'
import { budgetRoutes } from './modules/budget/budget.routes.js'
import { recurringRoutes } from './modules/recurring/recurring.routes.js'
import { investmentsRoutes } from './modules/investments/investments.routes.js'
import { reportsRoutes } from './modules/reports/reports.routes.js'
import { createReceiptsModule } from './modules/receipts/receipts.module.js'

export interface BuildAppOptions {
  env: Env
  prisma: PrismaClient
  /** Test-only override for "now" used by session issuance/resolution. Never wired to client input in production. */
  clock?: Clock
}

/**
 * Builds a fully-wired Fastify instance without starting it. Kept separate
 * from server.ts/worker.ts (process startup) so tests can `app.inject()`
 * against a real app without binding a port.
 */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { env, prisma, clock } = opts

  const app = Fastify({
    logger: buildLoggerOptions(env),
    genReqId: generateRequestId,
    // QA Attempt 1, Finding D2: an unqualified `trustProxy: true` makes
    // `request.ip` (and therefore `@fastify/rate-limit`'s default IP key)
    // derive from a client-supplied `X-Forwarded-For` header with NO trust
    // boundary at all — an attacker can rotate that header to get a fresh
    // rate-limit bucket on every request, which is exactly what QA
    // reproduced against `/auth/login`. `['loopback', 'uniquelocal']` (two
    // `proxy-addr` presets Fastify passes straight through) trusts only
    // loopback and RFC1918 private-network addresses as proxy hops — i.e.
    // only a peer on the private Docker network this app's `api` container
    // lives on (per Docker Deployment.md, `api`'s port is never published
    // to the host; only `web`/nginx is — nginx's Docker-assigned address
    // always falls in `172.16.0.0/12`, covered by `uniquelocal`), plus
    // loopback itself for a test or local dev process connecting directly
    // over 127.0.0.1. Both presets are needed: `'uniquelocal'` ALONE
    // deliberately excludes loopback (confirmed by reading
    // `@fastify/proxy-addr`'s own `IP_RANGES` table, not assumed from the
    // name) — using only `'uniquelocal'` made every loopback-originated
    // request resolve to the constant, untrusted-but-unchanged address
    // `127.0.0.1` regardless of the `X-Forwarded-For` header, which looked
    // like a fix (an attacker's rotating header had no effect) but was
    // topology-wrong and failed the moment two distinct real client IPs
    // needed independent rate-limit buckets — caught by
    // `rateLimit.proxy.test.ts`'s multi-client test, not assumed correct
    // from the single-client test passing. With the array form: nginx's
    // `proxy_add_x_forwarded_for` (docker/nginx.conf) APPENDS the real
    // browser IP as the last entry in the header rather than trusting
    // whatever the browser already sent, so `proxy-addr` walks the chain
    // from the trusted nginx hop, finds that appended real IP is itself
    // NOT a private address, and stops there — resolving to the genuine
    // client IP regardless of what an attacker prepended. This is
    // deliberately NOT a hardcoded nginx IP/CIDR (compose assigns nginx's
    // address dynamically) and deliberately NOT `trustProxy: false`
    // (which would collapse every real client behind nginx's single
    // Docker IP for rate-limiting purposes, defeating per-client limits
    // entirely). See `test/integration/rateLimit.proxy.test.ts` for a real
    // socket-level (not `app.inject()`) reproduction confirming a rotated
    // `X-Forwarded-For` prefix no longer resets the limit, AND that two
    // distinct real client IPs still get independent buckets.
    trustProxy: ['loopback', 'uniquelocal'],
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
  await app.register(cookie)
  // `global: false`: login/register rate limits are applied per-route via
  // `config.rateLimit` in auth.routes.ts, not to every endpoint — see the
  // comment there for the reasoning and the plan §16.1 requirement.
  await app.register(rateLimit, {
    global: false,
    // Keep the rate-limit response on the same envelope shape as every other
    // error (plan §7.2) instead of the plugin's default `{statusCode,error,message}`
    // shape. `@fastify/rate-limit` throws whatever this returns back into
    // Fastify's normal error pipeline (it does not send it directly), so
    // returning an `AppError` — rather than a plain object — is what lets
    // the centralized error handler recognize and format it correctly
    // instead of falling through to a generic 500 (verified against a real
    // request in `auth.db.test.ts`, not assumed from the plugin's docs).
    errorResponseBuilder: () =>
      new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', { statusCode: 429 }),
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
      await v1.register(authRoutes, { prisma, env, clock })
      await v1.register(settingsRoutes, { prisma, env, clock })

      const ledger = createLedgerModule(prisma)
      const accounts = createAccountsModule(prisma)
      const bootstrap = createBootstrapModule(prisma, ledger.service, accounts.service)
      const receipts = createReceiptsModule(prisma, env, ledger.service)

      await v1.register(ledger.registerRoutes)
      await v1.register(accounts.registerRoutes)
      await v1.register(bootstrap.registerRoutes)
      await v1.register(goalsRoutes, { prisma, ledgerService: ledger.service, appOrigin: env.APP_ORIGIN })
      await v1.register(budgetRoutes, { prisma, appOrigin: env.APP_ORIGIN })
      await v1.register(recurringRoutes, { prisma, appOrigin: env.APP_ORIGIN, ledgerService: ledger.service })
      await v1.register(investmentsRoutes, { prisma, appOrigin: env.APP_ORIGIN, ledgerService: ledger.service })
      await v1.register(async (app) => receipts.registerRoutes(app, env.APP_ORIGIN))
      await v1.register(reportsRoutes, { prisma, prefix: '/reports' })
    },
    { prefix: '/api/v1' },
  )

  app.get('/openapi.json', async () => app.swagger())

  return app
}
