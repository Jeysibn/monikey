// Stage 7A audit of the Stage 6B recurring-payment implementation and its security surface.
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

describeIfDb('Stage 7A recurring safety and security (real PostgreSQL)', () => {
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
    const email = `s7a-${randomUUID()}@monikey.test`
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
  const legacyPost = (userId: string, accountId: string, itemId: string, due: string, categoryId: string) => ledger.postTransaction(userId, { type: 'expense', title: 'Rent', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: due, occurredTime: null, amountMinor: 25000, feeMinor: 0, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment', idempotencyKey: `recurring:${itemId}:${due}` } as never)

  describe('old or new workers cannot create recurring expenses', () => {
    it('the retired worker algorithm (ledger post under the recurring key) is refused by the database; nothing is written, no balance moves', async () => {
      const { userId } = await newUser()
      const { item, accountId, categoryId } = await bill(userId)
      await expect(legacyPost(userId, accountId, item.id, '2026-09-05', categoryId)).rejects.toThrow(/user-confirmed payment|P0001|raise/i)
      expect(await recTx(userId)).toBe(0)
      expect(await bal(accountId)).toBe(1_000_000n)
    })
    it('a raw INSERT or UPDATE cannot smuggle a recurring-keyed row in either', async () => {
      const { userId } = await newUser()
      const { item, accountId, categoryId } = await bill(userId)
      const insert = prisma.$executeRawUnsafe(`INSERT INTO transactions (id, user_id, type, title, category_id, from_account_id, occurred_on, amount_minor, fee_minor, currency_code, source, status, idempotency_key) VALUES (gen_random_uuid(), '${userId}', 'expense', 'x', '${categoryId}', '${accountId}', '2026-09-05', 1, 0, 'PHP', 'recurring', 'cleared', 'recurring:${item.id}:2026-09-05')`)
      await expect(insert).rejects.toThrow()
      const manual = await ledger.postTransaction(userId, { type: 'expense', title: 'm', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-05', occurredTime: null, amountMinor: 1, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: randomUUID() } as never)
      await expect(prisma.$executeRawUnsafe(`UPDATE transactions SET idempotency_key = 'recurring:${item.id}:2026-09-05' WHERE id = '${manual.transaction.id}'`)).rejects.toThrow()
      expect(await recTx(userId)).toBe(0)
    })
    it('an API client cannot forge the recurring key through POST /transactions', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId, categoryId } = await bill(userId)
      const res = await call(cookie, 'POST', '/transactions', { type: 'expense', title: 'forged', categoryId, fromAccountId: accountId, occurredOn: '2026-09-05', amountMinor: '25000', feeMinor: '0', currencyCode: 'PHP', source: 'manual', idempotencyKey: `recurring:${item.id}:2026-09-05` })
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
      expect(await recTx(userId)).toBe(0)
      expect(await prisma.transaction.count({ where: { userId } })).toBe(0)
    })
    it('the new worker scan is read-only: no transaction, no balance, no schedule, no status and no updatedAt change', async () => {
      const { userId } = await newUser()
      const { item, accountId } = await bill(userId, { nextDueDate: d('2026-08-01') })
      const before = await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })
      const out = await scanDueRecurringItems(prisma, '2026-10-15', undefined, userId)
      expect(out).toEqual({ due: 0, overdue: 1 })
      const after = await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })
      expect(after).toEqual(before)
      expect(await prisma.transaction.count({ where: { userId } })).toBe(0)
      expect(await bal(accountId)).toBe(1_000_000n)
    })
    it('legacy autopay=true is inert: due and overdue autopay bills are never posted by any server path', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId } = await bill(userId, { autopay: true, nextDueDate: d('2026-08-01') })
      await scanDueRecurringItems(prisma, '2026-10-15', undefined, userId)
      await call(cookie, 'GET', '/recurring'); await call(cookie, 'GET', '/bootstrap')
      expect(await recTx(userId)).toBe(0); expect(await nextDue(item.id)).toBe('2026-08-01'); expect(await bal(accountId)).toBe(1_000_000n)
    })
  })

  describe('retries and replays cannot confirm the wrong cycle', () => {
    it('replaying a confirmed cycle many times, before and after the next cycle is also paid, never pays another cycle', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId } = await bill(userId)
      const url = `/recurring/${item.id}/confirm-payment`
      expect((await call(cookie, 'POST', url, confirmBody())).statusCode).toBe(201)
      for (let i = 0; i < 3; i += 1) expect((await call(cookie, 'POST', url, confirmBody())).statusCode).toBe(200)
      expect(await nextDue(item.id)).toBe('2026-10-05')
      expect((await call(cookie, 'POST', url, confirmBody({ expectedDueDate: '2026-10-05', paidOn: '2026-10-05' }))).statusCode).toBe(201)
      for (let i = 0; i < 3; i += 1) expect((await call(cookie, 'POST', url, confirmBody())).statusCode).toBe(200) // Sep still just replays
      expect(await recTx(userId)).toBe(2); expect(await bal(accountId)).toBe(1_000_000n - 50_000n); expect(await nextDue(item.id)).toBe('2026-11-05')
    })
    it('a legacy auto-posted AND advanced cycle (no occurrence row) is refused, not paid again; the same date cannot be re-opened', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId, categoryId } = await bill(userId)
      await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.recurring_confirmation', 'on', true)`; await ledger.postTransactionInTransaction(tx, userId, { type: 'expense', title: 'Rent', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-05', occurredTime: null, amountMinor: 25000, feeMinor: 0, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment', idempotencyKey: `recurring:${item.id}:2026-09-05` } as never) })
      // fixture: the state an old worker used to leave behind (the schedule guard now blocks the worker itself; see stage7b-lifecycle)
      await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.recurring_schedule_write', 'on', true)`; await tx.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: d('2026-10-05') } }) })
      const res = await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody())
      expect(res.statusCode).toBe(409); expect(res.json().error.code).toBe('RECURRING_ALREADY_CONFIRMED')
      const skip = await call(cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-09-05' })
      expect(skip.statusCode).toBe(409)
      expect(await recTx(userId)).toBe(1); expect(await bal(accountId)).toBe(975_000n)
    })
    it('a legacy auto-posted but NOT advanced cycle is linked once, then replays idempotently and refuses different details', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId, categoryId } = await bill(userId)
      await prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.recurring_confirmation', 'on', true)`; await ledger.postTransactionInTransaction(tx, userId, { type: 'expense', title: 'Rent', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-05', occurredTime: null, amountMinor: 25000, feeMinor: 0, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment', idempotencyKey: `recurring:${item.id}:2026-09-05` } as never) })
      const url = `/recurring/${item.id}/confirm-payment`
      const first = await call(cookie, 'POST', url, confirmBody())
      expect(first.statusCode).toBe(201); expect(first.json().outcome).toBe('reconciled_existing')
      const again = await call(cookie, 'POST', url, confirmBody())
      expect(again.statusCode).toBe(200); expect(again.json().outcome).toBe('replayed')
      expect((await call(cookie, 'POST', url, confirmBody({ amountMinor: '99999' }))).statusCode).toBe(409)
      expect(await recTx(userId)).toBe(1); expect(await bal(accountId)).toBe(975_000n); expect(await nextDue(item.id)).toBe('2026-10-05')
    })
    it('a payment that was reversed afterwards is not silently reported as a live payment on replay, and the cycle is not re-posted', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId } = await bill(userId)
      const url = `/recurring/${item.id}/confirm-payment`
      const first = await call(cookie, 'POST', url, confirmBody())
      await ledger.reverseTransaction(userId, first.json().transaction.id, { idempotencyKey: null } as never)
      const replay = await call(cookie, 'POST', url, confirmBody())
      expect([200, 409]).toContain(replay.statusCode)
      expect(await bal(accountId)).toBe(1_000_000n) // reversal restored the balance; nothing was posted again
      expect(await prisma.transaction.count({ where: { userId } })).toBe(2) // original + its reversal, never a third
    })
  })

  describe('dates, backdating and user time zones', () => {
    it('backdated payments are allowed, land on the stated date and never in the future', async () => {
      const { userId, cookie } = await newUser()
      const { item } = await bill(userId)
      const url = `/recurring/${item.id}/confirm-payment`
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
      expect((await call(cookie, 'POST', url, confirmBody({ paidOn: tomorrow }))).statusCode).toBe(422)
      const res = await call(cookie, 'POST', url, confirmBody({ paidOn: '2026-08-01' })) // before the due date
      expect(res.statusCode).toBe(201)
      expect(res.json().transaction.occurredOn).toBe('2026-08-01')
      expect(res.json().recurring.lastPaidDate).toBe('2026-08-01')
    })
    it('"due" and "today" use the USER\'s calendar: a bill due on the user\'s local date is payable in UTC+14 and not yet in UTC-11', async () => {
      const east = await newUser('Pacific/Kiritimati')
      const west = await newUser('Pacific/Pago_Pago')
      const eastToday = localDateIso('Pacific/Kiritimati')
      const westToday = localDateIso('Pacific/Pago_Pago')
      expect(eastToday > westToday).toBe(true)
      const a = await bill(east.userId, { nextDueDate: d(eastToday), anchorDay: Number(eastToday.slice(8)) })
      const b = await bill(west.userId, { nextDueDate: d(eastToday), anchorDay: Number(eastToday.slice(8)) })
      const ok = await call(east.cookie, 'POST', `/recurring/${a.item.id}/confirm-payment`, { expectedDueDate: eastToday, amountMinor: '25000', paidOn: eastToday })
      expect(ok.statusCode, ok.body).toBe(201)
      const early = await call(west.cookie, 'POST', `/recurring/${b.item.id}/confirm-payment`, { expectedDueDate: eastToday, amountMinor: '25000', paidOn: westToday })
      expect(early.statusCode).toBe(422); expect(early.json().error.code).toBe('RECURRING_NOT_DUE')
      expect(await recTx(west.userId)).toBe(0)
    })
    it('legacy anchor drift: a row without anchor_day keeps its CURRENT day (documented), a row with anchor_day recovers it', async () => {
      const { userId, cookie } = await newUser()
      const drifted = await bill(userId, { nextDueDate: d('2026-02-28'), anchorDay: null })
      const anchored = await bill(userId, { nextDueDate: d('2026-02-28'), anchorDay: 31 })
      for (const i of [drifted.item, anchored.item]) expect((await call(cookie, 'POST', `/recurring/${i.id}/skip-cycle`, { expectedDueDate: '2026-02-28' })).statusCode).toBe(201)
      expect(await nextDue(drifted.item.id)).toBe('2026-03-28') // stays drifted until the user edits the due date (which sets the anchor)
      expect(await nextDue(anchored.item.id)).toBe('2026-03-31')
    })
  })

  describe('notifications', () => {
    it('reminders are deduplicated per bill and cycle', async () => {
      const { userId } = await newUser()
      const { item } = await bill(userId, { nextDueDate: d('2026-10-17') })
      expect(await enqueueDueBillNotifications(prisma, '2026-10-15', userId)).toBe(1)
      expect(await enqueueDueBillNotifications(prisma, '2026-10-15', userId)).toBe(0)
      expect(await prisma.notificationOutbox.count({ where: { userId, dedupeKey: `bill-due:${item.id}:2026-10-17` } })).toBe(1)
    })
    it('a reminder for a cycle that has since been paid or skipped is not delivered', async () => {
      const { userId, cookie } = await newUser()
      const { item } = await bill(userId, { nextDueDate: d('2026-10-14') })
      await enqueueDueBillNotifications(prisma, '2026-10-15', userId)
      expect((await call(cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-10-14' })).statusCode).toBe(201)
      const sent: string[] = []
      await deliverNotificationOutbox(prisma, { send: async (m: { text: string }) => { sent.push(m.text) } } as never)
      expect(sent.filter((t) => t.includes(`${item.merchant}`))).toEqual([])
      const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId } })
      expect(row.sentAt).toBeNull(); expect(row.lastError).toMatch(/^suppressed/)
    })
    it('a reminder amount is formatted from minor units without floating point', async () => {
      const { userId } = await newUser()
      const { item } = await bill(userId, { nextDueDate: d('2026-10-17'), amountMinor: 9_007_199_254_740_993n })
      await enqueueDueBillNotifications(prisma, '2026-10-15', userId)
      const sent: string[] = []
      await deliverNotificationOutbox(prisma, { send: async (m: { text: string }) => { sent.push(m.text) } } as never)
      expect(sent.find((t) => t.includes(item.merchant))).toContain('90,071,992,547,409.93')
    })
  })

  describe('security: authentication, ownership, CSRF, validation, leakage', () => {
    const verbs = (id: string, txId: string) => [
      ['POST', `/recurring/${id}/confirm-payment`, confirmBody()],
      ['POST', `/recurring/${id}/skip-cycle`, { expectedDueDate: '2026-09-05' }],
      ['POST', `/recurring/${id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: txId }],
      ['POST', `/recurring/${id}/mark-paid`, undefined],
      ['GET', `/recurring/${id}/payment-candidates`, undefined],
    ] as const
    it('every payment endpoint requires a session', async () => {
      const id = randomUUID()
      for (const [m, url, body] of verbs(id, randomUUID())) expect((await call(undefined, m, url, body)).statusCode, url).toBe(401)
    })
    it('every mutating payment endpoint rejects a missing or foreign Origin (CSRF) and changes nothing', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId } = await bill(userId)
      for (const origin of [null, 'https://evil.example']) {
        for (const [m, url, body] of verbs(item.id, randomUUID())) {
          if (m === 'GET') continue
          expect((await call(cookie, m, url, body, origin)).statusCode, `${origin} ${url}`).toBe(403)
        }
      }
      expect(await recTx(userId)).toBe(0); expect(await nextDue(item.id)).toBe('2026-09-05'); expect(await bal(accountId)).toBe(1_000_000n)
    })
    it("another user's bill, transaction and candidates are invisible (404) and untouched", async () => {
      const owner = await newUser(); const intruder = await newUser()
      const { item, accountId, categoryId } = await bill(owner.userId)
      const theirs = await bill(intruder.userId)
      const ownerTx = await ledger.postTransaction(owner.userId, { type: 'expense', title: 'Owner', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-05', occurredTime: null, amountMinor: 25000, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: randomUUID() } as never)
      for (const [m, url, body] of verbs(item.id, ownerTx.transaction.id)) { const r = await call(intruder.cookie, m, url, body); expect(r.statusCode, url).toBe(404); expect(JSON.stringify(r.json())).not.toContain(owner.userId) }
      // The intruder's own bill must not accept the owner's transaction, nor their own account being swapped for the owner's.
      const link = await call(intruder.cookie, 'POST', `/recurring/${theirs.item.id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: ownerTx.transaction.id })
      expect(link.statusCode).toBe(404)
      const swap = await call(intruder.cookie, 'POST', `/recurring/${theirs.item.id}/confirm-payment`, confirmBody({ accountId, allowPossibleDuplicate: true }))
      expect(swap.statusCode).toBe(404)
      const cands = await call(intruder.cookie, 'GET', `/recurring/${theirs.item.id}/payment-candidates`)
      expect(JSON.stringify(cands.json())).not.toContain(ownerTx.transaction.id)
      expect(await recTx(owner.userId)).toBe(0); expect(await recTx(intruder.userId)).toBe(0); expect(await bal(accountId)).toBe(975_000n)
    })
    it('malformed or hostile input is a 4xx with the standard envelope, never a 500 and never a stack/SQL leak', async () => {
      const { userId, cookie } = await newUser()
      const { item } = await bill(userId)
      const url = `/recurring/${item.id}/confirm-payment`
      const cases: unknown[] = [
        confirmBody({ amountMinor: '0' }), confirmBody({ amountMinor: '-5' }), confirmBody({ amountMinor: '1.5' }), confirmBody({ amountMinor: 'abc' }),
        confirmBody({ amountMinor: '9'.repeat(30) }), // beyond bigint column range
        confirmBody({ expectedDueDate: '2026-13-45' }), confirmBody({ paidOn: 'yesterday' }), confirmBody({ accountId: 'not-a-uuid' }),
        {}, confirmBody({ allowPossibleDuplicate: 'yes' }),
      ]
      for (const body of cases) {
        const r = await call(cookie, 'POST', url, body)
        expect(r.statusCode, JSON.stringify(body)).toBeGreaterThanOrEqual(400); expect(r.statusCode, JSON.stringify(body)).toBeLessThan(500)
        expect(r.body).not.toMatch(/prisma|select |at \S+\.(ts|js):\d+|node_modules|postgres/i)
      }
      for (const u of ['/recurring/not-a-uuid/confirm-payment', '/recurring/not-a-uuid/skip-cycle', '/recurring/not-a-uuid/payment-candidates']) {
        const r = await call(cookie, u.endsWith('candidates') ? 'GET' : 'POST', u, u.endsWith('candidates') ? undefined : confirmBody()); expect(r.statusCode, u).toBeGreaterThanOrEqual(400); expect(r.statusCode, u).toBeLessThan(500)
      }
      const huge = await call(cookie, 'GET', `/recurring/${item.id}/payment-candidates?amountMinor=${'9'.repeat(30)}`)
      expect(huge.statusCode).toBeLessThan(500)
      expect(await recTx(userId)).toBe(0)
    })
    it('an overdraft or other ledger refusal is a clean 4xx and leaves the cycle payable', async () => {
      const { userId, cookie } = await newUser()
      const { item, accountId } = await bill(userId)
      const r = await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody({ amountMinor: '5000000' }))
      expect(r.statusCode).toBeGreaterThanOrEqual(400); expect(r.statusCode).toBeLessThan(500)
      expect(await recTx(userId)).toBe(0); expect(await bal(accountId)).toBe(1_000_000n); expect(await nextDue(item.id)).toBe('2026-09-05')
      expect((await call(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, confirmBody())).statusCode).toBe(201)
    })
    it('the kill switch stops confirm, link and mark-paid but never enables anything; skip stays available (no ledger effect)', async () => {
      const killApp = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false', RECURRING_CONFIRMATIONS_DISABLED: 'true' }), prisma })
      try {
        const { userId, cookie } = await newUser()
        const { item } = await bill(userId)
        const k = (method: 'POST', url: string, payload: unknown) => killApp.inject({ method, url: `/api/v1${url}`, headers: { origin: APP_ORIGIN, cookie }, payload: payload as object })
        expect((await k('POST', `/recurring/${item.id}/confirm-payment`, confirmBody())).statusCode).toBe(503)
        expect((await k('POST', `/recurring/${item.id}/mark-paid`, undefined)).statusCode).toBe(503)
        expect((await k('POST', `/recurring/${item.id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: randomUUID() })).statusCode).toBe(503)
        expect(await recTx(userId)).toBe(0)
        expect(await scanDueRecurringItems(prisma, '2026-10-15', undefined, userId)).toEqual({ due: 0, overdue: 1 }) // the worker has no "enable posting" setting at all
        expect(await recTx(userId)).toBe(0)
      } finally { await killApp.close() }
    })
  })
})
