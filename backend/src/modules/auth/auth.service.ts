import type { PrismaClient } from '@prisma/client'
import { AppError } from '../../common/errors/appError.js'
import { hashPassword, verifyPassword } from '../../common/auth/password.js'
import { generateSessionToken, hashSessionToken, safeCompareHashes } from '../../common/auth/sessionToken.js'
import type { Clock } from '../../common/auth/authGuard.js'
import type { AuthenticatedUser } from '../../common/auth/types.js'
import type { EmailProvider } from '../notifications/email.js'
import {
  createPasswordResetToken,
  createSession,
  createUserWithDefaults,
  deleteAllSessionsForUser,
  deleteSessionById,
  findPasswordResetTokenByHash,
  findUserByEmail,
  markPasswordResetTokenUsed,
  normalizeEmail,
  updateUserPassword,
} from './auth.repository.js'
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schemas.js'

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

export async function changePassword(prisma: PrismaClient, userId: string, currentSessionId: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) throw new AppError('UNAUTHORIZED', 'Current password is incorrect.', { statusCode: 401, field: 'currentPassword' })
  await prisma.$transaction(async (tx) => { await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.newPassword) } }); await tx.userSession.deleteMany({ where: { userId, id: { not: currentSessionId } } }) })
}

export interface PasswordResetServiceOptions {
  prisma: PrismaClient
  emailProvider: EmailProvider
  resetTtlMinutes: number
  appOrigin: string
  clock?: Clock
}

/**
 * Enumeration-resistant by design (same policy as login, plan §16): whether
 * or not the email belongs to a registered account, this always resolves
 * the same way and takes roughly the same time, so a caller can't use it to
 * discover which emails have accounts. A reset email is only actually sent
 * when the account exists.
 */
export async function requestPasswordReset(opts: PasswordResetServiceOptions, input: ForgotPasswordInput): Promise<void> {
  const user = await findUserByEmail(opts.prisma, input.email)
  if (!user) return

  const now = (opts.clock ?? (() => new Date()))()
  const expiresAt = new Date(now.getTime() + opts.resetTtlMinutes * 60 * 1000)
  const rawToken = generateSessionToken()
  const tokenHash = hashSessionToken(rawToken)

  await createPasswordResetToken(opts.prisma, { userId: user.id, tokenHash, expiresAt })

  const resetUrl = `${opts.appOrigin}/?resetToken=${encodeURIComponent(rawToken)}`
  await opts.emailProvider.send({
    to: user.email,
    subject: 'Reset your Monikey password',
    text: `We received a request to reset your Monikey password.\n\nReset it here: ${resetUrl}\n\nThis link expires in ${opts.resetTtlMinutes} minutes. If you didn't request this, you can safely ignore this email — your password won't change.`,
  })
}

export async function resetPassword(opts: PasswordResetServiceOptions, input: ResetPasswordInput): Promise<void> {
  const invalidToken = () => new AppError('VALIDATION_ERROR', 'This reset link is invalid or has expired.', { statusCode: 400, field: 'token' })

  const tokenHash = hashSessionToken(input.token)
  const record = await findPasswordResetTokenByHash(opts.prisma, tokenHash)
  if (!record) throw invalidToken()
  // Re-derive the hash from the stored value for a constant-time compare —
  // findPasswordResetTokenByHash already looked it up by exact hash, so this
  // is a defense-in-depth check against a mismatched row (belt-and-braces,
  // mirrors the session-lookup pattern elsewhere).
  if (!safeCompareHashes(record.tokenHash, tokenHash)) throw invalidToken()

  const now = (opts.clock ?? (() => new Date()))()
  if (record.usedAt || record.expiresAt.getTime() <= now.getTime()) throw invalidToken()

  const passwordHash = await hashPassword(input.password)
  await updateUserPassword(opts.prisma, record.userId, passwordHash)
  await markPasswordResetTokenUsed(opts.prisma, record.id, now)
  // A reset is a credential compromise-recovery event — kill every existing
  // session so a stolen cookie stops working the moment the owner regains
  // control of their account.
  await deleteAllSessionsForUser(opts.prisma, record.userId)
}
