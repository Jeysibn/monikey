// Stage 7B recurring lifecycle: schedule guard, settled-cycle edits and reversed payments.
// Real PostgreSQL, real HTTP (Fastify inject). Each test creates its own user; nothing depends on order.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { scanDueRecurringItems } from '../../src/modules/recurring/recurring.worker.js'
import { enqueueDueBillNotifications } from '../../src/modules/notifications/outbox.js'
import { deliverNotificationOutbox } from '../../src/modules/notifications/delivery.js'
import { localDateIso } from '../../src/common/timezone.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'
const d = (s: string) => new Date(`${s}T00:00:00Z`)

describeIfDb('Stage 7B recurring lifecycle and schedule guard (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const emails: string[] = []
  let app: FastifyInstance
  let ledger: LedgerService

  beforeAll(async () => {
    const [{ current_database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(current_database).toMatch(/test/i)
    app = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }), prisma })
    ledger = new LedgerService(prisma, new LedgerRepository(prisma))
  })
  afterAll(async () => {
    await app.close()
    await prisma.notificationOutbox.deleteMany({ where: { user: { email: { in: emails } } } })
    await prisma.budgetAllocation.deleteMany({ where: { budgetPeriod: { user: { email: { in: emails } } } } })
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  async function newUser(timezone?: string) {
    const email = `s7b-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', remoteAddress: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'S7A' } })
    const c = res.cookies.find((x) => x.name === 'monikey_session')!
    const userId = res.json().user.id as string
    if (timezone) await prisma.user.update({ where: { id: userId }, data: { timezone } })
    return { userId, cookie: `${c.name}=${c.value}` }
  }
  async function bill(userId: string, over: Record<string, unknown> = {}) {
    const accountId = (await prisma.financialAccount.create({ data: { userId, name: 'Cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: 1_000_000n, openingBalanceMinor: 1_000_000n } })).id
    const categoryId = (await prisma.category.create({ data: { userId, name: `Bills ${randomUUID()}`, color: '#123', allowsExpense: true } })).id
    const item = await prisma.recurringItem.create({ data: { userId, merchant: `Landlord ${randomUUID().slice(0, 6)}`, amountMinor: 25000, frequency: 'monthly', nextDueDate: d('2026-09-05'), accountId, categoryId, autopay: false, anchorDay: 5, ...over } as never })
    return { item, accountId, categoryId }
  }
  const call = (cookie: string | undefined, method: 'POST' | 'GET' | 'PATCH' | 'DELETE', url: string, payload?: unknown, origin: string | null = APP_ORIGIN) => app.inject({ method, url: `/api/v1${url}`, headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) }, payload: payload as object })
  const confirmBody = (over: Record<string, unknown> = {}) => ({ expectedDueDate: '2026-09-05', amountMinor: '25000', paidOn: '2026-09-05', ...over })
  const recTx = (userId: string) => prisma.transaction.count({ where: { userId, source: 'recurring' } })
  const bal = async (id: string) => (await prisma.financialAccount.findUniqueOrThrow({ where: { id } })).currentBalanceMinor
  const nextDue = async (id: string) => (await prisma.recurringItem.findUniqueOrThrow({ where: { id } })).nextDueDate.toISOString().slice(0, 10)
  const occ = (id: string) => prisma.recurringOccurrence.findMany({ where: { recurringItemId: id }, orderBy: { dueDate: 'asc' } })
  const code = (res: { json: () => { error?: { code?: string } } }) => res.json().error?.code

  describe('database schedule guard', () => {
    it('blocks a schedule change that does not announce a user-driven write, but allows pausing', async () => {
      const { userId } = await newUser(); const { item } = await bill(userId)
      await expect(prisma.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: d('2026-10-05'), lastPaidDate: d('2026-09-05') } })).rejects.toThrow(/user-driven/)
      await expect(prisma.recurringItem.update({ where: { id: item.id }, data: { lastPaidDate: d('2026-09-05') } })).rejects.toThrow(/user-driven/)
      expect(await nextDue(item.id)).toBe('2026-09-05')
      await prisma.recurringItem.update({ where: { id: item.id }, data: { status: 'paused' } }) // the old worker's failure path: conservative, allowed
      await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.recurring_schedule_write', 'on', true)`; await tx.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: d('2026-10-05') } }) })
      expect(await nextDue(item.id)).toBe('2026-10-05')
    })
    it('an old-worker style replay-then-advance cannot move the schedule or post', async () => {
      const { userId, cookie } = await newUser(); const { item, accountId } = await bill(userId)
      expect((await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody())).statusCode).toBe(201)
      const before = { bal: await bal(accountId), rec: await recTx(userId), due: await nextDue(item.id) }
      await expect(prisma.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: d('2026-11-05') } })).rejects.toThrow()
      expect({ bal: await bal(accountId), rec: await recTx(userId), due: await nextDue(item.id) }).toEqual(before)
    })
  })

  describe('editing the due date', () => {
    async function settled() {
      const { userId, cookie } = await newUser(); const { item, accountId } = await bill(userId)
      expect((await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody())).statusCode).toBe(201) // 09-05 paid, now due 10-05
      expect((await call(cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-10-05' })).statusCode).toBe(201) // 10-05 skipped, now due 11-05
      return { userId, cookie, item, accountId }
    }
    it('refuses a due date on or before a settled cycle, with an explanation, and changes nothing', async () => {
      const { userId, cookie, item, accountId } = await settled()
      const before = { occ: (await occ(item.id)).map((o) => [o.dueDate.toISOString(), o.status, o.transactionId]), bal: await bal(accountId), tx: await prisma.transaction.count({ where: { userId } }) }
      for (const date of ['2026-09-05', '2026-10-05', '2026-09-20', '2026-08-01']) {
        const res = await call(cookie, 'PATCH', `/recurring/${item.id}`, { nextDueDate: date })
        expect(res.statusCode, date).toBe(409); expect(code(res)).toBe('RECURRING_SETTLED_CYCLE')
        expect(res.json().error.message).toMatch(/already (paid|skipped).*Choose a due date after 2026-10-05/)
      }
      expect(await nextDue(item.id)).toBe('2026-11-05')
      expect({ occ: (await occ(item.id)).map((o) => [o.dueDate.toISOString(), o.status, o.transactionId]), bal: await bal(accountId), tx: await prisma.transaction.count({ where: { userId } }) }).toEqual(before)
    })
    it('allows a later due date and a no-op date, and the bill is never stuck afterwards', async () => {
      const { userId, cookie, item, accountId } = await settled()
      expect((await call(cookie, 'PATCH', `/recurring/${item.id}`, { nextDueDate: '2026-11-05', merchant: 'Renamed' })).statusCode).toBe(200)
      expect((await call(cookie, 'PATCH', `/recurring/${item.id}`, { nextDueDate: '2026-10-06' })).statusCode).toBe(200) // after the last settled cycle
      expect(await nextDue(item.id)).toBe('2026-10-06')
      const paid = await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody({ expectedDueDate: '2026-10-06', paidOn: '2026-10-06' }))
      expect(paid.statusCode).toBe(201); expect(await nextDue(item.id)).toBe('2026-11-06')
      expect(await recTx(userId)).toBe(2); expect(await bal(accountId)).toBe(1_000_000n - 50_000n)
      expect((await occ(item.id)).map((o) => o.status)).toEqual(['confirmed', 'skipped', 'confirmed'])
    })
    it('the edit is atomic with the guard: a schedule edit by another user is a 404 and changes nothing', async () => {
      const { item } = await settled(); const other = await newUser()
      expect((await call(other.cookie, 'PATCH', `/recurring/${item.id}`, { nextDueDate: '2027-01-01' })).statusCode).toBe(404)
      expect(await nextDue(item.id)).toBe('2026-11-05')
    })
  })

  describe('reversing a confirmed payment', () => {
    async function paidThenReversed() {
      const { userId, cookie } = await newUser(); const { item, accountId } = await bill(userId)
      const paid = await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody())
      expect(paid.statusCode).toBe(201)
      const txId = paid.json().transaction.id as string
      const rev = await call(cookie, 'POST', `/transactions/${txId}/reverse`, {})
      expect(rev.statusCode).toBeLessThan(300)
      return { userId, cookie, item, accountId, txId }
    }
    it('keeps the audit trail, restores the balance, and refuses to re-record the same cycle with an explanation', async () => {
      const { userId, cookie, item, accountId, txId } = await paidThenReversed()
      expect(await bal(accountId)).toBe(1_000_000n) // the reversal restored the money
      const txCount = await prisma.transaction.count({ where: { userId } })
      for (const [url, payload] of [
        [`/recurring/${item.id}/confirm-payment`, confirmBody()],
        [`/recurring/${item.id}/confirm-payment`, confirmBody({ amountMinor: '26000' })],
      ] as const) {
        const res = await call(cookie, 'POST', url, payload)
        expect(res.statusCode).toBe(409); expect(code(res)).toBe('RECURRING_PAYMENT_REVERSED')
        expect(res.json().error.message).toMatch(/reversed.*Quick Add/)
      }
      expect(await prisma.transaction.count({ where: { userId } })).toBe(txCount) // no duplicate posting
      const rows = await occ(item.id)
      expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ status: 'confirmed', transactionId: txId }) // occurrence untouched
      expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txId } })).reversedTransactionId).not.toBeNull() // reversal intact
      expect(await bal(accountId)).toBe(1_000_000n)
    })
    it('refuses skip and link for that cycle too, and a normal Quick Add repayment still works', async () => {
      const { userId, cookie, item, accountId } = await paidThenReversed()
      // the schedule already advanced when the payment was confirmed, so the next cycle is unaffected
      expect(await nextDue(item.id)).toBe('2026-10-05')
      const skip = await call(cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-09-05' })
      expect(skip.statusCode).toBe(409); expect(code(skip)).toBe('RECURRING_PAYMENT_REVERSED')
      const manual = await call(cookie, 'POST', '/transactions', { type: 'expense', title: 'Landlord corrected', fromAccountId: accountId, amountMinor: '24000', occurredOn: '2026-09-06', source: 'manual', status: 'cleared', idempotencyKey: `s7b-${randomUUID()}` })
      expect(manual.statusCode).toBe(201)
      const link = await call(cookie, 'POST', `/recurring/${item.id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: manual.json().transaction.id })
      expect(link.statusCode).toBe(409); expect(code(link)).toBe('RECURRING_PAYMENT_REVERSED')
      expect(await bal(accountId)).toBe(1_000_000n - 24_000n)
      expect(await recTx(userId)).toBe(1) // still only the original (reversed) recurring row
    })
    it('a reversed legacy auto-post for a stale cycle is reported as reversed, not as paid', async () => {
      const { userId, cookie } = await newUser(); const { item, accountId, categoryId } = await bill(userId)
      const key = `recurring:${item.id}:2026-09-05`
      const legacy = await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.recurring_confirmation', 'on', true)`; return ledger.postTransactionInTransaction(tx, userId, { type: 'expense', title: 'Legacy', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-05', occurredTime: null, amountMinor: 25000n, feeMinor: 0n, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: null, idempotencyKey: key }) })
      await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.recurring_schedule_write', 'on', true)`; await tx.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: d('2026-10-05') } }) })
      expect((await call(cookie, 'POST', `/transactions/${legacy.transaction.id}/reverse`, {})).statusCode).toBeLessThan(300)
      const res = await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody())
      expect(res.statusCode).toBe(409); expect(code(res)).toBe('RECURRING_PAYMENT_REVERSED')
    })
  })
})
