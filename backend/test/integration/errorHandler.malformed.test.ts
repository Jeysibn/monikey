// QA Attempt 1 (Phase 2), Finding D4: `errorHandler.ts` never consulted
// `FastifyError.statusCode`, so Fastify's own body-parsing errors (malformed
// JSON, a body with no/wrong Content-Type, an oversized body) all fell
// through to a generic `500 INTERNAL_ERROR` instead of the correct 4xx.
// Phase 1 had no body-accepting routes, so this was latent but unreachable
// until Phase 2's POST/PUT endpoints. Uses `app.inject()` — these are pure
// HTTP body-parsing errors, unrelated to the proxy-layer concern that made
// `rateLimit.proxy.test.ts` need a real socket.
import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const env = loadEnv({
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/monikey',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  APP_ORIGIN: 'http://localhost:8080',
})

function fakePrisma(): PrismaClient {
  return {} as unknown as PrismaClient
}

describe('malformed request bodies map to the correct 4xx envelope, not a 500', () => {
  it('malformed JSON returns 400 VALIDATION_ERROR, not 500', async () => {
    const app = await buildApp({ env, prisma: fakePrisma() })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' },
      payload: '{ this is not valid json',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
    expect(res.json().error.requestId).toBeTypeOf('string')
    await app.close()
  })

  it('a JSON-shaped body sent with an unsupported Content-Type is rejected with a 4xx, not 500', async () => {
    const app = await buildApp({ env, prisma: fakePrisma() })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:8080', 'content-type': 'application/xml' },
      payload: '{"email":"a@example.com","password":"whatever1"}',
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
    expect(res.json().error.requestId).toBeTypeOf('string')
    await app.close()
  })

  it('an oversized body is rejected 413, not 500', async () => {
    const app = await buildApp({ env, prisma: fakePrisma() })
    const oversized = JSON.stringify({
      email: 'a@example.com',
      password: 'x'.repeat(15 * 1024 * 1024),
      displayName: 'Too Big',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'http://localhost:8080', 'content-type': 'application/json' },
      payload: oversized,
    })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
    await app.close()
  })
})
