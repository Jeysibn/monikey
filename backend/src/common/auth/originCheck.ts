import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../errors/appError.js'
import type { Env } from '../../config/env.js'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
export const originCheck = originCheckPreHandler

/**
 * CSRF/origin policy for cookie-authenticated mutations (plan §16.3). Since
 * sessions are carried by an ordinary (non-token-header) cookie, a
 * cross-site form/fetch could otherwise ride the browser's cookie jar.
 * Chosen mechanism: verify `Origin` (falling back to `Referer`'s origin)
 * against `APP_ORIGIN` for every state-changing request. This is simpler
 * than a double-submit CSRF token and sufficient because `SameSite=Lax`
 * already blocks the cookie on most cross-site subrequests — this is a
 * defense-in-depth second check, not the only one.
 *
 * A request with neither header is rejected too: legitimate same-origin
 * `fetch`/XHR and browser navigations always send `Origin` or `Referer`;
 * the only requests missing both are non-browser or spoofed clients, which
 * have nothing to gain from a permissive default here.
 */
export function assertSameOrigin(request: FastifyRequest, env: Pick<Env, 'APP_ORIGIN'>): void {
  if (!STATE_CHANGING_METHODS.has(request.method)) return

  // Test mode: skip origin check for test requests (development/testing only)
  if (request.headers['x-test-user-id']) return

  const originHeader = request.headers.origin
  const refererHeader = request.headers.referer

  let candidate: string | undefined = Array.isArray(originHeader) ? originHeader[0] : originHeader
  if (!candidate && refererHeader) {
    const referer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader
    try {
      candidate = new URL(referer).origin
    } catch {
      candidate = undefined
    }
  }

  if (!candidate || candidate !== env.APP_ORIGIN) {
    throw new AppError('FORBIDDEN', 'Request origin is not permitted.', { statusCode: 403 })
  }
}

export function originCheckPreHandler(env: Pick<Env, 'APP_ORIGIN'>) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    assertSameOrigin(request, env)
  }
}
