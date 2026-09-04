import type { FastifyReply } from 'fastify'
import type { Env } from '../../config/env.js'

export const SESSION_COOKIE_NAME = 'monikey_session'

type CookieEnv = Pick<Env, 'SESSION_SECURE' | 'NODE_ENV'>

/**
 * Cookie options shared by set/clear. `secure` is true whenever
 * `SESSION_SECURE` is explicitly set, OR whenever `NODE_ENV === 'production'`
 * — QA Attempt 1 (Phase 2), Finding "worth fixing": the original version
 * only ever read `SESSION_SECURE`, so a forgotten/misconfigured env var in a
 * real deployment would silently ship the session cookie without `Secure`
 * even though `compose.yaml` sets `NODE_ENV=production`. This makes the
 * safe behavior the automatic default rather than an opt-in a deployer can
 * forget; `SESSION_SECURE=true` remains available to force it on in a
 * non-production environment that still terminates TLS (e.g. a staging
 * profile). `sameSite: 'lax'` allows normal top-level navigation while still
 * blocking cross-site POST/PUT/DELETE submission of the cookie.
 */
function cookieOptions(env: CookieEnv) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.SESSION_SECURE || env.NODE_ENV === 'production',
    path: '/',
  }
}

export function setSessionCookie(
  reply: FastifyReply,
  env: CookieEnv,
  rawToken: string,
  expiresAt: Date,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    ...cookieOptions(env),
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply, env: CookieEnv): void {
  reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions(env))
}
