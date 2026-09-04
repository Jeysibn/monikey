import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const env = loadEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/monikey', NODE_ENV: 'test', LOG_LEVEL: 'silent' })

function fakePrisma(queryRaw: () => Promise<unknown>): PrismaClient {
  return { $queryRaw: queryRaw } as unknown as PrismaClient
}

describe('GET /api/v1/health/live', () => {
  it('returns 200 without touching the database', async () => {
    const prisma = fakePrisma(() => Promise.reject(new Error('should not be called')))
    const app = await buildApp({ env, prisma })
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/live' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })

  it('echoes back a valid incoming X-Request-Id header', async () => {
    const prisma = fakePrisma(() => Promise.resolve())
    const app = await buildApp({ env, prisma })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { 'x-request-id': 'test-request-id-123' },
    })
    expect(res.headers['x-request-id']).toBe('test-request-id-123')
    await app.close()
  })
})

describe('GET /api/v1/health/ready', () => {
  it('returns 200 and db: ok when the database is reachable', async () => {
    const prisma = fakePrisma(() => Promise.resolve([{ '?column?': 1 }]))
    const app = await buildApp({ env, prisma })
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' })
    await app.close()
  })

  it('returns 503 and db: unavailable when the database ping fails', async () => {
    const prisma = fakePrisma(() => Promise.reject(new Error('connection refused')))
    const app = await buildApp({ env, prisma })
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'unavailable', db: 'unavailable' })
    await app.close()
  })
})

describe('unmatched routes and error mapping', () => {
  it('returns the stable error envelope for a 404', async () => {
    const prisma = fakePrisma(() => Promise.resolve())
    const app = await buildApp({ env, prisma })
    const res = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' })
    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(typeof body.error.requestId).toBe('string')
    await app.close()
  })

  it('serves the OpenAPI document', async () => {
    const prisma = fakePrisma(() => Promise.resolve())
    const app = await buildApp({ env, prisma })
    const res = await app.inject({ method: 'GET', url: '/openapi.json' })
    expect(res.statusCode).toBe(200)
    expect(res.json().info.title).toBe('Monikey API')
    await app.close()
  })

  it('serves the Swagger docs UI', async () => {
    const prisma = fakePrisma(() => Promise.resolve())
    const app = await buildApp({ env, prisma })
    const res = await app.inject({ method: 'GET', url: '/docs' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
