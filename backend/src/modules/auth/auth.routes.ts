import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { Env } from '../../config/env.js'
import type { Clock } from '../../common/auth/authGuard.js'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { clearSessionCookie, setSessionCookie } from '../../common/auth/cookies.js'
import { createEmailProvider, type EmailProvider } from '../notifications/email.js'
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.schemas.js'
import { changePassword, loginUser, logoutUser, registerUser, requestPasswordReset, resetPassword } from './auth.service.js'

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
const userJson = { type: 'object', additionalProperties: false, required: ['id', 'email', 'displayName', 'timezone', 'baseCurrency'], properties: { id: { type: 'string', format: 'uuid' }, email: { type: 'string', format: 'email' }, displayName: { type: 'string' }, timezone: { type: 'string' }, baseCurrency: { type: 'string', minLength: 3, maxLength: 3 } } } as const
const authResultJson = { type: 'object', additionalProperties: false, required: ['user'], properties: { user: userJson } } as const
const registerBodyJson = { type: 'object', additionalProperties: false, required: ['email', 'password', 'displayName'], properties: { email: { type: 'string' }, password: { type: 'string', minLength: 8, maxLength: 256 }, displayName: { type: 'string', minLength: 1, maxLength: 120 } } } as const
const loginBodyJson = { type: 'object', additionalProperties: false, required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string', minLength: 1, maxLength: 256 } } } as const
const forgotPasswordBodyJson = { type: 'object', additionalProperties: false, required: ['email'], properties: { email: { type: 'string' } } } as const
const resetPasswordBodyJson = { type: 'object', additionalProperties: false, required: ['token', 'password'], properties: { token: { type: 'string', minLength: 1 }, password: { type: 'string', minLength: 8, maxLength: 256 } } } as const
const changePasswordBodyJson = { type: 'object', additionalProperties: false, required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string', minLength: 1 }, newPassword: { type: 'string', minLength: 8, maxLength: 256 } } } as const
const sessionIdParamsJson = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } as const
const sessionsJson = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'createdAt', 'lastSeenAt', 'expiresAt', 'userAgent', 'current'], properties: { id: { type: 'string', format: 'uuid' }, createdAt: { type: 'string', format: 'date-time' }, lastSeenAt: { type: 'string', format: 'date-time' }, expiresAt: { type: 'string', format: 'date-time' }, userAgent: { anyOf: [{ type: 'string' }, { type: 'null' }] }, current: { type: 'boolean' } } } } as const
const errorJson = { type: 'object', additionalProperties: false, required: ['error'], properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, field: { type: 'string' }, requestId: { type: 'string' } } } } } as const

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { prisma, env, clock } = opts
  const emailProvider = opts.emailProvider ?? createEmailProvider(env)
  const requireOrigin = originCheckPreHandler(env)
  const requireAuth = authGuard({ prisma, clock })

  app.post(
    '/auth/register',
    { preValidation: requireOrigin, config: { rateLimit: REGISTER_RATE_LIMIT }, schema: { body: registerBodyJson, response: { 201: authResultJson } } },
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
    { preValidation: requireOrigin, config: { rateLimit: LOGIN_RATE_LIMIT }, schema: { body: loginBodyJson, response: { 200: authResultJson } } },
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

  app.post('/auth/logout', { preValidation: [requireOrigin, requireAuth], schema: { response: { 204: { type: 'null' } } } }, async (request, reply) => {
    if (request.sessionId) {
      await logoutUser(prisma, request.sessionId)
    }
    clearSessionCookie(reply, env)
    reply.status(204)
    return null
  })

  app.get('/auth/me', { preValidation: requireAuth, schema: { response: { 200: authResultJson } } }, async (request) => {
    return { user: request.user }
  })

  app.get('/auth/sessions', { preValidation: requireAuth, schema: { response: { 200: sessionsJson } } }, async (request) => {
    const sessions = await prisma.userSession.findMany({ where: { userId: request.user!.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: 'desc' }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, userAgent: true } })
    return sessions.map((session) => ({ ...session, current: session.id === request.sessionId }))
  })
  app.post('/auth/change-password', { preValidation: [requireOrigin, requireAuth], schema: { body: changePasswordBodyJson, response: { 204: { type: 'null' } } } }, async (request, reply) => {
    await changePassword(prisma, request.user!.id, request.sessionId!, changePasswordSchema.parse(request.body))
    return reply.code(204).send()
  })
  app.delete<{ Params: { id: string } }>('/auth/sessions/:id', { preValidation: [requireOrigin, requireAuth], schema: { params: sessionIdParamsJson, response: { 204: { type: 'null' }, 400: errorJson } } }, async (request, reply) => {
    if (request.params.id === request.sessionId) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Use sign out to revoke the current session.' } })
    await prisma.userSession.deleteMany({ where: { id: request.params.id, userId: request.user!.id } })
    return reply.code(204).send()
  })

  app.post(
    '/auth/forgot-password',
    { preValidation: requireOrigin, config: { rateLimit: FORGOT_PASSWORD_RATE_LIMIT }, schema: { body: forgotPasswordBodyJson, response: { 204: { type: 'null' } } } },
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
    { preValidation: requireOrigin, config: { rateLimit: RESET_PASSWORD_RATE_LIMIT }, schema: { body: resetPasswordBodyJson, response: { 204: { type: 'null' } } } },
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
