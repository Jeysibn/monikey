// Stage 6B: manual recurring-payment confirmation, against real PostgreSQL and real HTTP.
// Covers what the stage-2 characterization file does not: atomic rollback by DB-level fault injection,
// retries with changed details, stale cycles, skip, link-existing, archived resources, the kill switch,
// the legacy mark-paid, budget totals and month-end scheduling.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { advanceDueDate } from '../../src/modules/recurring/recurring.schedule.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

describe('advanceDueDate (pure)', () => {
  it('clamps to month end and returns to the anchor day', () => {
    expect(iso(advanceDueDate(d('2026-01-31'), 'monthly', 31))).toBe('2026-02-28')
    expect(iso(advanceDueDate(d('2026-02-28'), 'monthly', 31))).toBe('2026-03-31')
    expect(iso(advanceDueDate(d('2026-03-31'), 'monthly', 31))).toBe('2026-04-30')
    expect(iso(advanceDueDate(d('2026-04-30'), 'monthly', 31))).toBe('2026-05-31')
    expect(iso(advanceDueDate(d('2026-01-29'), 'monthly', 29))).toBe('2026-02-28')
    expect(iso(advanceDueDate(d('2026-01-30'), 'monthly', 30))).toBe('2026-02-28')
  })
  it('handles leap years', () => {
    expect(iso(advanceDueDate(d('2028-01-31'), 'monthly', 31))).toBe('2028-02-29')
    expect(iso(advanceDueDate(d('2028-02-29'), 'monthly', 31))).toBe('2028-03-31')
    expect(iso(advanceDueDate(d('2028-02-29'), 'yearly', 29))).toBe('2029-02-28')
    expect(iso(advanceDueDate(d('2029-02-28'), 'yearly', 29))).toBe('2030-02-28')
    expect(iso(advanceDueDate(d('2031-02-28'), 'yearly', 29))).toBe('2032-02-29')
    expect(iso(advanceDueDate(d('2027-02-28'), 'yearly', 29))).toBe('2028-02-29')
  })
  it('rolls over December and weekly across month ends, and falls back to the due day for legacy rows', () => {
    expect(iso(advanceDueDate(d('2026-12-31'), 'monthly', null))).toBe('2027-01-31')
    expect(iso(advanceDueDate(d('2026-12-28'), 'weekly', null))).toBe('2027-01-04')
    expect(iso(advanceDueDate(d('2026-01-31'), 'monthly', null))).toBe('2026-02-28')
  })
})

describeIfDb('Stage 6B recurring confirmation (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const emails: string[] = []
  let app: FastifyInstance
  let killApp: FastifyInstance

  beforeAll(async () => {
    const [{ current_database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(current_database).toMatch(/test/i)
    const base = { DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }
    app = await buildApp({ env: loadEnv(base), prisma })
    killApp = await buildApp({ env: loadEnv({ ...base, RECURRING_CONFIRMATIONS_DISABLED: 'true' }), prisma })
  })
  afterAll(async () => {
    await app.close(); await killApp.close()
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_advance ON recurring_items')
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_advance_fn()')
    await prisma.budgetAllocation.deleteMany({ where: { budgetPeriod: { user: { email: { in: emails } } } } })
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  async function newUser() {
    const email = `r6b-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', remoteAddress: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'R6B' } })
    const c = res.cookies.find((x) => x.name === 'monikey_session')!
    return { userId: res.json().user.id as string, cookie: `${c.name}=${c.value}` }
  }
  const cash = async (userId: string, balance = 100000) => (await prisma.financialAccount.create({ data: { userId, name: 'Cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: balance, openingBalanceMinor: balance } })).id
  const bal = async (id: string) => (await prisma.financialAccount.findUniqueOrThrow({ where: { id } })).currentBalanceMinor
  const cat = async (userId: string) => (await prisma.category.create({ data: { userId, name: `Bills ${randomUUID()}`, color: '#123', allowsExpense: true } })).id
  async function bill(userId: string, over: Record<string, unknown> = {}) {
    const accountId = (over.accountId as string) ?? (await cash(userId))
    const categoryId = (over.categoryId as string) ?? (await cat(userId))
    const item = await prisma.recurringItem.create({ data: { userId, merchant: `Landlord ${randomUUID().slice(0, 6)}`, amountMinor: 25000, frequency: 'monthly', nextDueDate: d('2026-09-05'), accountId, categoryId, autopay: false, ...over } as never })
    return { item, accountId, categoryId }
  }
  const call = (a: FastifyInstance, cookie: string, method: 'POST' | 'GET', url: string, payload?: unknown) => a.inject({ method, url: `/api/v1${url}`, headers: { origin: APP_ORIGIN, cookie }, payload: payload as object })
  const confirm = (cookie: string, id: string, over: Record<string, unknown> = {}) => call(app, cookie, 'POST', `/recurring/${id}/confirm-payment`, { expectedDueDate: '2026-09-05', amountMinor: '25000', paidOn: '2026-09-05', ...over })
  const txCount = (userId: string) => prisma.transaction.count({ where: { userId, source: 'recurring' } })
  const nextDue = async (id: string) => iso((await prisma.recurringItem.findUniqueOrThrow({ where: { id } })).nextDueDate)

  it('rolls back the ledger post and the occurrence when advancing the schedule fails', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await bill(userId)
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_advance_fn() RETURNS trigger AS $$ BEGIN IF NEW.next_due_date <> OLD.next_due_date AND OLD.id = '${item.id}' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_advance ON recurring_items')
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_advance BEFORE UPDATE ON recurring_items FOR EACH ROW EXECUTE FUNCTION fail_advance_fn()')
    try {
      const res = await confirm(cookie, item.id)
      expect(res.statusCode).toBeGreaterThanOrEqual(500)
      expect(await txCount(userId)).toBe(0)
      expect(await bal(accountId)).toBe(100000n)
      expect(await prisma.recurringOccurrence.count({ where: { recurringItemId: item.id } })).toBe(0)
      expect(await nextDue(item.id)).toBe('2026-09-05')
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_advance ON recurring_items')
    }
    expect((await confirm(cookie, item.id)).statusCode).toBe(201) // the cycle is still payable afterwards
    expect(await txCount(userId)).toBe(1)
  })

  it('a retry with a changed amount or account cannot mutate a confirmed payment', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await bill(userId)
    const other = await cash(userId)
    expect((await confirm(cookie, item.id)).statusCode).toBe(201)
    const amount = await confirm(cookie, item.id, { amountMinor: '30000' })
    const account = await confirm(cookie, item.id, { accountId: other })
    for (const r of [amount, account]) { expect(r.statusCode).toBe(409); expect(r.json().error.code).toBe('RECURRING_ALREADY_CONFIRMED'); expect(r.json().error.transaction.amountMinor).toBe('25000') }
    expect(await txCount(userId)).toBe(1); expect(await bal(accountId)).toBe(75000n); expect(await bal(other)).toBe(100000n)
  })

  it('an older cycle cannot pay or advance the current one; a skipped cycle cannot be paid', async () => {
    const { userId, cookie } = await newUser()
    const { item } = await bill(userId)
    expect((await confirm(cookie, item.id)).statusCode).toBe(201)
    expect(await nextDue(item.id)).toBe('2026-10-05')
    const stale = await confirm(cookie, item.id, { expectedDueDate: '2026-08-05' })
    expect(stale.statusCode).toBe(409); expect(stale.json().error.code).toBe('RECURRING_STALE_CYCLE')
    const ahead = await confirm(cookie, item.id, { expectedDueDate: '2026-11-05' })
    expect(ahead.statusCode).toBe(422)
    expect(await nextDue(item.id)).toBe('2026-10-05'); expect(await txCount(userId)).toBe(1)
    const skipped = await call(app, cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-10-05' })
    expect(skipped.statusCode).toBe(201)
    const pay = await confirm(cookie, item.id, { expectedDueDate: '2026-10-05', paidOn: '2026-10-05' })
    expect(pay.statusCode).toBe(409); expect(pay.json().error.code).toBe('RECURRING_CYCLE_SKIPPED')
  })

  it('concurrent confirmations of successive cycles each pay only the cycle they name, once', async () => {
    const { userId, cookie } = await newUser()
    const { item } = await bill(userId, { nextDueDate: d('2026-08-05') })
    // Out-of-order and duplicated requests, all at once. The row lock serialises them; a request can only
    // succeed if the cycle it names is current when it acquires the lock.
    const dues = ['2026-10-05', '2026-09-05', '2026-08-05', '2026-08-05', '2026-09-05']
    const rs = await Promise.all(dues.map((due) => confirm(cookie, item.id, { expectedDueDate: due, paidOn: '2026-10-10', allowPossibleDuplicate: true })))
    const paid = await prisma.recurringOccurrence.findMany({ where: { recurringItemId: item.id }, orderBy: { dueDate: 'asc' } })
    expect(await txCount(userId)).toBe(paid.length)
    expect(new Set(paid.map((o) => o.transactionId)).size).toBe(paid.length)
    for (const r of rs) expect([200, 201, 409, 422]).toContain(r.statusCode)
    expect(paid.map((o) => iso(o.dueDate))).toEqual([...new Set(paid.map((o) => iso(o.dueDate)))])
    // The schedule is exactly one month past the last paid cycle: nothing was skipped over or double-advanced.
    const last = iso(paid[paid.length - 1]!.dueDate)
    expect(await nextDue(item.id)).toBe(iso(advanceDueDate(d(last), 'monthly', null)))
  })

  it('skipping a missed cycle records no expense, moves no balance, and advances only one cycle', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await bill(userId, { nextDueDate: d('2026-07-05') })
    const res = await call(app, cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-07-05' })
    expect(res.statusCode).toBe(201); expect(res.json().transaction).toBeNull()
    expect(await nextDue(item.id)).toBe('2026-08-05'); expect(await txCount(userId)).toBe(0); expect(await bal(accountId)).toBe(100000n)
    expect((await call(app, cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-07-05' })).json().outcome).toBe('replayed')
  })

  it('link-payment attaches an existing expense without posting, and rejects reuse', async () => {
    const { userId, cookie } = await newUser()
    const a = await bill(userId); const b = await bill(userId)
    const manual = await call(app, cookie, 'POST', '/transactions', { type: 'expense', title: 'Rent paid by hand', categoryId: a.categoryId, fromAccountId: a.accountId, occurredOn: '2026-09-04', amountMinor: '25000', feeMinor: '0', currencyCode: 'PHP', source: 'manual', idempotencyKey: randomUUID() })
    expect(manual.statusCode, manual.body).toBe(201)
    const txId = (manual.json().transaction?.id ?? manual.json().id) as string
    const before = await bal(a.accountId)
    const linked = await call(app, cookie, 'POST', `/recurring/${a.item.id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: txId })
    expect(linked.statusCode).toBe(201); expect(linked.json().outcome).toBe('linked')
    expect(await bal(a.accountId)).toBe(before); expect(await txCount(userId)).toBe(0)
    expect(await nextDue(a.item.id)).toBe('2026-10-05')
    const reuse = await call(app, cookie, 'POST', `/recurring/${b.item.id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: txId })
    expect(reuse.statusCode).toBe(409)
    const cands = await call(app, cookie, 'GET', `/recurring/${a.item.id}/payment-candidates?dueDate=2026-10-05`)
    expect(cands.json().candidates.find((c: { transactionId: string }) => c.transactionId === txId)).toBeUndefined()
  })

  it('rejects archived account and category with specific errors and leaves state untouched', async () => {
    const { userId, cookie } = await newUser()
    const x = await bill(userId); const y = await bill(userId)
    await prisma.financialAccount.update({ where: { id: x.accountId }, data: { archivedAt: new Date() } })
    await prisma.category.update({ where: { id: y.categoryId }, data: { archivedAt: new Date() } })
    const a = await confirm(cookie, x.item.id); const c = await confirm(cookie, y.item.id)
    expect(a.json().error.code).toBe('ACCOUNT_ARCHIVED'); expect(c.json().error.code).toBe('UNKNOWN_CATEGORY')
    expect(await txCount(userId)).toBe(0); expect(await nextDue(x.item.id)).toBe('2026-09-05')
  })

  it('validates the body: non-positive amount, future payment date, missing cycle', async () => {
    const { cookie, userId } = await newUser()
    const { item } = await bill(userId)
    expect((await confirm(cookie, item.id, { amountMinor: '0' })).statusCode).toBeGreaterThanOrEqual(400)
    expect((await confirm(cookie, item.id, { paidOn: '2999-01-01' })).statusCode).toBe(422)
    expect((await call(app, cookie, 'POST', `/recurring/${item.id}/confirm-payment`, { amountMinor: '25000', paidOn: '2026-09-05' })).statusCode).toBeGreaterThanOrEqual(400)
  })

  it('the kill switch returns 503 for confirm, link and mark-paid and never posts', async () => {
    const { userId, cookie } = await newUser()
    const { item } = await bill(userId)
    const body = { expectedDueDate: '2026-09-05', amountMinor: '25000', paidOn: '2026-09-05' }
    for (const [url, payload] of [[`/recurring/${item.id}/confirm-payment`, body], [`/recurring/${item.id}/mark-paid`, undefined], [`/recurring/${item.id}/link-payment`, { expectedDueDate: '2026-09-05', transactionId: randomUUID() }]] as const) {
      const r = await call(killApp, cookie, 'POST', url, payload)
      expect(r.statusCode).toBe(503); expect(r.json().error.code).toBe('RECURRING_CONFIRMATION_DISABLED')
    }
    expect(await txCount(userId)).toBe(0); expect(await nextDue(item.id)).toBe('2026-09-05')
  })

  it('legacy mark-paid is the same safe path: rejects a not-yet-due bill and double clicks post once', async () => {
    const { userId, cookie } = await newUser()
    const future = await bill(userId, { nextDueDate: d('2999-01-01') })
    const r = await call(app, cookie, 'POST', `/recurring/${future.item.id}/mark-paid`)
    expect(r.statusCode).toBe(422); expect(r.json().error.code).toBe('RECURRING_NOT_DUE')
    const due = await bill(userId)
    const rs = await Promise.all([1, 2].map(() => call(app, cookie, 'POST', `/recurring/${due.item.id}/mark-paid`)))
    expect(await txCount(userId)).toBe(1)
    expect(rs.some((x) => x.statusCode === 201)).toBe(true)
  })

  it('autopay=true is inert metadata: confirming still needs an explicit request', async () => {
    const { userId } = await newUser()
    const { item } = await bill(userId, { autopay: true })
    expect(await txCount(userId)).toBe(0)
    expect(await nextDue(item.id)).toBe('2026-09-05')
  })

  it('confirmation is reflected in the budget report spend', async () => {
    const { userId, cookie } = await newUser()
    const { item, categoryId } = await bill(userId)
    const p = await call(app, cookie, 'POST', '/budgets', { periodStart: '2026-09-01', periodEnd: '2026-09-30', incomePoolMinor: '0' })
    await call(app, cookie, 'POST', `/budgets/${p.json().id}/allocations`, { categoryId, allocatedMinor: '100000' })
    expect((await confirm(cookie, item.id)).statusCode).toBe(201)
    const rows = await prisma.transaction.aggregate({ where: { userId, categoryId, type: 'expense', status: 'cleared' }, _sum: { amountMinor: true } })
    expect(rows._sum.amountMinor).toBe(25000n)
  })

  it('month-end bills keep their anchor day through the API (Jan 31 -> Feb 28 -> Mar 31)', async () => {
    const { userId, cookie } = await newUser()
    const accountId = await cash(userId); const categoryId = await cat(userId)
    const created = await call(app, cookie, 'POST', '/recurring', { merchant: 'Gym', amountMinor: '1000', frequency: 'monthly', nextDueDate: '2026-01-31', accountId, categoryId })
    expect(created.statusCode).toBe(201)
    const id = created.json().id as string
    const seen: string[] = []
    for (const due of ['2026-01-31', '2026-02-28']) {
      const r = await confirm(cookie, id, { expectedDueDate: due, amountMinor: '1000', paidOn: '2026-03-01', allowPossibleDuplicate: true })
      expect(r.statusCode).toBe(201); seen.push(r.json().recurring.nextDueDate)
    }
    expect(seen).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('user isolation: another user cannot see candidates, skip or link', async () => {
    const owner = await newUser(); const other = await newUser()
    const { item } = await bill(owner.userId)
    expect((await call(app, other.cookie, 'GET', `/recurring/${item.id}/payment-candidates`)).statusCode).toBe(404)
    expect((await call(app, other.cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: '2026-09-05' })).statusCode).toBe(404)
    expect(await nextDue(item.id)).toBe('2026-09-05')
  })
})
