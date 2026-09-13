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

describeIfDb('Reports routes (real PostgreSQL, real HTTP)', () => {
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
    const email = `reports-route-${randomUUID()}@monikey.test`
    emails.push(email)
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Reports Test' } })
    expect(response.statusCode).toBe(201)
    return { userId: response.json().user.id as string, cookie: sessionCookie(response) }
  }

  it('uses the full calendar quarter and serializes report money as exact strings', async () => {
    const { userId, cookie } = await register()
    const account = await prisma.financialAccount.create({ data: { userId, name: 'Cash', accountType: 'cash', classification: 'asset', openingBalanceMinor: 0n, currentBalanceMinor: 0n } })
    const tag = await prisma.transactionTag.create({ data: { userId, name: 'reimbursable' } })
    const firstQuarter = await prisma.transaction.create({ data: { userId, type: 'expense', title: 'Q1 expense', fromAccountId: account.id, occurredOn: new Date('2026-03-31T12:00:00Z'), amountMinor: 9007199254740993n, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })
    await prisma.transactionTagOnTransaction.create({ data: { transactionId: firstQuarter.id, tagId: tag.id } })
    await prisma.transaction.create({ data: { userId, type: 'income', title: 'Q2 income', toAccountId: account.id, occurredOn: new Date('2026-04-01T12:00:00Z'), amountMinor: 500n, currencyCode: 'PHP', source: 'manual', status: 'cleared' } })

    const summary = await app.inject({ method: 'GET', url: '/api/v1/reports/summary?view=quarterly&period=2026-02', headers: { cookie } })
    expect(summary.statusCode).toBe(200)
    expect(summary.json()).toMatchObject({ income: '0', expenses: '9007199254740993', netCashFlow: '-9007199254740993' })

    const tags = await app.inject({ method: 'GET', url: '/api/v1/reports/spending-by-tag?from=2026-01-01&to=2026-03-31', headers: { cookie } })
    expect(tags.statusCode).toBe(200)
    expect(tags.json()).toEqual([{ tagId: tag.id, tagName: 'reimbursable', spent: '9007199254740993' }])
  })
})
