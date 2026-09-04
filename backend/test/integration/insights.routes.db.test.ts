import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { spendingTrendsSchema } from '../../src/modules/insights/schemas.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'

function sessionCookie(response: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = response.cookies.find((item) => item.name === 'monikey_session')
  if (!cookie) throw new Error('Expected registration session cookie')
  return `${cookie.name}=${cookie.value}`
}

describeIfDb('Insights routes (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const emails: string[] = []
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }), prisma })
  })
  afterEach(async () => app.close())
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  it('returns a schema-valid, read-only spending trend from the configured stub adapter', async () => {
    const email = `insights-trends-${randomUUID()}@monikey.test`
    emails.push(email)
    const register = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Trend Test' } })
    expect(register.statusCode).toBe(201)
    const userId = register.json().user.id as string
    await prisma.userPreferences.update({ where: { userId }, data: { externalAiEnabled: true } })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assistant/messages',
      headers: { origin: APP_ORIGIN, cookie: sessionCookie(register) },
      payload: { type: 'spending_trends', periodStart: '2026-09-01', periodEnd: '2026-09-30' },
    })

    expect(response.statusCode).toBe(200)
    expect(spendingTrendsSchema.safeParse(response.json().insight).success).toBe(true)
    expect(response.json().insight.trend).toBe('stable')
  })
})
