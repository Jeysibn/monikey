import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { Env } from '../../config/env.js'
import type { Clock } from '../../common/auth/authGuard.js'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { clearSessionCookie, setSessionCookie } from '../../common/auth/cookies.js'
import { createEmailProvider, type EmailProvider } from '../notifications/email.js'
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.schemas.js'
import { loginUser, logoutUser, registerUser, requestPasswordReset, resetPassword } from './auth.service.js'

export interface AuthRoutesOptions {
  prisma: PrismaClient
  env: Env
  clock?: Clock
  emailProvider?: EmailProvider
}

// Login/register rate limiting (plan §16.1): scoped to these two endpoints
// only via Fastify's per-route `config.rateLimit`, not the global default —
// `@fastify/rate-limit` is registered in app.ts with `global: false` for
// exactly this reason. Keyed by IP; generous enough for normal use, tight
// enough to blunt credential-stuffing/brute-force against a single account.
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }
const REGISTER_RATE_LIMIT = { max: 5, timeWindow: '1 minute' }
// Forgot/reset are both a mailbomb vector and (reset) a token-guessing
// target, so both get the tightest rate limit in this module.
const FORGOT_PASSWORD_RATE_LIMIT = { max: 5, timeWindow: '1 minute' }
const RESET_PASSWORD_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { prisma, env, clock } = opts
  const emailProvider = opts.emailProvider ?? createEmailProvider(env)
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

  app.post(
    '/auth/forgot-password',
    { preHandler: requireOrigin, config: { rateLimit: FORGOT_PASSWORD_RATE_LIMIT } },
    async (request, reply) => {
      const input = forgotPasswordSchema.parse(request.body)
      await requestPasswordReset(
        { prisma, emailProvider, resetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES, appOrigin: env.APP_ORIGIN, clock },
        input,
      )
      // Always 204, whether or not the email is registered — see
      // requestPasswordReset's enumeration-resistance note.
      reply.status(204)
      return null
    },
  )

  app.post(
    '/auth/reset-password',
    { preHandler: requireOrigin, config: { rateLimit: RESET_PASSWORD_RATE_LIMIT } },
    async (request, reply) => {
      const input = resetPasswordSchema.parse(request.body)
      await resetPassword(
        { prisma, emailProvider, resetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES, appOrigin: env.APP_ORIGIN, clock },
        input,
      )
      reply.status(204)
      return null
    },
  )
}
