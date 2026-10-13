// Stage 2 (MoniKey V3 remake) — characterization of EXISTING financial behaviour.
//
// These tests pin down what the system does today, against a real PostgreSQL
// test database, by asserting on balances, ledger effects, budget and report
// output — not just HTTP status codes. Tests whose name starts with
// "V3 CONFLICT" document behaviour that contradicts the approved V3 spec; they
// are intentionally green today and must be deliberately rewritten (not
// silently deleted) by the milestone that fixes the behaviour.
//
// Requires TEST_DATABASE_URL (or DATABASE_URL) pointing at a disposable DB.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'
import { processDueRecurringItems } from '../../src/modules/recurring/recurring.worker.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'

describeIfDb('Stage 2 ledger characterization (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
  const emails: string[] = []
  let app: FastifyInstance

  beforeAll(async () => {
    // Isolation guard: refuse to run mutation tests against anything that does
    // not look like a disposable test database.
    const [{ current_database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(current_database).toMatch(/test/i)
  })
  beforeEach(async () => {
    app = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }), prisma })
  })
  afterEach(async () => { await app.close() })
  afterAll(async () => {
    // Budget allocations RESTRICT category deletion, so clear them first.
    await prisma.budgetAllocation.deleteMany({ where: { budgetPeriod: { user: { email: { in: emails } } } } })
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  // ---- fixtures -----------------------------------------------------------
  async function newUser() {
    const email = `stage2-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Stage2' } })
    expect(res.statusCode).toBe(201)
    const c = res.cookies.find((x) => x.name === 'monikey_session')!
    return { userId: res.json().user.id as string, cookie: `${c.name}=${c.value}` }
  }
  async function cash(userId: string, balance: number, name = 'Cash') {
    return (await prisma.financialAccount.create({ data: { userId, name, accountType: 'checking', classification: 'asset', currentBalanceMinor: balance, openingBalanceMinor: balance } })).id
  }
  async function card(userId: string, owed = 0, limit = 100000) {
    const id = randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.financialAccount.create({ data: { id, userId, name: 'Card', accountType: 'credit_card', classification: 'liability', currentBalanceMinor: owed, openingBalanceMinor: owed } })
      await tx.creditCardDetail.create({ data: { accountId: id, network: 'visa', creditLimitMinor: limit, dueDay: 15 } })
    })
    return id
  }
  async function category(userId: string, name = 'Food') {
    return (await prisma.category.create({ data: { userId, name: `${name} ${randomUUID()}`, color: '#123', allowsExpense: true } })).id
  }
  async function bal(id: string) { return (await prisma.financialAccount.findUniqueOrThrow({ where: { id } })).currentBalanceMinor }
  let seq = 0
  function input(over: Record<string, unknown>) {
    return { type: 'expense' as const, title: 'T', categoryId: null, goalId: null, fromAccountId: null, toAccountId: null, occurredOn: '2026-09-10', occurredTime: null, amountMinor: 100, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: null, idempotencyKey: `s2-${randomUUID()}-${seq++}`, ...over } as Parameters<LedgerService['postTransaction']>[1]
  }
  const get = (cookie: string, url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })
  const send = (cookie: string, method: 'POST' | 'PATCH', url: string, payload?: unknown) => app.inject({ method, url: `/api/v1${url}`, headers: { origin: APP_ORIGIN, cookie }, payload: payload as object })
  async function budget(cookie: string, categoryId: string, allocated: string, start = '2026-09-01', end = '2026-09-30') {
    const p = await send(cookie, 'POST', '/budgets', { periodStart: start, periodEnd: end, incomePoolMinor: '0' })
    expect(p.statusCode).toBe(201)
    const a = await send(cookie, 'POST', `/budgets/${p.json().id}/allocations`, { categoryId, allocatedMinor: allocated })
    expect(a.statusCode).toBe(201)
    return p.json().id as string
  }
  const spent = async (cookie: string, categoryId: string) => {
    const rows = (await get(cookie, '/budgets')).json() as { allocations: { categoryId: string; spentMinor: string }[] }[]
    return rows.flatMap((r) => r.allocations).find((a) => a.categoryId === categoryId)?.spentMinor
  }
  const summary = async (cookie: string, period = '2026-09') => (await get(cookie, `/reports/summary?view=monthly&period=${period}`)).json() as Record<string, string>
  /** Ledger invariant: opening balance + sum(effects) === current balance. */
  async function expectConsistent(accountId: string) {
    const acct = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
    const sum = (await prisma.transactionBalanceEffect.aggregate({ _sum: { deltaMinor: true }, where: { accountId } }))._sum.deltaMinor ?? 0n
    expect(acct.openingBalanceMinor + sum).toBe(acct.currentBalanceMinor)
  }

  // ---- expense / income ---------------------------------------------------
  it('expense lowers an asset once and is counted once in budget and report', async () => {
    const { userId, cookie } = await newUser()
    const acct = await cash(userId, 10000)
    const cat = await category(userId)
    await budget(cookie, cat, '5000')
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: acct, amountMinor: 7500 }))
    expect(await bal(acct)).toBe(2500n)
    expect(await spent(cookie, cat)).toBe('7500')
    const s = await summary(cookie)
    expect(s.expenses).toBe('7500'); expect(s.income).toBe('0')
    await expectConsistent(acct)
  })

  it('income raises an asset and is not counted as spending', async () => {
    const { userId, cookie } = await newUser()
    const acct = await cash(userId, 1000)
    await ledger.postTransaction(userId, input({ type: 'income', toAccountId: acct, amountMinor: 3500000 }))
    expect(await bal(acct)).toBe(3501000n)
    const s = await summary(cookie)
    expect(s.income).toBe('3500000'); expect(s.expenses).toBe('0')
    await expectConsistent(acct)
  })

  // ---- transfers ----------------------------------------------------------
  it('transfer moves value between assets with zero income/expense/budget effect', async () => {
    const { userId, cookie } = await newUser()
    const a = await cash(userId, 10000, 'BPI'); const b = await cash(userId, 500, 'Maya')
    const cat = await category(userId); await budget(cookie, cat, '5000')
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: a, toAccountId: b, amountMinor: 3000 }))
    expect(await bal(a)).toBe(7000n); expect(await bal(b)).toBe(3500n)
    const s = await summary(cookie)
    expect(s.income).toBe('0'); expect(s.expenses).toBe('0')
    expect(await spent(cookie, cat)).toBe('0')
    await expectConsistent(a); await expectConsistent(b)
  })

  it('transfer fee is deducted from the source on top of the principal', async () => {
    const { userId } = await newUser()
    const a = await cash(userId, 10000); const b = await cash(userId, 0)
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: a, toAccountId: b, amountMinor: 3000, feeMinor: 25 }))
    expect(await bal(a)).toBe(6975n); expect(await bal(b)).toBe(3000n)
    await expectConsistent(a)
  })

  // ---- credit cards -------------------------------------------------------
  it('card purchase raises owed once, leaves cash alone, counts as expense once', async () => {
    const { userId, cookie } = await newUser()
    const c = await card(userId); const w = await cash(userId, 9000)
    const cat = await category(userId); await budget(cookie, cat, '100000')
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: c, amountMinor: 20000 }))
    expect(await bal(c)).toBe(20000n); expect(await bal(w)).toBe(9000n)
    expect(await spent(cookie, cat)).toBe('20000')
    expect((await summary(cookie)).expenses).toBe('20000')
    await expectConsistent(c)
  })

  it('card repayment lowers cash and owed, and is NOT an expense', async () => {
    const { userId, cookie } = await newUser()
    const c = await card(userId, 20000); const w = await cash(userId, 50000)
    const cat = await category(userId); await budget(cookie, cat, '100000')
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: w, toAccountId: c, amountMinor: 12000 }))
    expect(await bal(c)).toBe(8000n); expect(await bal(w)).toBe(38000n)
    const s = await summary(cookie)
    expect(s.expenses).toBe('0'); expect(s.income).toBe('0')
    expect(await spent(cookie, cat)).toBe('0')
    await expectConsistent(c); await expectConsistent(w)
  })

  it('rejects overpaying a card, overdraft, credit-limit breach and paying a zero balance', async () => {
    const { userId } = await newUser()
    const c = await card(userId, 5000, 8000); const w = await cash(userId, 1000); const rich = await cash(userId, 99999)
    await expect(ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: rich, toAccountId: c, amountMinor: 5001 }))).rejects.toMatchObject({ code: 'CARD_PAYMENT_EXCEEDS_OWED' })
    await expect(ledger.postTransaction(userId, input({ fromAccountId: w, amountMinor: 1001 }))).rejects.toMatchObject({ code: 'ASSET_OVERDRAFT' })
    await expect(ledger.postTransaction(userId, input({ fromAccountId: c, amountMinor: 3001 }))).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' })
    const zero = await card(userId, 0)
    await expect(ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: rich, toAccountId: zero, amountMinor: 1 }))).rejects.toMatchObject({ code: 'CARD_PAYMENT_EXCEEDS_OWED' })
    expect(await bal(c)).toBe(5000n); expect(await bal(w)).toBe(1000n); expect(await bal(rich)).toBe(99999n)
  })

  // ---- idempotency --------------------------------------------------------
  it('a retried idempotency key posts one transaction and one balance effect', async () => {
    const { userId } = await newUser()
    const a = await cash(userId, 1000)
    const i = input({ fromAccountId: a, amountMinor: 300, idempotencyKey: `idem-${randomUUID()}` })
    const first = await ledger.postTransaction(userId, i); const retry = await ledger.postTransaction(userId, i)
    expect(retry.transaction.id).toBe(first.transaction.id)
    expect(await bal(a)).toBe(700n)
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1)
  })

  it('concurrent posts with one key do not double-charge', async () => {
    const { userId } = await newUser()
    const a = await cash(userId, 1000)
    const i = input({ fromAccountId: a, amountMinor: 300, idempotencyKey: `idem-${randomUUID()}` })
    const r = await Promise.allSettled([ledger.postTransaction(userId, i), ledger.postTransaction(userId, i), ledger.postTransaction(userId, i)])
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1)
    expect(await bal(a)).toBe(700n)
    expect(r.some((x) => x.status === 'fulfilled')).toBe(true)
  })

  it('the same key under a different user is a separate transaction', async () => {
    const u1 = await newUser(); const u2 = await newUser()
    const a1 = await cash(u1.userId, 1000); const a2 = await cash(u2.userId, 1000)
    const key = `shared-${randomUUID()}`
    await ledger.postTransaction(u1.userId, input({ fromAccountId: a1, amountMinor: 100, idempotencyKey: key }))
    await ledger.postTransaction(u2.userId, input({ fromAccountId: a2, amountMinor: 100, idempotencyKey: key }))
    expect(await bal(a1)).toBe(900n); expect(await bal(a2)).toBe(900n)
  })

  // ---- reversal -----------------------------------------------------------
  it('reversal restores balances, is single-use, and keeps the ledger consistent', async () => {
    const { userId } = await newUser()
    const a = await cash(userId, 10000)
    const posted = await ledger.postTransaction(userId, input({ fromAccountId: a, amountMinor: 4000 }))
    const rev = await ledger.reverseTransaction(userId, posted.transaction.id, { idempotencyKey: null } as never)
    expect(await bal(a)).toBe(10000n)
    expect(rev.compensatingTransaction.type).toBe('expense')
    await expect(ledger.reverseTransaction(userId, posted.transaction.id, { idempotencyKey: null } as never)).rejects.toMatchObject({ code: 'ALREADY_REVERSED' })
    await expectConsistent(a)
  })

  it('V3 CONFLICT: a reversed expense still counts in its budget/report, and the reversal counts as a second expense in the month it was made', async () => {
    const { userId, cookie } = await newUser()
    const a = await cash(userId, 10000); const cat = await category(userId)
    const today = new Date().toISOString().slice(0, 7)
    await budget(cookie, cat, '9000', `${today}-01`, `${today}-28`)
    const posted = await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 4000, occurredOn: `${today}-01` }))
    await ledger.reverseTransaction(userId, posted.transaction.id, { idempotencyKey: null } as never)
    // Cash is whole again, but spending is overstated: original + compensating
    // transaction are both type=expense/status=cleared with positive amounts.
    expect(await bal(a)).toBe(10000n)
    expect(await spent(cookie, cat)).toBe('8000')
    expect((await summary(cookie, today)).expenses).toBe('8000')
  })

  it('reversal of a card repayment restores cash and owed', async () => {
    const { userId } = await newUser()
    const c = await card(userId, 9000); const w = await cash(userId, 9000)
    const pay = await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: w, toAccountId: c, amountMinor: 4000 }))
    await ledger.reverseTransaction(userId, pay.transaction.id, { idempotencyKey: null } as never)
    expect(await bal(c)).toBe(9000n); expect(await bal(w)).toBe(9000n)
    await expectConsistent(c); await expectConsistent(w)
  })

  // ---- budgets: exclusions ------------------------------------------------
  it('budget actuals exclude pending, other-category, other-month and transfer activity', async () => {
    const { userId, cookie } = await newUser()
    const a = await cash(userId, 100000); const b = await cash(userId, 0)
    const cat = await category(userId); const other = await category(userId, 'Other')
    await budget(cookie, cat, '50000')
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 1000 }))
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 2000, status: 'pending' }))
    await ledger.postTransaction(userId, input({ categoryId: other, fromAccountId: a, amountMinor: 3000 }))
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 4000, occurredOn: '2026-08-30' }))
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: a, toAccountId: b, amountMinor: 5000 }))
    expect(await spent(cookie, cat)).toBe('1000')
  })

  it('budget-performance report applies the same exclusions (period row created at the Manila month boundary)', async () => {
    const { userId, cookie } = await newUser()
    const a = await cash(userId, 100000); const b = await cash(userId, 0)
    const cat = await category(userId); const other = await category(userId, 'Other')
    const bp = await prisma.budgetPeriod.create({ data: { userId, periodStart: new Date('2026-08-31T16:00:00Z'), periodEnd: new Date('2026-09-30T15:59:59.999Z'), incomePoolMinor: 0 } })
    await prisma.budgetAllocation.create({ data: { budgetPeriodId: bp.id, categoryId: cat, allocatedMinor: 50000 } })
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 1000 }))
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 2000, status: 'pending' }))
    await ledger.postTransaction(userId, input({ categoryId: other, fromAccountId: a, amountMinor: 3000 }))
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: a, toAccountId: b, amountMinor: 5000 }))
    const perf = await get(cookie, '/reports/budget-performance?period=2026-09')
    expect(perf.statusCode).toBe(200)
    expect(perf.json().totalSpent).toBe('1000')
    expect(perf.json().totalRemaining).toBe('49000')
  })

  it('V3 CONFLICT: /reports/budget-performance 404s for a budget created through the API for the same month', async () => {
    const { cookie } = await newUser()
    await budget(cookie, await category((await prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })).id), '1000')
    expect((await get(cookie, '/reports/budget-performance?period=2026-09')).statusCode).toBe(404)
  })

  it('V3 CONFLICT: a budget created for 2026-09-01..2026-09-30 is stored shifted one day early (Aug 31..Sep 29)', async () => {
    // POST /budgets converts the date-only inputs with the user's timezone
    // (Asia/Manila, UTC+8) and stores the result in a date-compared column, so
    // the period drifts a day. Month-boundary expenses land in the wrong month.
    const { userId, cookie } = await newUser()
    const a = await cash(userId, 100000); const cat = await category(userId)
    const id = await budget(cookie, cat, '50000')
    const period = await prisma.budgetPeriod.findUniqueOrThrow({ where: { id } })
    expect(period.periodStart.toISOString().slice(0, 10)).toBe('2026-08-31')
    expect(period.periodEnd.toISOString().slice(0, 10)).toBe('2026-09-29')
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 111, occurredOn: '2026-08-31' }))
    await ledger.postTransaction(userId, input({ categoryId: cat, fromAccountId: a, amountMinor: 222, occurredOn: '2026-09-30' }))
    expect(await spent(cookie, cat)).toBe('111') // Aug 31 counted, Sep 30 missed
  })

  it('budget-performance returns 404 when no budget covers the period', async () => {
    const { cookie } = await newUser()
    expect((await get(cookie, '/reports/budget-performance?period=2026-09')).statusCode).toBe(404)
  })

  // ---- invalid input ------------------------------------------------------
  it('rejects invalid transactions over HTTP without touching balances', async () => {
    const { userId, cookie } = await newUser()
    const a = await cash(userId, 1000); const b = await cash(userId, 1000)
    const other = await newUser(); const theirs = await cash(other.userId, 1000)
    const base = { type: 'expense', title: 'x', fromAccountId: a, occurredOn: '2026-09-10', currencyCode: 'PHP' }
    // [label, payload, expected HTTP status, expected error code]
    const cases: Array<[string, Record<string, unknown>, number, string]> = [
      ['zero amount', { ...base, amountMinor: '0' }, 400, 'VALIDATION_ERROR'],
      ['negative amount', { ...base, amountMinor: '-5' }, 400, 'VALIDATION_ERROR'],
      ['decimal amount', { ...base, amountMinor: '1.5' }, 400, 'VALIDATION_ERROR'],
      ['float number amount', { ...base, amountMinor: 1.5 }, 400, 'VALIDATION_ERROR'],
      ['expense without account', { ...base, fromAccountId: undefined, amountMinor: '5' }, 422, 'INVALID_TRANSACTION_KIND'],
      ['same-account transfer', { ...base, type: 'transfer', toAccountId: a, amountMinor: '5' }, 422, 'TRANSFER_SAME_ACCOUNT'],
      ["another user's account", { ...base, fromAccountId: theirs, amountMinor: '5' }, 404, 'UNKNOWN_ACCOUNT'],
      ['unknown category', { ...base, categoryId: randomUUID(), amountMinor: '5' }, 404, 'UNKNOWN_CATEGORY'],
      ['overdraft', { ...base, amountMinor: '1001' }, 422, 'ASSET_OVERDRAFT'],
    ]
    for (const [label, payload, status, code] of cases) {
      const res = await send(cookie, 'POST', '/transactions', { ...payload, idempotencyKey: `inv-${randomUUID()}` })
      expect(`${label}=${res.statusCode}:${res.json().error?.code}`).toBe(`${label}=${status}:${code}`)
    }
    expect(await bal(a)).toBe(1000n); expect(await bal(b)).toBe(1000n); expect(await bal(theirs)).toBe(1000n)
    expect(await prisma.transaction.count({ where: { userId } })).toBe(0)
  })

  it('amounts above Number.MAX_SAFE_INTEGER stay exact end-to-end', async () => {
    const { userId, cookie } = await newUser()
    const huge = 9007199254740993n // 2^53 + 1, not representable as a JS number
    const a = (await prisma.financialAccount.create({ data: { userId, name: 'Big', accountType: 'checking', classification: 'asset', currentBalanceMinor: huge, openingBalanceMinor: huge } })).id
    const res = await send(cookie, 'POST', '/transactions', { type: 'expense', title: 'big', fromAccountId: a, occurredOn: '2026-09-10', currencyCode: 'PHP', amountMinor: '1', idempotencyKey: `big-${randomUUID()}` })
    expect(res.statusCode).toBe(201)
    expect(await bal(a)).toBe(9007199254740992n)
  })

  // ---- recurring ----------------------------------------------------------
  async function recurring(userId: string, over: Record<string, unknown> = {}) {
    const accountId = (over.accountId as string) ?? (await cash(userId, 100000))
    const categoryId = await category(userId, 'Bills')
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Rent', amountMinor: 25000, frequency: 'monthly', nextDueDate: new Date('2026-09-05T00:00:00Z'), accountId, categoryId, autopay: false, ...over } as never })
    return { item, accountId }
  }
  const dueTxCount = (userId: string) => prisma.transaction.count({ where: { userId, source: 'recurring' } })

  it('V3 CONFLICT: the worker posts a due NON-autopay item without any confirmation', async () => {
    const { userId } = await newUser()
    const { item, accountId } = await recurring(userId, { autopay: false })
    const r = await processDueRecurringItems(prisma, ledger, '2026-09-05', undefined, userId)
    expect(r).toEqual({ processed: 1, failed: 0 })
    expect(await bal(accountId)).toBe(75000n)
    const after = await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.nextDueDate.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect(after.lastPaidDate?.toISOString().slice(0, 10)).toBe('2026-09-05')
  })

  it('the worker does not post items that are not yet due, paused, or on an archived account', async () => {
    const { userId } = await newUser()
    await recurring(userId, { nextDueDate: new Date('2026-09-06T00:00:00Z') })
    await recurring(userId, { status: 'paused' })
    const arch = await cash(userId, 100000); await prisma.financialAccount.update({ where: { id: arch }, data: { archivedAt: new Date() } })
    await recurring(userId, { accountId: arch })
    expect(await processDueRecurringItems(prisma, ledger, '2026-09-05', undefined, userId)).toEqual({ processed: 0, failed: 0 })
    expect(await dueTxCount(userId)).toBe(0)
  })

  it('the worker is idempotent: a second run the same day posts nothing more', async () => {
    const { userId } = await newUser()
    const { accountId } = await recurring(userId)
    await processDueRecurringItems(prisma, ledger, '2026-09-05', undefined, userId)
    await processDueRecurringItems(prisma, ledger, '2026-09-05', undefined, userId)
    expect(await dueTxCount(userId)).toBe(1); expect(await bal(accountId)).toBe(75000n)
  })

  it('V3 CONFLICT: the worker catches up every missed cycle one per run, with no confirmation', async () => {
    const { userId } = await newUser()
    const { accountId } = await recurring(userId, { nextDueDate: new Date('2026-07-05T00:00:00Z') })
    for (const day of ['2026-09-05', '2026-09-05', '2026-09-05', '2026-09-05']) await processDueRecurringItems(prisma, ledger, day, undefined, userId)
    expect(await dueTxCount(userId)).toBe(3) // Jul, Aug, Sep 5 — then next due is Oct, not due yet
    expect(await bal(accountId)).toBe(25000n)
  })

  it('a failing item (overdraft) is auto-paused without stopping other items', async () => {
    const { userId } = await newUser()
    const poor = await cash(userId, 100)
    const bad = await recurring(userId, { accountId: poor })
    const good = await recurring(userId)
    expect(await processDueRecurringItems(prisma, ledger, '2026-09-05', undefined, userId)).toEqual({ processed: 1, failed: 1 })
    expect((await prisma.recurringItem.findUniqueOrThrow({ where: { id: bad.item.id } })).status).toBe('paused')
    expect((await prisma.recurringItem.findUniqueOrThrow({ where: { id: good.item.id } })).status).toBe('active')
  })

  it('mark-paid posts the expense on the due date, once, and advances the schedule', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await recurring(userId)
    const res = await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)
    expect(res.statusCode).toBe(201)
    expect(res.json().nextDueDate).toBe('2026-10-05'); expect(res.json().lastPaidDate).toBe('2026-09-05')
    expect(await bal(accountId)).toBe(75000n)
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId, source: 'recurring' } })
    expect(tx.occurredOn.toISOString().slice(0, 10)).toBe('2026-09-05')
    expect(tx.amountMinor).toBe(25000n)
  })

  it('V3 CONFLICT: mark-paid accepts no body — amount, account and paid date cannot be confirmed or corrected', async () => {
    const { userId, cookie } = await newUser()
    const other = await cash(userId, 100000, 'Other')
    const { item, accountId } = await recurring(userId)
    const res = await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`, { amountMinor: '99999', accountId: other, paidOn: '2026-09-20' })
    // Characterize whatever happens: the schedule's amount/account/date win.
    expect(res.statusCode).toBe(201)
    const tx = await prisma.transaction.findFirstOrThrow({ where: { userId, source: 'recurring' } })
    expect(tx.amountMinor).toBe(25000n)
    expect(tx.fromAccountId).toBe(accountId)
    expect(tx.occurredOn.toISOString().slice(0, 10)).toBe('2026-09-05')
    expect(await bal(other)).toBe(100000n)
  })

  it('V3 CONFLICT: two sequential mark-paid calls pay two cycles, and a due-date check is absent (future bills can be pre-paid)', async () => {
    const { userId, cookie } = await newUser()
    const { item } = await recurring(userId, { nextDueDate: new Date('2027-01-05T00:00:00Z') }) // far in the future
    expect((await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)).statusCode).toBe(201)
    expect((await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)).statusCode).toBe(201)
    expect(await dueTxCount(userId)).toBe(2)
  })

  it('concurrent mark-paid calls for the same cycle post one transaction (extra callers get 500, not a replay)', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await recurring(userId)
    const rs = await Promise.all([1, 2, 3].map(() => send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)))
    expect(await dueTxCount(userId)).toBe(1)
    expect(await bal(accountId)).toBe(75000n)
    // Characterized robustness gap: the loser(s) of the idempotency-key race
    // surface as 500 INTERNAL_ERROR instead of replaying the winner's result.
    // No double posting occurs (asserted above).
    expect(rs.filter((r) => r.statusCode === 201)).toHaveLength(1)
    expect(rs.filter((r) => r.statusCode === 500)).toHaveLength(2)
    // Documented race: all callers read the same item, so the schedule advances once.
    expect((await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })).nextDueDate.toISOString().slice(0, 10)).toBe('2026-10-05')
  })

  it('V3 CONFLICT: after the worker auto-posts a cycle, a user clicking mark-paid pays the NEXT cycle early', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await recurring(userId)
    await processDueRecurringItems(prisma, ledger, '2026-09-05', undefined, userId)
    const res = await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)
    expect(res.statusCode).toBe(201)
    expect(await dueTxCount(userId)).toBe(2) // Sep (worker) + Oct (manual, before Oct is due)
    expect(await bal(accountId)).toBe(50000n)
  })

  it('V3 CONFLICT: a manually entered payment is not recognised, so confirming the bill double-posts it', async () => {
    const { userId, cookie } = await newUser()
    const { item, accountId } = await recurring(userId)
    await ledger.postTransaction(userId, input({ fromAccountId: accountId, amountMinor: 25000, title: 'Rent', occurredOn: '2026-09-05' }))
    await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)
    expect(await bal(accountId)).toBe(50000n)
  })

  it('mark-paid is rejected (404) for paused items and other users', async () => {
    const owner = await newUser(); const intruder = await newUser()
    const paused = await recurring(owner.userId, { status: 'paused' })
    const live = await recurring(owner.userId)
    expect((await send(owner.cookie, 'POST', `/recurring/${paused.item.id}/mark-paid`)).statusCode).toBe(404)
    expect((await send(intruder.cookie, 'POST', `/recurring/${live.item.id}/mark-paid`)).statusCode).toBe(404)
    expect(await dueTxCount(owner.userId)).toBe(0)
  })

  it('mark-paid posts the ledger transaction and advances the schedule in separate steps (non-atomic)', async () => {
    // Characterization via failure: an overdraft rejects the post, and the
    // schedule must then remain unchanged (post happens first).
    const { userId, cookie } = await newUser()
    const poor = await cash(userId, 100)
    const { item } = await recurring(userId, { accountId: poor })
    const res = await send(cookie, 'POST', `/recurring/${item.id}/mark-paid`)
    expect(res.statusCode).toBe(422)
    const after = await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(after.nextDueDate.toISOString().slice(0, 10)).toBe('2026-09-05')
    expect(await dueTxCount(userId)).toBe(0)
  })
})
