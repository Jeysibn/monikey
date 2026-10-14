// Real-Postgres, real-HTTP integration coverage for Phase 5 (Recurring
// Transactions + Worker). Written in response to QA Attempt 1 (see
// `main-brain/Projects/Monikey/Logs/2026-09-01 - Phase 5
// Recurring and Notifications - QA Attempt 1.md`):
//   - Defect 2: zero test coverage existed for this scope.
//   - Defect 1/3: the worker must not crash on one bad item, and must not
//     keep retrying against an archived/broken linked account forever.
//
// Route-level behavior (`POST /recurring`, `PATCH /recurring/:id/status`,
// `POST /recurring/:id/mark-paid`) is exercised via `app.inject()` against a
// real Fastify app and a real database, mirroring `auth.db.test.ts`'s
// approach. Worker-level behavior (`processDueRecurringItems`) is exercised
// directly against Prisma + the real `LedgerService`, mirroring
// `ledger.db.test.ts`/`goals.db.test.ts`.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'
import { scanDueRecurringItems } from '../../src/modules/recurring/recurring.worker.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

const APP_ORIGIN = 'http://localhost:8080'

function extractSessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  const cookie = res.cookies.find((c) => c.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

async function registerAndLogin(app: FastifyInstance, createdEmails: string[]) {
  const email = `qa-recurring-${randomUUID()}@monikey.test`
  createdEmails.push(email)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin: APP_ORIGIN },
    payload: { email, password: 'correct-horse-1', displayName: 'Recurring Test' },
  })
  expect(res.statusCode).toBe(201)
  return { userId: res.json().user.id as string, cookie: extractSessionCookie(res)! }
}

async function makeAccount(prisma: PrismaClient, userId: string, balanceMinor: number) {
  const accountId = randomUUID()
  await prisma.financialAccount.create({ data: { id: accountId, userId, name: 'Test cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: balanceMinor, openingBalanceMinor: balanceMinor } })
  return accountId
}

async function makeExpenseCategory(prisma: PrismaClient, userId: string | null) {
  const category = await prisma.category.create({ data: { userId, name: `Bills ${randomUUID()}`, color: '#123', allowsExpense: true } })
  return category.id
}

describeIfDb('RecurringModule routes (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdEmails: string[] = []
  let app: FastifyInstance

  beforeEach(async () => {
    const env = loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' })
    app = await buildApp({ env, prisma })
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } })
    await prisma.$disconnect()
  })

  it('creates a recurring item for the caller\'s own account/category', async () => {
    const { userId, cookie } = await registerAndLogin(app, createdEmails)
    const accountId = await makeAccount(prisma, userId, 100000)
    const categoryId = await makeExpenseCategory(prisma, userId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/recurring',
      headers: { origin: APP_ORIGIN, cookie },
      payload: { merchant: 'Netflix', amountMinor: '5000', frequency: 'monthly', nextDueDate: '2026-09-15', accountId, categoryId },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.userId).toBe(userId)
    expect(body.accountId).toBe(accountId)
    expect(body.status).toBe('active')
  })

  it('rejects creating a recurring item linked to another user\'s account', async () => {
    const owner = await registerAndLogin(app, createdEmails)
    const attacker = await registerAndLogin(app, createdEmails)
    const ownerAccountId = await makeAccount(prisma, owner.userId, 100000)
    const categoryId = await makeExpenseCategory(prisma, attacker.userId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/recurring',
      headers: { origin: APP_ORIGIN, cookie: attacker.cookie },
      payload: { merchant: 'Stolen bill', amountMinor: '5000', frequency: 'monthly', nextDueDate: '2026-09-15', accountId: ownerAccountId, categoryId },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('UNKNOWN_ACCOUNT')
  })

  it('rejects creating a recurring item linked to another user\'s category', async () => {
    const owner = await registerAndLogin(app, createdEmails)
    const attacker = await registerAndLogin(app, createdEmails)
    const accountId = await makeAccount(prisma, attacker.userId, 100000)
    const ownerCategoryId = await makeExpenseCategory(prisma, owner.userId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/recurring',
      headers: { origin: APP_ORIGIN, cookie: attacker.cookie },
      payload: { merchant: 'Stolen category', amountMinor: '5000', frequency: 'monthly', nextDueDate: '2026-09-15', accountId, categoryId: ownerCategoryId },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('UNKNOWN_CATEGORY')
  })

  it('pauses and resumes a recurring item scoped to the caller, and 404s for another user\'s item', async () => {
    const { userId, cookie } = await registerAndLogin(app, createdEmails)
    const other = await registerAndLogin(app, createdEmails)
    const accountId = await makeAccount(prisma, userId, 100000)
    const categoryId = await makeExpenseCategory(prisma, userId)
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Gym', amountMinor: BigInt(2000), frequency: 'monthly', nextDueDate: new Date('2026-09-15T00:00:00Z'), accountId, categoryId } })

    const pauseRes = await app.inject({ method: 'PATCH', url: `/api/v1/recurring/${item.id}/status`, headers: { origin: APP_ORIGIN, cookie }, payload: { status: 'paused' } })
    expect(pauseRes.statusCode).toBe(200)
    expect(pauseRes.json().status).toBe('paused')

    const resumeRes = await app.inject({ method: 'PATCH', url: `/api/v1/recurring/${item.id}/status`, headers: { origin: APP_ORIGIN, cookie }, payload: { status: 'active' } })
    expect(resumeRes.statusCode).toBe(200)
    expect(resumeRes.json().status).toBe('active')

    const crossUserRes = await app.inject({ method: 'PATCH', url: `/api/v1/recurring/${item.id}/status`, headers: { origin: APP_ORIGIN, cookie: other.cookie }, payload: { status: 'paused' } })
    expect(crossUserRes.statusCode).toBe(404)
  })

  it('mark-paid (legacy route) now confirms the current cycle through the safe service: one transaction, schedule advanced', async () => {
    const { userId, cookie } = await registerAndLogin(app, createdEmails)
    const accountId = await makeAccount(prisma, userId, 100000)
    const categoryId = await makeExpenseCategory(prisma, userId)
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Internet', amountMinor: BigInt(1500), frequency: 'monthly', nextDueDate: new Date('2026-09-01T00:00:00Z'), accountId, categoryId } })

    const first = await app.inject({ method: 'POST', url: `/api/v1/recurring/${item.id}/mark-paid`, headers: { origin: APP_ORIGIN, cookie } })
    expect(first.statusCode).toBe(201)
    expect(first.json().nextDueDate).toBe('2026-10-01')
    expect(first.json().lastPaidDate).not.toBeNull() // the actual payment date (today), not the scheduled date

    const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
    expect(account.currentBalanceMinor).toBe(BigInt(100000 - 1500))

    // Retrying mark-paid against the (now-advanced) due date is a distinct
    // idempotency key and therefore a second real charge — this is
    // deliberate double-posting protection at the single-due-date grain,
    // not an "already paid" no-op. Reproduce the true idempotent-retry path
    // instead: replay the same postTransaction call the route already made.
    const idempotencyKey = `recurring:${item.id}:2026-09-01`
    const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
    const retry = await ledger.postTransaction(userId, { type: 'expense', title: item.merchant, categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 1500, feeMinor: 0, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment', idempotencyKey })
    const accountAfterRetry = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
    expect(accountAfterRetry.currentBalanceMinor).toBe(BigInt(100000 - 1500))
    expect(Number(retry.transaction.amountMinor)).toBe(1500)
  })

  it('mark-paid rejects when the charge would overdraft the source account', async () => {
    const { userId, cookie } = await registerAndLogin(app, createdEmails)
    const accountId = await makeAccount(prisma, userId, 1000)
    const categoryId = await makeExpenseCategory(prisma, userId)
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Too expensive', amountMinor: BigInt(5000), frequency: 'monthly', nextDueDate: new Date('2026-09-01T00:00:00Z'), accountId, categoryId } })

    const res = await app.inject({ method: 'POST', url: `/api/v1/recurring/${item.id}/mark-paid`, headers: { origin: APP_ORIGIN, cookie } })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('ASSET_OVERDRAFT')

    const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
    expect(account.currentBalanceMinor).toBe(1000n)
    const unchanged = await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(unchanged.nextDueDate.toISOString().slice(0, 10)).toBe('2026-09-01')
  })
})

describeIfDb('recurring worker scan (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  afterAll(async () => { await prisma.$disconnect() })

  async function makeUser(suffix: string) {
    const userId = randomUUID()
    await prisma.user.create({ data: { id: userId, email: `${userId}@${suffix}.test`, passwordHash: 'test', displayName: 'Worker Test' } })
    return userId
  }

  it('reports due items and posts nothing for any of them (including archived-account and broken-category items)', async () => {
    const userId = await makeUser('worker-scan')
    const otherUserId = await makeUser('worker-scan-other')
    try {
      const accountId = await makeAccount(prisma, userId, 100000)
      const archivedId = await makeAccount(prisma, userId, 100000)
      await prisma.financialAccount.update({ where: { id: archivedId }, data: { archivedAt: new Date() } })
      const categoryId = await makeExpenseCategory(prisma, userId)
      const foreignCategory = await makeExpenseCategory(prisma, otherUserId)
      const due = new Date('2026-09-01T00:00:00Z')
      const mk = (merchant: string, over: Record<string, unknown> = {}) => prisma.recurringItem.create({ data: { userId, merchant, amountMinor: BigInt(1000), frequency: 'monthly', nextDueDate: due, accountId, categoryId, ...over } as never })
      const a = await mk('Bill A'); await mk('Bill B', { autopay: true }); await mk('On archived account', { accountId: archivedId }); await mk('Foreign category', { categoryId: foreignCategory })
      const warnings: string[] = []
      const result = await scanDueRecurringItems(prisma, '2026-09-01', { warn: (_o, msg) => { warnings.push(msg ?? '') } }, userId)
      expect(result).toEqual({ due: 4, overdue: 0 })
      expect(warnings).toHaveLength(1)
      expect(await prisma.transaction.count({ where: { userId } })).toBe(0)
      expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).currentBalanceMinor).toBe(100000n)
      const after = await prisma.recurringItem.findUniqueOrThrow({ where: { id: a.id } })
      expect(after.status).toBe('active'); expect(after.nextDueDate.toISOString().slice(0, 10)).toBe('2026-09-01'); expect(after.lastPaidDate).toBeNull()
      expect(await prisma.recurringItem.count({ where: { userId, status: 'paused' } })).toBe(0) // the scan never auto-pauses either
    } finally {
      await prisma.recurringItem.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined)
    }
  })
})
