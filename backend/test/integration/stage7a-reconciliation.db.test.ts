// Stage 7A financial reconciliation. An INDEPENDENT oracle recomputes balances, spending, income and net
// position from raw transaction rows (its own tiny reducer, no ledger code) and compares them with what the
// API reports. Deterministic (fixed scenario, no randomness). Real PostgreSQL.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { localDateIso } from '../../src/common/timezone.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'
const BIG = 9_000_000_000_000n // ₱90 billion in centavos: far beyond Number-safe arithmetic once summed

describeIfDb('Stage 7A financial reconciliation (real PostgreSQL)', () => {
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
    await prisma.budgetAllocation.deleteMany({ where: { budgetPeriod: { user: { email: { in: emails } } } } })
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  async function newUser() {
    const email = `r7a-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', remoteAddress: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'R7A' } })
    const c = res.cookies.find((x) => x.name === 'monikey_session')!
    return { userId: res.json().user.id as string, cookie: `${c.name}=${c.value}` }
  }
  const asset = async (userId: string, name: string, opening: bigint, accountType: 'checking' | 'savings' | 'cash' | 'ewallet' = 'checking') => (await prisma.financialAccount.create({ data: { userId, name, accountType, classification: 'asset', currentBalanceMinor: opening, openingBalanceMinor: opening } })).id
  async function card(userId: string, owed: bigint, limit: bigint) {
    const id = randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.financialAccount.create({ data: { id, userId, name: 'Card', accountType: 'credit_card', classification: 'liability', currentBalanceMinor: owed, openingBalanceMinor: owed } })
      await tx.creditCardDetail.create({ data: { accountId: id, network: 'visa', creditLimitMinor: limit, dueDay: 15 } })
    })
    return id
  }
  const category = async (userId: string, name: string) => (await prisma.category.create({ data: { userId, name: `${name} ${randomUUID().slice(0, 6)}`, color: '#123', allowsExpense: true } })).id
  let seq = 0
  const post = (userId: string, o: Record<string, unknown>) => ledger.postTransaction(userId, { type: 'expense', title: 'T', categoryId: null, goalId: null, fromAccountId: null, toAccountId: null, occurredOn: '2026-09-10', occurredTime: null, amountMinor: 100, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: `r7a-${randomUUID()}-${seq++}`, ...o } as Parameters<LedgerService['postTransaction']>[1])
  const get = (cookie: string, url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })
  const send = (cookie: string, method: 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({ method, url: `/api/v1${url}`, headers: { origin: APP_ORIGIN, cookie }, payload: payload as object })

  // ---- the oracle: derives everything from rows ------------------------------------------------------
  async function oracle(userId: string) {
    const accounts = await prisma.financialAccount.findMany({ where: { userId } })
    const rows = await prisma.transaction.findMany({ where: { userId } })
    const reversedIds = new Set(rows.filter((r) => r.reversedTransactionId).flatMap((r) => [r.id, r.reversedTransactionId!]))
    const live = rows.filter((r) => r.status === 'cleared' && !reversedIds.has(r.id)) // reversal pairs net to nothing
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const balance = new Map(accounts.map((a) => [a.id, a.openingBalanceMinor]))
    const add = (id: string | null, delta: bigint) => { if (id) balance.set(id, (balance.get(id) ?? 0n) + delta) }
    for (const t of live) {
      const from = t.fromAccountId ? byId.get(t.fromAccountId) : undefined
      const to = t.toAccountId ? byId.get(t.toAccountId) : undefined
      if (t.type === 'income') add(t.toAccountId, t.amountMinor)
      else if (t.type === 'expense') add(t.fromAccountId, from?.classification === 'liability' ? t.amountMinor : -t.amountMinor - t.feeMinor)
      else { add(t.fromAccountId, -t.amountMinor - t.feeMinor); if (to) add(t.toAccountId, to.classification === 'liability' ? -t.amountMinor : t.amountMinor) }
    }
    const inRange = (t: { occurredOn: Date }, from: string, to: string) => t.occurredOn.toISOString().slice(0, 10) >= from && t.occurredOn.toISOString().slice(0, 10) <= to
    const spend = (from: string, to: string, categoryId?: string) => live.filter((t) => t.type === 'expense' && inRange(t, from, to) && (!categoryId || t.categoryId === categoryId)).reduce((s, t) => s + t.amountMinor, 0n)
    const income = (from: string, to: string) => live.filter((t) => t.type === 'income' && inRange(t, from, to)).reduce((s, t) => s + t.amountMinor, 0n)
    const liquid = accounts.filter((a) => a.classification === 'asset' && !a.archivedAt).reduce((s, a) => s + (balance.get(a.id) ?? 0n), 0n)
    const cardDebt = accounts.filter((a) => a.classification === 'liability' && !a.archivedAt).reduce((s, a) => s + (balance.get(a.id) ?? 0n), 0n)
    return { balance, spend, income, liquid, cardDebt, live }
  }
  const expectBalancesMatch = async (userId: string) => {
    const o = await oracle(userId)
    for (const a of await prisma.financialAccount.findMany({ where: { userId } })) {
      expect(a.currentBalanceMinor, `stored balance of ${a.name}`).toBe(o.balance.get(a.id))
      const effects = (await prisma.transactionBalanceEffect.aggregate({ _sum: { deltaMinor: true }, where: { accountId: a.id } }))._sum.deltaMinor ?? 0n
      expect(a.openingBalanceMinor + effects, `balance effects of ${a.name}`).toBe(a.currentBalanceMinor)
    }
    return o
  }

  it('balances, spending, income, transfers, card repayment, reversals and net position all reconcile across month/year/leap boundaries and huge amounts', async () => {
    const { userId, cookie } = await newUser()
    const chk = await asset(userId, 'Checking', BIG)
    const sav = await asset(userId, 'Savings', 500_000n, 'savings')
    const cc = await card(userId, 0n, BIG)
    const food = await category(userId, 'Food')
    const fun = await category(userId, 'Fun')

    await post(userId, { type: 'income', title: 'Salary', toAccountId: chk, amountMinor: 3_000_000, occurredOn: '2024-02-29' }) // leap day
    await post(userId, { type: 'expense', title: 'Groceries', fromAccountId: chk, categoryId: food, amountMinor: 123_456, occurredOn: '2025-12-31' }) // year end
    await post(userId, { type: 'expense', title: 'Cinema', fromAccountId: chk, categoryId: fun, amountMinor: 45_000, occurredOn: '2026-01-01' }) // year start
    await post(userId, { type: 'expense', title: 'Card charge', fromAccountId: cc, categoryId: food, amountMinor: 80_000, occurredOn: '2026-09-30' }) // card purchase counts once, at purchase
    await post(userId, { type: 'transfer', title: 'To savings', fromAccountId: chk, toAccountId: sav, amountMinor: 700_000, occurredOn: '2026-09-30' }) // not spending, not income
    await post(userId, { type: 'transfer', title: 'Card repayment', fromAccountId: chk, toAccountId: cc, amountMinor: 50_000, occurredOn: '2026-10-01' }) // not an expense
    await post(userId, { type: 'income', title: 'Whale', toAccountId: chk, amountMinor: BIG / 3n, occurredOn: '2026-10-01' })
    const dup = await post(userId, { type: 'expense', title: 'Oops', fromAccountId: chk, categoryId: food, amountMinor: 999_999, occurredOn: '2026-09-15' })
    await ledger.reverseTransaction(userId, dup.transaction.id, { idempotencyKey: null } as never) // reversal must not inflate spending

    const o = await expectBalancesMatch(userId)
    // Card: charged 80,000, repaid 50,000.
    expect(o.balance.get(cc)).toBe(30_000n)
    // Transfers and repayments never appear as income or spending.
    expect(o.spend('2026-09-01', '2026-09-30')).toBe(80_000n)
    expect(o.income('2026-09-01', '2026-09-30')).toBe(0n)
    expect(o.spend('2026-10-01', '2026-10-31')).toBe(0n)

    const sep = (await get(cookie, '/reports/summary?view=monthly&period=2026-09')).json() as { expenses: string; income: string }
    expect(BigInt(sep.expenses)).toBe(o.spend('2026-09-01', '2026-09-30'))
    expect(BigInt(sep.income)).toBe(0n)
    const oct = (await get(cookie, '/reports/summary?view=monthly&period=2026-10')).json() as { expenses: string; income: string }
    expect(BigInt(oct.expenses)).toBe(0n)
    expect(BigInt(oct.income)).toBe(o.income('2026-10-01', '2026-10-31'))
    const dec25 = (await get(cookie, '/reports/summary?view=monthly&period=2025-12')).json() as { expenses: string }
    expect(BigInt(dec25.expenses)).toBe(123_456n)
    const jan26 = (await get(cookie, '/reports/summary?view=monthly&period=2026-01')).json() as { expenses: string }
    expect(BigInt(jan26.expenses)).toBe(45_000n)
    const feb24 = (await get(cookie, '/reports/summary?view=monthly&period=2024-02')).json() as { income: string }
    expect(BigInt(feb24.income)).toBe(3_000_000n)
    const year = (await get(cookie, '/reports/summary?view=yearly&period=2026-01')).json() as { expenses: string }
    expect(BigInt(year.expenses)).toBe(o.spend('2026-01-01', '2026-12-31'))

    // Net tracked position = liquid assets − card liabilities, from the same rows.
    const today = localDateIso((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).timezone) // the API reports in the user's calendar
    const ntp = (await get(cookie, `/reports/net-tracked-position?from=${today}&to=${today}`)).json() as { liquidTotal: string; cardDebt: string; netTrackedPosition: string }[]
    const last = ntp[ntp.length - 1]!
    expect(BigInt(last.liquidTotal)).toBe(o.liquid)
    expect(BigInt(last.cardDebt)).toBe(o.cardDebt)
    expect(BigInt(last.netTrackedPosition)).toBe(o.liquid - o.cardDebt)

    // Favorites are presentation only: totals are identical before and after.
    expect((await send(cookie, 'PUT', '/accounts/favorites', { accountIds: [sav, chk] })).statusCode).toBe(200)
    const after = (await get(cookie, `/reports/net-tracked-position?from=${today}&to=${today}`)).json() as typeof ntp
    expect(after).toEqual(ntp)
    expect((await get(cookie, '/reports/summary?view=monthly&period=2026-09')).json()).toEqual(sep)
    await expectBalancesMatch(userId)
  })

  it('budget spent equals the eligible cleared expenses of the category and month (reversed, transfer and card-repayment rows excluded)', async () => {
    const { userId, cookie } = await newUser()
    const chk = await asset(userId, 'Checking', 10_000_000n)
    const cc = await card(userId, 0n, 5_000_000n)
    const food = await category(userId, 'Food')
    await post(userId, { fromAccountId: chk, categoryId: food, amountMinor: 100_000, occurredOn: '2026-09-01' })
    await post(userId, { fromAccountId: chk, categoryId: food, amountMinor: 200_000, occurredOn: '2026-09-30' })
    await post(userId, { fromAccountId: cc, categoryId: food, amountMinor: 300_000, occurredOn: '2026-09-15' })
    await post(userId, { fromAccountId: chk, categoryId: food, amountMinor: 400_000, occurredOn: '2026-10-01' }) // next month
    await post(userId, { fromAccountId: chk, categoryId: food, amountMinor: 500_000, occurredOn: '2026-08-31' }) // previous month
    const rev = await post(userId, { fromAccountId: chk, categoryId: food, amountMinor: 600_000, occurredOn: '2026-09-10' })
    await ledger.reverseTransaction(userId, rev.transaction.id, { idempotencyKey: null } as never)
    await post(userId, { type: 'transfer', fromAccountId: chk, toAccountId: cc, amountMinor: 300_000, occurredOn: '2026-09-20' })
    const p = await send(cookie, 'POST', '/budgets', { periodStart: '2026-09-01', periodEnd: '2026-09-30', incomePoolMinor: '0' })
    expect(p.statusCode).toBe(201)
    expect((await send(cookie, 'POST', `/budgets/${p.json().id}/allocations`, { categoryId: food, allocatedMinor: '1000000' })).statusCode).toBe(201)
    const o = await oracle(userId)
    const rows = (await get(cookie, '/budgets')).json() as { allocations: { categoryId: string; spentMinor: string }[] }[]
    const spent = rows.flatMap((r) => r.allocations).find((a) => a.categoryId === food)!.spentMinor
    expect(BigInt(spent)).toBe(o.spend('2026-09-01', '2026-09-30', food))
    expect(BigInt(spent)).toBe(600_000n)
    const perf = (await get(cookie, '/reports/budget-performance?period=2026-09')).json() as { totalSpent: string }
    expect(BigInt(perf.totalSpent)).toBe(600_000n)
    await expectBalancesMatch(userId)
  })

  it('concurrent identical requests cannot double-post (ledger idempotency key and recurring cycle)', async () => {
    const { userId, cookie } = await newUser()
    const chk = await asset(userId, 'Checking', 1_000_000n)
    const food = await category(userId, 'Food')
    const key = `r7a-${randomUUID()}`
    const body = { type: 'expense', title: 'Once', categoryId: food, fromAccountId: chk, occurredOn: '2026-09-10', amountMinor: '1000', feeMinor: '0', currencyCode: 'PHP', source: 'manual', idempotencyKey: key }
    const rs = await Promise.all(Array.from({ length: 10 }, () => send(cookie, 'POST', '/transactions', body)))
    expect(rs.every((r) => r.statusCode === 200 || r.statusCode === 201)).toBe(true)
    expect(await prisma.transaction.count({ where: { userId, idempotencyKey: key } })).toBe(1)
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Rent', amountMinor: 5000n, frequency: 'monthly', nextDueDate: new Date('2026-09-05T00:00:00Z'), accountId: chk, categoryId: food, autopay: false, anchorDay: 5 } })
    const conf = { expectedDueDate: '2026-09-05', amountMinor: '5000', paidOn: '2026-09-05', allowPossibleDuplicate: true }
    const cs = await Promise.all(Array.from({ length: 10 }, () => send(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, conf)))
    expect(cs.every((r) => [200, 201].includes(r.statusCode))).toBe(true)
    expect(await prisma.transaction.count({ where: { userId, source: 'recurring' } })).toBe(1)
    expect(await prisma.recurringOccurrence.count({ where: { recurringItemId: item.id } })).toBe(1)
    const o = await expectBalancesMatch(userId)
    expect(o.balance.get(chk)).toBe(1_000_000n - 1000n - 5000n)
  })

  it('recurring: one expense per confirmed occurrence; skip and link never create another; budget and balance follow', async () => {
    const { userId, cookie } = await newUser()
    const chk = await asset(userId, 'Checking', 1_000_000n)
    const bills = await category(userId, 'Bills')
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Landlord', amountMinor: 20_000n, frequency: 'monthly', nextDueDate: new Date('2026-07-31T00:00:00Z'), accountId: chk, categoryId: bills, autopay: false, anchorDay: 31 } })
    const rc = (path: string, body: object) => send(cookie, 'POST', `/recurring/${item.id}/${path}`, body)
    // Cycle Jul 31: paid. Aug 31: skipped. Sep 30 (clamped from 31): already entered by hand, linked.
    expect((await rc('confirm-payment', { expectedDueDate: '2026-07-31', amountMinor: '20000', paidOn: '2026-07-31' })).statusCode).toBe(201)
    expect((await rc('skip-cycle', { expectedDueDate: '2026-08-31' })).statusCode).toBe(201)
    const manual = await post(userId, { fromAccountId: chk, categoryId: bills, title: 'Landlord by hand', amountMinor: 20_000, occurredOn: '2026-09-30' })
    expect((await rc('link-payment', { expectedDueDate: '2026-09-30', transactionId: manual.transaction.id })).statusCode).toBe(201)
    // Retries of every one of them change nothing.
    expect((await rc('confirm-payment', { expectedDueDate: '2026-07-31', amountMinor: '20000', paidOn: '2026-07-31' })).statusCode).toBe(200)
    expect((await rc('skip-cycle', { expectedDueDate: '2026-08-31' })).statusCode).toBe(200)
    expect((await rc('link-payment', { expectedDueDate: '2026-09-30', transactionId: manual.transaction.id })).statusCode).toBe(200)
    expect((await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })).nextDueDate.toISOString().slice(0, 10)).toBe('2026-10-31')
    expect(await prisma.transaction.count({ where: { userId, source: 'recurring' } })).toBe(1)
    expect(await prisma.transaction.count({ where: { userId, type: 'expense' } })).toBe(2) // the confirmed one + the manual one that was linked
    const occ = await prisma.recurringOccurrence.findMany({ where: { recurringItemId: item.id }, orderBy: { dueDate: 'asc' } })
    expect(occ.map((x) => [x.dueDate.toISOString().slice(0, 10), x.status])).toEqual([['2026-07-31', 'confirmed'], ['2026-08-31', 'skipped'], ['2026-09-30', 'confirmed']])
    const o = await expectBalancesMatch(userId)
    expect(o.balance.get(chk)).toBe(1_000_000n - 40_000n)
    const aug = (await get(cookie, '/reports/summary?view=monthly&period=2026-08')).json() as { expenses: string }
    expect(BigInt(aug.expenses)).toBe(0n) // the skipped cycle cost nothing
  })

  it.each([
    ['non-leap year', '2025-12-31', ['2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31']],
    ['leap year', '2023-12-31', ['2023-12-31', '2024-01-31', '2024-02-29', '2024-03-31']],
  ])('a month-end bill follows Jan 31 -> Feb end -> Mar 31 through real skip/confirm calls (%s)', async (_label, start, expected) => {
    const { userId, cookie } = await newUser()
    const chk = await asset(userId, 'Checking', 1_000_000n)
    const bills = await category(userId, 'Bills')
    const item = await prisma.recurringItem.create({ data: { userId, merchant: 'Gym', amountMinor: 1_000n, frequency: 'monthly', nextDueDate: new Date(`${start}T00:00:00Z`), accountId: chk, categoryId: bills, autopay: false, anchorDay: 31 } })
    const seen: string[] = []
    for (let i = 0; i < 4; i += 1) {
      // Read the due date from the API itself (never computed by the test), then settle that cycle.
      const due = (await prisma.recurringItem.findUniqueOrThrow({ where: { id: item.id } })).nextDueDate.toISOString().slice(0, 10)
      seen.push(due)
      const res = i % 2 === 0
        ? await send(cookie, 'POST', `/recurring/${item.id}/skip-cycle`, { expectedDueDate: due })
        : await send(cookie, 'POST', `/recurring/${item.id}/confirm-payment`, { expectedDueDate: due, amountMinor: '1000', paidOn: due })
      expect(res.statusCode, res.body).toBe(201)
    }
    expect(seen).toEqual(expected)
    expect(await prisma.transaction.count({ where: { userId, source: 'recurring' } })).toBe(2) // only the two confirmed cycles
  })
})
