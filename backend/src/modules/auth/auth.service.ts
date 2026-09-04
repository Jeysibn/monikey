import type { PrismaClient } from '@prisma/client'
import { AppError } from '../../common/errors/appError.js'
import { hashPassword, verifyPassword } from '../../common/auth/password.js'
import { generateSessionToken, hashSessionToken } from '../../common/auth/sessionToken.js'
import type { Clock } from '../../common/auth/authGuard.js'
import type { AuthenticatedUser } from '../../common/auth/types.js'
import {
  createSession,
  createUserWithDefaults,
  deleteSessionById,
  findUserByEmail,
  normalizeEmail,
} from './auth.repository.js'
import type { RegisterInput, LoginInput } from './auth.schemas.js'

export interface AuthResult {
  user: AuthenticatedUser
  rawToken: string
  expiresAt: Date
}

function toAuthenticatedUser(user: {
  id: string
  email: string
  displayName: string
  timezone: string
  baseCurrency: string
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
  }
}

export interface AuthServiceOptions {
  prisma: PrismaClient
  sessionTtlDays: number
  clock?: Clock
  userAgent?: string | null
}

/**
 * Enumeration-resistance policy (documented per plan §16, deliberate
 * tradeoff): registration DOES reveal "email already in use" — standard UX
 * practice for a personal single-tenant app, and the plan explicitly allows
 * this tradeoff. Login DOES NOT: both "no such user" and "wrong password"
 * collapse to one generic "Invalid email or password." message/401, so a
 * failed login attempt cannot be used to enumerate registered emails.
 */
export async function registerUser(opts: AuthServiceOptions, input: RegisterInput): Promise<AuthResult> {
  const existing = await findUserByEmail(opts.prisma, input.email)
  if (existing) {
    throw new AppError('VALIDATION_ERROR', 'Email already in use.', { statusCode: 409, field: 'email' })
  }

  const passwordHash = await hashPassword(input.password)
  const user = await createUserWithDefaults(opts.prisma, {
    email: normalizeEmail(input.email),
    passwordHash,
    displayName: input.displayName,
  })

  return issueSession(opts, toAuthenticatedUser(user))
}

export async function loginUser(opts: AuthServiceOptions, input: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(opts.prisma, input.email)
  const genericFailure = () =>
    new AppError('UNAUTHORIZED', 'Invalid email or password.', { statusCode: 401 })

  if (!user) {
    // Still run a hash verification against a dummy hash so the response
    // time for "no such user" doesn't measurably differ from "wrong
    // password" (a coarse mitigation — this app already leaks existence at
    // registration, so this only closes the login-timing side channel).
    await verifyPassword(
      '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      input.password,
    )
    throw genericFailure()
  }

  const valid = await verifyPassword(user.passwordHash, input.password)
  if (!valid) {
    throw genericFailure()
  }

  return issueSession(opts, toAuthenticatedUser(user))
}

async function issueSession(opts: AuthServiceOptions, user: AuthenticatedUser): Promise<AuthResult> {
  const now = (opts.clock ?? (() => new Date()))()
  const expiresAt = new Date(now.getTime() + opts.sessionTtlDays * 24 * 60 * 60 * 1000)
  const rawToken = generateSessionToken()
  const tokenHash = hashSessionToken(rawToken)

  await createSession(opts.prisma, {
    userId: user.id,
    tokenHash,
    expiresAt,
    userAgent: opts.userAgent,
  })

  return { user, rawToken, expiresAt }
}

export async function logoutUser(prisma: PrismaClient, sessionId: string): Promise<void> {
  await deleteSessionById(prisma, sessionId)
}
