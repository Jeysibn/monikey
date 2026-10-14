// Stage 4.1 — data integrity behind the V3 Overview/Insights.
// Requires a disposable PostgreSQL (TEST_DATABASE_URL / DATABASE_URL, name must match /test/).
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'
import { rebuildSnapshot } from '../../src/modules/reports/reports.repository.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'

describeIfDb('Stage 4.1 overview data (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
  const emails: string[] = []
  let app: FastifyInstance

  beforeAll(async () => {
    const [{ current_database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(current_database).toMatch(/test/i)
  })
  beforeEach(async () => {
    app = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }), prisma })
  })
  afterEach(async () => { await app.close() })
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  async function newUser() {
    const email = `stage41-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Stage41' } })
    expect(res.statusCode).toBe(201)
    const c = res.cookies.find((x) => x.name === 'monikey_session')!
    return { userId: res.json().user.id as string, cookie: `${c.name}=${c.value}` }
  }
  const created = new Date('2026-08-01T00:00:00Z')
  async function account(userId: string, balance: number, type: 'checking' | 'cash' = 'checking', createdAt = created) {
    return (await prisma.financialAccount.create({ data: { userId, name: type, accountType: type, classification: 'asset', currentBalanceMinor: balance, openingBalanceMinor: balance, createdAt } })).id
  }
  async function card(userId: string, owed = 0, limit = 10_000_000) {
    const id = randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.financialAccount.create({ data: { id, userId, name: 'Card', accountType: 'credit_card', classification: 'liability', currentBalanceMinor: owed, openingBalanceMinor: owed, createdAt: created } })
      await tx.creditCardDetail.create({ data: { accountId: id, network: 'visa', creditLimitMinor: limit, dueDay: 15 } })
    })
    return id
  }
  async function category(userId: string, name = 'Food') {
    return (await prisma.category.create({ data: { userId, name: `${name} ${randomUUID()}`, color: '#123', allowsExpense: true } })).id
  }
  let seq = 0
  function input(over: Record<string, unknown>) {
    return { type: 'expense' as const, title: 'T', categoryId: null, goalId: null, fromAccountId: null, toAccountId: null, occurredOn: '2026-09-10', occurredTime: null, amountMinor: 100, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: null, idempotencyKey: `s41-${randomUUID()}-${seq++}`, ...over } as Parameters<LedgerService['postTransaction']>[1]
  }
  const get = (cookie: string, url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })
  const series = async (cookie: string, from: string, to: string) => {
    const r = await get(cookie, `/reports/net-tracked-position?from=${from}&to=${to}`)
    expect(r.statusCode).toBe(200)
    return r.json() as { date: string; liquidTotal: string; cardDebt: string; netTrackedPosition: string }[]
  }
  const at = (rows: { date: string; netTrackedPosition: string }[], date: string) => rows.find((r) => r.date === date)?.netTrackedPosition

  it('net tracked position is correct for backdated transactions (posted out of date order)', async () => {
    const { userId, cookie } = await newUser()
    const acct = await account(userId, 100000)
    await ledger.postTransaction(userId, input({ fromAccountId: acct, amountMinor: 1000, occurredOn: '2026-09-20' }))
    await ledger.postTransaction(userId, input({ fromAccountId: acct, amountMinor: 500, occurredOn: '2026-09-10' }))
    await ledger.postTransaction(userId, input({ type: 'income', toAccountId: acct, amountMinor: 2000, occurredOn: '2026-09-15' }))
    const rows = await series(cookie, '2026-09-09', '2026-09-21')
    expect(at(rows, '2026-09-09')).toBe('100000')
    expect(at(rows, '2026-09-10')).toBe('99500')
    expect(at(rows, '2026-09-14')).toBe('99500')
    expect(at(rows, '2026-09-15')).toBe('101500')
    expect(at(rows, '2026-09-19')).toBe('101500')
    expect(at(rows, '2026-09-20')).toBe('100500')
    expect(rows).toHaveLength(13)
  })

  it('KNOWN DEFECT: stored-balance snapshot logic (rebuildSnapshot) is wrong for backdated entries', async () => {
    const { userId } = await newUser()
    const acct = await account(userId, 100000)
    await ledger.postTransaction(userId, input({ fromAccountId: acct, amountMinor: 1000, occurredOn: '2026-09-20' }))
    await ledger.postTransaction(userId, input({ fromAccountId: acct, amountMinor: 500, occurredOn: '2026-09-10' }))
    const snap = await rebuildSnapshot(prisma, userId, new Date('2026-09-12T00:00:00Z'))
    // Correct end-of-day 2026-09-12 is 99500; the snapshot picks the last-POSTED effect whose balanceAfter already includes the 09-20 expense.
    expect(snap.assetTotalMinor).toBe(98500n)
  })

  it('subtracts credit-card debt; a card repayment moves liquid and debt equally and leaves net unchanged', async () => {
    const { userId, cookie } = await newUser()
    const acct = await account(userId, 100000)
    const cc = await card(userId, 0)
    await ledger.postTransaction(userId, input({ fromAccountId: cc, amountMinor: 3000, occurredOn: '2026-09-12' }))
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: acct, toAccountId: cc, amountMinor: 1000, occurredOn: '2026-09-14' }))
    const rows = await series(cookie, '2026-09-11', '2026-09-15')
    expect(rows.find((r) => r.date === '2026-09-11')).toMatchObject({ liquidTotal: '100000', cardDebt: '0', netTrackedPosition: '100000' })
    expect(rows.find((r) => r.date === '2026-09-12')).toMatchObject({ liquidTotal: '100000', cardDebt: '3000', netTrackedPosition: '97000' })
    expect(rows.find((r) => r.date === '2026-09-14')).toMatchObject({ liquidTotal: '99000', cardDebt: '2000', netTrackedPosition: '97000' })
  })

  it('reversals are real balance movements on their own dates and the series ends at the current balance', async () => {
    const { userId, cookie } = await newUser()
    const acct = await account(userId, 50000)
    const posted = await ledger.postTransaction(userId, input({ fromAccountId: acct, amountMinor: 700, occurredOn: '2026-09-05' }))
    await ledger.reverseTransaction(userId, posted.transaction.id, { idempotencyKey: null } as never)
    const today = new Date().toISOString().slice(0, 10)
    const rows = await series(cookie, '2026-09-04', today)
    expect(at(rows, '2026-09-05')).toBe('49300')
    expect(rows.at(-1)!.netTrackedPosition).toBe('50000')
    const current = (await prisma.financialAccount.findUniqueOrThrow({ where: { id: acct } })).currentBalanceMinor
    expect(BigInt(rows.at(-1)!.liquidTotal)).toBe(current)
  })

  it('excludes archived accounts, never produces future days, and omits days before accounts existed', async () => {
    const { userId, cookie } = await newUser()
    const kept = await account(userId, 1000, 'checking', new Date('2026-09-10T00:00:00Z'))
    const archived = await account(userId, 999999, 'cash')
    await prisma.financialAccount.update({ where: { id: archived }, data: { archivedAt: new Date() } })
    const rows = await series(cookie, '2026-09-01', '2026-12-31')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.date <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))).toBe(true)
    expect(rows.at(-1)!.liquidTotal).toBe('1000')
    expect(kept).toBeTruthy()
    // account created 2026-09-10: nothing is fabricated for earlier days
    expect(rows.find((r) => r.date === '2026-09-09')).toBeUndefined()
    expect(rows[0]!.date).toBe('2026-09-10')
  })

  it('rejects unauthenticated access and oversized ranges', async () => {
    const { cookie } = await newUser()
    expect((await app.inject({ method: 'GET', url: '/api/v1/reports/net-tracked-position?from=2026-01-01&to=2026-02-01' })).statusCode).toBe(401)
    expect((await get(cookie, '/reports/net-tracked-position?from=2020-01-01&to=2026-02-01')).statusCode).toBe(400)
    expect((await get(cookie, '/reports/net-tracked-position?from=2026-02-02&to=2026-02-01')).statusCode).toBe(400)
  })

  it('spending reports stay exact across more than 1,000 transactions (beyond the bootstrap cap)', async () => {
    const { userId, cookie } = await newUser()
    const acct = await account(userId, 0)
    const cc = await card(userId, 0)
    const food = await category(userId, 'Food')
    const fuel = await category(userId, 'Fuel')
    const base = { userId, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const }
    const expenseRows = Array.from({ length: 1200 }, (_, i) => ({ ...base, type: 'expense' as const, title: `e${i}`, fromAccountId: cc, categoryId: i % 2 === 0 ? food : fuel, occurredOn: new Date(`2026-0${1 + (i % 9)}-15T00:00:00Z`), amountMinor: 1000n + BigInt(i) }))
    await prisma.transaction.createMany({ data: expenseRows })
    // noise that must NOT count: transfer, card repayment, pending expense, reversal pair, uncategorized (summary only)
    await prisma.transaction.createMany({ data: [
      { ...base, type: 'transfer', title: 'repay', fromAccountId: acct, toAccountId: cc, occurredOn: new Date('2026-03-15T00:00:00Z'), amountMinor: 999999n },
      { ...base, type: 'expense', title: 'pending', fromAccountId: cc, categoryId: food, status: 'pending', occurredOn: new Date('2026-03-15T00:00:00Z'), amountMinor: 888888n },
    ] })
    const orig = await prisma.transaction.create({ data: { ...base, type: 'expense', title: 'orig', fromAccountId: cc, categoryId: food, occurredOn: new Date('2026-03-16T00:00:00Z'), amountMinor: 777777n } })
    const comp = await prisma.transaction.create({ data: { ...base, type: 'expense', title: 'rev', fromAccountId: cc, categoryId: food, occurredOn: new Date('2026-03-16T00:00:00Z'), amountMinor: 777777n, reversedTransactionId: orig.id } })
    await prisma.transaction.update({ where: { id: orig.id }, data: { reversedTransactionId: comp.id } })
    await prisma.transaction.create({ data: { ...base, type: 'expense', title: 'nocat', fromAccountId: cc, occurredOn: new Date('2026-03-17T00:00:00Z'), amountMinor: 5n } })

    const expectedTotal = expenseRows.reduce((s, r) => s + r.amountMinor, 0n)
    const expectedFood = expenseRows.filter((r) => r.categoryId === food).reduce((s, r) => s + r.amountMinor, 0n)
    const cats = (await get(cookie, '/reports/spending-by-category?from=2026-01-01&to=2026-12-31')).json() as { categoryId: string; spent: string }[]
    expect(BigInt(cats.find((c) => c.categoryId === food)!.spent)).toBe(expectedFood)
    expect(cats.reduce((s, c) => s + BigInt(c.spent), 0n)).toBe(expectedTotal)
    const sum = (await get(cookie, '/reports/summary?view=yearly&period=2026-01')).json() as { expenses: string }
    // summary includes the uncategorized 5; categories do not -> the UI must surface the difference as "Uncategorized".
    expect(BigInt(sum.expenses)).toBe(expectedTotal + 5n)
  })
})
