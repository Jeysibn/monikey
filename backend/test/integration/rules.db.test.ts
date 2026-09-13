import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'

describeIfDb('Rules routes (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const emails: string[] = []
  let app: FastifyInstance
  beforeEach(async () => { app = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }), prisma }) })
  afterEach(async () => app.close())
  afterAll(async () => { await prisma.user.deleteMany({ where: { email: { in: emails } } }); await prisma.$disconnect() })

  async function register() {
    const email = `rules-${randomUUID()}@monikey.test`; emails.push(email)
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Rules Test' } })
    const session = response.cookies.find((cookie) => cookie.name === 'monikey_session')!
    return { userId: response.json().user.id as string, cookie: `${session.name}=${session.value}` }
  }

  it('creates, lists, updates, and deletes a typed rule', async () => {
    const { userId, cookie } = await register()
    const created = await app.inject({ method: 'POST', url: '/api/v1/rules', headers: { origin: APP_ORIGIN, cookie }, payload: { name: 'Normalize food', conditions: { merchantContains: 'JOLLIBEE', minAmountMinor: '100' }, actions: { normalizedMerchant: 'Jollibee', addTags: ['fast-food'] } } })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ userId, name: 'Normalize food', enabled: true, priority: 100 })
    const id = created.json().id as string
    const listed = await app.inject({ method: 'GET', url: '/api/v1/rules', headers: { cookie } })
    expect(listed.json()).toEqual([expect.objectContaining({ id })])
    const updated = await app.inject({ method: 'PATCH', url: `/api/v1/rules/${id}`, headers: { origin: APP_ORIGIN, cookie }, payload: { enabled: false, priority: 5 } })
    expect(updated.json()).toMatchObject({ id, enabled: false, priority: 5 })
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/rules/${id}`, headers: { origin: APP_ORIGIN, cookie } })).statusCode).toBe(204)
  })

  it('does not expose another user’s rule and preserves the error envelope', async () => {
    const owner = await register(); const attacker = await register()
    const rule = await prisma.transactionRule.create({ data: { userId: owner.userId, name: 'Private', conditions: {}, actions: {} } })
    const response = await app.inject({ method: 'PATCH', url: `/api/v1/rules/${rule.id}`, headers: { origin: APP_ORIGIN, cookie: attacker.cookie }, payload: { enabled: false } })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Rule not found.' } })
  })

  it('previews matching and non-matching rules with exact string minor units', async () => {
    const { cookie } = await register()
    const transaction = { title: 'Jollibee BGC', merchantName: 'JOLLIBEE', amountMinor: '9007199254740993', accountId: null, type: 'expense', source: 'import', currencyCode: 'PHP' }
    const matching = await app.inject({ method: 'POST', url: '/api/v1/rules/preview', headers: { cookie }, payload: { transaction, rule: { conditions: { merchantContains: 'jollibee', minAmountMinor: '9007199254740993' }, actions: { normalizedMerchant: 'Jollibee', addTags: ['food'] } } } })
    expect(matching.statusCode).toBe(200)
    expect(matching.json()).toMatchObject({ amountMinor: '9007199254740993', normalizedMerchant: 'Jollibee', tags: ['food'] })

    const nonMatching = await app.inject({ method: 'POST', url: '/api/v1/rules/preview', headers: { cookie }, payload: { transaction, rule: { conditions: { minAmountMinor: '9007199254740994' }, actions: { normalizedMerchant: 'Wrong' } } } })
    expect(nonMatching.statusCode).toBe(200)
    expect(nonMatching.json()).not.toHaveProperty('normalizedMerchant')
    expect(nonMatching.json().amountMinor).toBe('9007199254740993')
  }, 15_000)

  it('rejects malformed preview transactions at the HTTP boundary', async () => {
    const { cookie } = await register()
    const response = await app.inject({ method: 'POST', url: '/api/v1/rules/preview', headers: { cookie }, payload: { transaction: { title: 'Bad', amountMinor: 100, type: 'expense', source: 'import', currencyCode: 'PHP' }, rule: { conditions: {}, actions: {} } } })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })
})
