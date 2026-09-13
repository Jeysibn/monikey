import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'

function sessionCookie(response: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = response.cookies.find((candidate) => candidate.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : ''
}

describeIfDb('Tags routes (real PostgreSQL, real HTTP)', () => {
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

  async function register() {
    const email = `tags-${randomUUID()}@monikey.test`
    emails.push(email)
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Tags Test' } })
    expect(response.statusCode).toBe(201)
    return { userId: response.json().user.id as string, cookie: sessionCookie(response) }
  }

  it('creates, lists, assigns, and deletes user-owned tags with schema-valid responses', async () => {
    const { userId, cookie } = await register()
    const account = await prisma.financialAccount.create({ data: { userId, name: 'Cash', accountType: 'cash', classification: 'asset', openingBalanceMinor: 10000n, currentBalanceMinor: 10000n } })
    const transaction = await prisma.transaction.create({ data: { userId, type: 'expense', title: 'Lunch', fromAccountId: account.id, occurredOn: new Date('2026-09-13T00:00:00Z'), amountMinor: 500n, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })

    const created = await app.inject({ method: 'POST', url: '/api/v1/tags', headers: { origin: APP_ORIGIN, cookie }, payload: { name: 'reimbursable' } })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ userId, name: 'reimbursable' })
    const tagId = created.json().id as string

    const listed = await app.inject({ method: 'GET', url: '/api/v1/tags', headers: { cookie } })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toEqual([expect.objectContaining({ id: tagId, name: 'reimbursable' })])

    const assigned = await app.inject({ method: 'PUT', url: `/api/v1/transactions/${transaction.id}/tags`, headers: { origin: APP_ORIGIN, cookie }, payload: { tagIds: [tagId] } })
    expect(assigned.statusCode).toBe(200)
    expect(assigned.json()).toEqual([expect.objectContaining({ id: tagId })])

    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/tags/${tagId}`, headers: { origin: APP_ORIGIN, cookie } })
    expect(removed.statusCode).toBe(204)
  })

  it('rejects assigning another user’s tag without stripping the error envelope', async () => {
    const owner = await register()
    const attacker = await register()
    const tag = await prisma.transactionTag.create({ data: { userId: owner.userId, name: 'private' } })
    const account = await prisma.financialAccount.create({ data: { userId: attacker.userId, name: 'Cash', accountType: 'cash', classification: 'asset', openingBalanceMinor: 10000n, currentBalanceMinor: 10000n } })
    const transaction = await prisma.transaction.create({ data: { userId: attacker.userId, type: 'expense', title: 'Lunch', fromAccountId: account.id, occurredOn: new Date('2026-09-13T00:00:00Z'), amountMinor: 500n, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })

    const response = await app.inject({ method: 'PUT', url: `/api/v1/transactions/${transaction.id}/tags`, headers: { origin: APP_ORIGIN, cookie: attacker.cookie }, payload: { tagIds: [tag.id] } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: 'One or more tags are not owned by the user.' } })
  })
})
