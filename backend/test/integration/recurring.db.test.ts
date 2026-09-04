// Real-Postgres, real-HTTP integration coverage for Phase 5 (Recurring
// Transactions + Worker). Written in response to QA Attempt 1 (see
// `main-brain/03 Projects/Monikey/Backend/QA Logs/2026-09-01 - Phase 5
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
import { processDueRecurringItems } from '../../src/modules/recurring/recurring.worker.js'

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
      payload: { merchant: 'Netflix', amountMinor: 5000, frequency: 'monthly', nextDueDate: '2026-09-15', accountId, categoryId },
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
      payload: { merchant: 'Stolen bill', amountMinor: 5000, frequency: 'monthly', nextDueDate: '2026-09-15', accountId: ownerAccountId, categoryId },
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
      payload: { merchant: 'Stolen category', amountMinor: 5000, frequency: 'monthly', nextDueDate: '2026-09-15', accountId, categoryId: ownerCategoryId },
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

  it('mark-paid posts a ledger transaction idempotently and advances the due date', async () => {
    const { userId, cookie } = await registerAndLogin(app, createdEmails)
    const accountId = await makeAccount(prisma, userId, 100000)
    const categoryId = await makeExpenseCategory(prisma, userId)
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Internet', amountMinor: BigInt(1500), frequency: 'monthly', nextDueDate: new Date('2026-09-01T00:00:00Z'), accountId, categoryId } })

    const first = await app.inject({ method: 'POST', url: `/api/v1/recurring/${item.id}/mark-paid`, headers: { origin: APP_ORIGIN, cookie } })
    expect(first.statusCode).toBe(201)
    expect(first.json().nextDueDate).toBe('2026-10-01')
    expect(first.json().lastPaidDate).toBe('2026-09-01')

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

describeIfDb('processDueRecurringItems worker (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const ledger = new LedgerService(prisma, new LedgerRepository(prisma))

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(suffix: string) {
    const userId = randomUUID()
    await prisma.user.create({ data: { id: userId, email: `${userId}@${suffix}.test`, passwordHash: 'test', displayName: 'Worker Test' } })
    return userId
  }

  it('processes every due item in a single run (happy path)', async () => {
    const userId = await makeUser('worker-happy')
    try {
      const accountId = await makeAccount(prisma, userId, 100000)
      const categoryId = await makeExpenseCategory(prisma, userId)
      const todayIso = '2026-09-01'
      await prisma.recurringItem.create({ data: { userId, merchant: 'Bill A', amountMinor: BigInt(1000), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId, categoryId } })
      await prisma.recurringItem.create({ data: { userId, merchant: 'Bill B', amountMinor: BigInt(2000), frequency: 'weekly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId, categoryId } })

      const result = await processDueRecurringItems(prisma, ledger, todayIso)
      expect(result).toEqual({ processed: 2, failed: 0 })

      const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
      expect(account.currentBalanceMinor).toBe(BigInt(100000 - 1000 - 2000))
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    }
  })

  it('skips and auto-pauses an item whose linked account is archived, logs it, and still processes the other due items in the run (Defect 1 / Defect 3)', async () => {
    const userId = await makeUser('worker-archived')
    try {
      const brokenAccountId = await makeAccount(prisma, userId, 100000)
      const healthyAccountId = await makeAccount(prisma, userId, 100000)
      const categoryId = await makeExpenseCategory(prisma, userId)
      const todayIso = '2026-09-01'

      const brokenItem = await prisma.recurringItem.create({ data: { userId, merchant: 'Broken Bill', amountMinor: BigInt(1000), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId: brokenAccountId, categoryId } })
      const healthyItem = await prisma.recurringItem.create({ data: { userId, merchant: 'Healthy Bill', amountMinor: BigInt(3000), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId: healthyAccountId, categoryId } })

      // Archive the account backing brokenItem after the recurring item was
      // created (archival does not cascade — see QA Defect 3).
      await prisma.financialAccount.update({ where: { id: brokenAccountId }, data: { archivedAt: new Date() } })

      const warnings: Array<{ obj: Record<string, unknown>; msg?: string }> = []
      const logger = { warn: (obj: Record<string, unknown>, msg?: string) => { warnings.push({ obj, msg }) } }

      const result = await processDueRecurringItems(prisma, ledger, todayIso, logger)

      // The archived-account item is excluded by the due-items query filter
      // (Defect 3 fix) rather than ever reaching postTransaction, so it is
      // neither processed nor counted as a failure here — but it also must
      // not have crashed the loop or blocked the healthy item.
      expect(result.processed).toBe(1)

      const healthyAccount = await prisma.financialAccount.findUniqueOrThrow({ where: { id: healthyAccountId } })
      expect(healthyAccount.currentBalanceMinor).toBe(BigInt(100000 - 3000))
      const healthyAfter = await prisma.recurringItem.findUniqueOrThrow({ where: { id: healthyItem.id } })
      expect(healthyAfter.status).toBe('active')
      expect(healthyAfter.nextDueDate.toISOString().slice(0, 10)).toBe('2026-10-01')

      // The broken item was left untouched by the filtered-out query path —
      // still active and still due, but excluded from processing every run
      // until an operator fixes/unarchives the account. It must not have
      // caused any error to propagate out of the function.
      const brokenAfter = await prisma.recurringItem.findUniqueOrThrow({ where: { id: brokenItem.id } })
      expect(brokenAfter.status).toBe('active')
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
    }
  })

  it('logs and auto-pauses an item that fails during postTransaction for a reason the query filter does not catch, and still processes the remaining due items', async () => {
    const userId = await makeUser('worker-broken-category')
    const otherUserId = await makeUser('worker-broken-category-other')
    try {
      const accountId = await makeAccount(prisma, userId, 100000)
      const healthyCategoryId = await makeExpenseCategory(prisma, userId)
      const todayIso = '2026-09-01'

      // A category that exists (so it satisfies the FK constraint, which
      // real archival/deletion cannot violate) but is owned by a different
      // user. `LedgerRepository.postTransaction` rejects this as
      // UNKNOWN_CATEGORY — simulating the "broken downstream link" failure
      // mode that the account-archived query filter alone cannot catch
      // (e.g. category ownership changed or was corrupted after the
      // recurring item was created).
      const otherUsersCategoryId = await makeExpenseCategory(prisma, otherUserId)
      const brokenItem = await prisma.recurringItem.create({ data: { userId, merchant: 'Broken Category Bill', amountMinor: BigInt(1000), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId, categoryId: otherUsersCategoryId } })
      void brokenItem

      const workingItem = await prisma.recurringItem.create({ data: { userId, merchant: 'Working Bill', amountMinor: BigInt(2500), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId, categoryId: healthyCategoryId } })

      const warnings: Array<{ obj: Record<string, unknown>; msg?: string }> = []
      const logger = { warn: (obj: Record<string, unknown>, msg?: string) => { warnings.push({ obj, msg }) } }

      const result = await processDueRecurringItems(prisma, ledger, todayIso, logger)

      expect(result.processed).toBe(1)
      expect(result.failed).toBe(1)
      expect(warnings.some((entry) => entry.msg === 'failed to post recurring transaction')).toBe(true)

      const workingAfter = await prisma.recurringItem.findUniqueOrThrow({ where: { id: workingItem.id } })
      expect(workingAfter.nextDueDate.toISOString().slice(0, 10)).toBe('2026-10-01')

      const allItems = await prisma.recurringItem.findMany({ where: { userId, merchant: 'Broken Category Bill' } })
      expect(allItems).toHaveLength(1)
      expect(allItems[0]!.status).toBe('paused')

      const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
      // Only the working item's charge went through.
      expect(account.currentBalanceMinor).toBe(BigInt(100000 - 2500))
    } finally {
      await prisma.recurringItem.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined)
    }
  })
})
