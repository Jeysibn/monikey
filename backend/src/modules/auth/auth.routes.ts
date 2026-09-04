import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { Env } from '../../config/env.js'
import type { Clock } from '../../common/auth/authGuard.js'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { clearSessionCookie, setSessionCookie } from '../../common/auth/cookies.js'
import { loginSchema, registerSchema } from './auth.schemas.js'
import { loginUser, logoutUser, registerUser } from './auth.service.js'

export interface AuthRoutesOptions {
  prisma: PrismaClient
  env: Env
  clock?: Clock
}

// Login/register rate limiting (plan §16.1): scoped to these two endpoints
// only via Fastify's per-route `config.rateLimit`, not the global default —
// `@fastify/rate-limit` is registered in app.ts with `global: false` for
// exactly this reason. Keyed by IP; generous enough for normal use, tight
// enough to blunt credential-stuffing/brute-force against a single account.
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }
const REGISTER_RATE_LIMIT = { max: 5, timeWindow: '1 minute' }

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { prisma, env, clock } = opts
  const requireOrigin = originCheckPreHandler(env)
  const requireAuth = authGuard({ prisma, clock })

  app.post(
    '/auth/register',
    { preHandler: requireOrigin, config: { rateLimit: REGISTER_RATE_LIMIT } },
    async (request, reply) => {
      const input = registerSchema.parse(request.body)
      const result = await registerUser(
        { prisma, sessionTtlDays: env.SESSION_TTL_DAYS, clock, userAgent: request.headers['user-agent'] },
        input,
      )
      setSessionCookie(reply, env, result.rawToken, result.expiresAt)
      reply.status(201)
      return { user: result.user }
    },
  )

  app.post(
    '/auth/login',
    { preHandler: requireOrigin, config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      const input = loginSchema.parse(request.body)
      const result = await loginUser(
        { prisma, sessionTtlDays: env.SESSION_TTL_DAYS, clock, userAgent: request.headers['user-agent'] },
        input,
      )
      setSessionCookie(reply, env, result.rawToken, result.expiresAt)
      return { user: result.user }
    },
  )

  app.post('/auth/logout', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    if (request.sessionId) {
      await logoutUser(prisma, request.sessionId)
    }
    clearSessionCookie(reply, env)
    reply.status(204)
    return null
  })

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.user }
  })
}
