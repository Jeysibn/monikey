import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

const REQUEST_ID_HEADER = 'x-request-id'

// UUIDv4 shape check — good enough to reject junk without pulling in a
// dedicated validator. We accept any reasonably-shaped incoming ID rather
// than requiring strict UUID compliance from external callers/proxies.
const PLAUSIBLE_ID = /^[A-Za-z0-9._-]{8,128}$/

/** Minimal shape this function needs — satisfied by both a raw IncomingMessage and a FastifyRequest. */
export interface HasHeaders {
  headers: Record<string, string | string[] | undefined>
}

/**
 * Fastify `genReqId` implementation: honors a valid incoming X-Request-Id,
 * otherwise generates one. Used both for `request.id` (via Fastify's
 * `genReqId` option, which is called with the raw Node request) and echoed
 * back on the response via the `onSend` hook registered in app.ts.
 */
export function generateRequestId(request: HasHeaders | IncomingMessage): string {
  const header = request.headers[REQUEST_ID_HEADER]
  const incoming = Array.isArray(header) ? header[0] : header
  if (incoming && PLAUSIBLE_ID.test(incoming)) {
    return incoming
  }
  return randomUUID()
}

export { REQUEST_ID_HEADER }
