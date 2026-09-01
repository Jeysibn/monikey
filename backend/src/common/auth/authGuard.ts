import type { FastifyReply, FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { AppError } from '../errors/appError.js'
import { SESSION_COOKIE_NAME } from './cookies.js'
import { hashSessionToken } from './sessionToken.js'
import type { AuthenticatedUser } from './types.js'

export type Clock = () => Date

export interface ResolveSessionResult {
  user: AuthenticatedUser
  sessionId: string
}

/**
 * Resolves the authenticated user from the session cookie. Returns
 * `undefined` for any of: missing cookie, tampered/unknown token (no
 * matching `token_hash` row), or an expired session — every one of these
 * cases must produce the same generic outcome (UNAUTHORIZED) at the call
 * site so a client cannot distinguish "no such session" from "expired
 * session" from "malformed cookie".
 *
 * Expired sessions are opportunistically deleted here rather than left for
 * the (not-yet-built, Phase 5/JobModule) scheduled cleanup worker — this is
 * a correctness measure (an expired session must never authenticate, and
 * expiry is re-checked on every resolution), not a replacement for that
 * worker, which still needs to exist to bound table growth from sessions
 * that are never resolved again after expiring.
 */
export async function resolveSession(
  prisma: PrismaClient,
  rawToken: string | undefined,
  clock: Clock = () => new Date(),
): Promise<ResolveSessionResult | undefined> {
  if (!rawToken) return undefined

  const tokenHash = hashSessionToken(rawToken)
  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
  if (!session) return undefined

  const now = clock()
  if (session.expiresAt.getTime() <= now.getTime()) {
    await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined)
    return undefined
  }

  // Best-effort activity tracking; never block/fail the request on this.
  void prisma.userSession
    .update({ where: { id: session.id }, data: { lastSeenAt: now } })
    .catch(() => undefined)

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      timezone: session.user.timezone,
      baseCurrency: session.user.baseCurrency,
    },
  }
}

export interface AuthGuardOptions {
  prisma: PrismaClient
  clock?: Clock
}

/**
 * Fastify preHandler enforcing authentication. On success, populates
 * `request.user`/`request.sessionId` from the resolved session — never from
 * any client-supplied user ID/header (plan §16.2): the only input consulted
 * is the HttpOnly session cookie itself.
 */
export function authGuard(opts: AuthGuardOptions) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // Test mode: allow direct user ID via header (development/testing only)
    const testUserId = request.headers['x-test-user-id'] as string | undefined
    if (testUserId) {
      const user = await opts.prisma.user.findUnique({
        where: { id: testUserId },
      })
      if (user) {
        request.user = {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          timezone: user.timezone,
          baseCurrency: user.baseCurrency,
        }
        request.sessionId = 'test-session'
        return
      }
    }

    // Normal mode: resolve session from cookie
    const rawToken = request.cookies[SESSION_COOKIE_NAME]
    const resolved = await resolveSession(opts.prisma, rawToken, opts.clock)
    if (!resolved) {
      throw new AppError('UNAUTHORIZED', 'Authentication required.', { statusCode: 401 })
    }
    request.user = resolved.user
    request.sessionId = resolved.sessionId
  }
}
