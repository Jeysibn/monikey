// Stage 5A — data behind the V3 Activity and Accounts pages.
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

describeIfDb('Stage 5A activity data (real PostgreSQL)', () => {
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
    const email = `stage5a-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Stage5A' } })
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
  type Page = { items: { id: string; title: string; type: string; reversedTransactionId: string | null }[]; nextCursor: string | null; hasMore: boolean }

  it('searches title and note case-insensitively and combines with account/type filters', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 100000)
    const b = await account(userId, 100000, 'cash')
    await ledger.postTransaction(userId, input({ fromAccountId: a, title: 'Jollibee Lunch' }))
    await ledger.postTransaction(userId, input({ fromAccountId: a, title: 'Other', note: 'team JOLLIBEE run', occurredOn: '2026-09-11' }))
    await ledger.postTransaction(userId, input({ fromAccountId: b, title: 'Jollibee Cash', occurredOn: '2026-09-12' }))
    await ledger.postTransaction(userId, input({ type: 'income', toAccountId: a, title: 'Salary', occurredOn: '2026-09-13' }))
    expect((await get(cookie, '/transactions?q=jollibee')).json<Page>().items).toHaveLength(3)
    expect((await get(cookie, `/transactions?q=jollibee&accountId=${a}`)).json<Page>().items).toHaveLength(2)
    expect((await get(cookie, '/transactions?q=jollibee&type=income')).json<Page>().items).toHaveLength(0)
    expect((await get(cookie, '/transactions?q=%25')).json<Page>().items).toHaveLength(0)
  })

  it('pages 120 transactions with a stable cursor, no duplicates or gaps, and isolates users', async () => {
    const { userId, cookie } = await newUser()
    const other = await newUser()
    const a = await account(userId, 10_000_000)
    for (let i = 0; i < 120; i++) await ledger.postTransaction(userId, input({ fromAccountId: a, title: `Tx ${i}`, occurredOn: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}` }))
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page = (await get(cookie, `/transactions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json<Page>()
      seen.push(...page.items.map((t) => t.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(120)
    expect(new Set(seen).size).toBe(120)
    expect((await get(other.cookie, '/transactions')).json<Page>().items).toHaveLength(0)
  })

  it('returns both halves of a reversal pair, each flagged with reversedTransactionId', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 100000)
    const t = await ledger.postTransaction(userId, input({ fromAccountId: a, title: 'Oops' }))
    await ledger.reverseTransaction(userId, t.transaction.id, {})
    const items = (await get(cookie, '/transactions')).json<Page>().items
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.reversedTransactionId)).toBe(true)
  })

  it('card purchase and repayment keep their own types; account filter matches either side of a transfer', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 100000)
    const c = await card(userId, 0)
    await ledger.postTransaction(userId, input({ fromAccountId: c, title: 'Card buy', amountMinor: 3000 }))
    await ledger.postTransaction(userId, input({ type: 'transfer', fromAccountId: a, toAccountId: c, title: 'Repay', amountMinor: 3000, occurredOn: '2026-09-12' }))
    const onCard = (await get(cookie, `/transactions?accountId=${c}`)).json<Page>().items
    expect(onCard.map((i) => i.type).sort()).toEqual(['expense', 'transfer'])
    expect((await get(cookie, `/transactions?accountId=${a}`)).json<Page>().items.map((i) => i.type)).toEqual(['transfer'])
  })

  it('archived accounts are excluded from the whole net-tracked history, including dates before archiving (documented)', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 100000)
    const gone = await account(userId, 50000, 'cash')
    await prisma.financialAccount.update({ where: { id: gone }, data: { archivedAt: new Date('2026-09-15T00:00:00Z') } })
    const rows = (await get(cookie, '/reports/net-tracked-position?from=2026-09-01&to=2026-09-10')).json<{ date: string; netTrackedPosition: string }[]>()
    expect(rows.find((r) => r.date === '2026-09-05')?.netTrackedPosition).toBe('100000')
    expect(a).toBeTruthy()
  })

  it('net-tracked-position stays fast with 1,500 transactions and remains exact', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 0)
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: randomUUID(), userId, type: 'income' as const, title: `bulk ${i}`, toAccountId: a, occurredOn: new Date(`2026-09-${String(1 + (i % 28)).padStart(2, '0')}`), amountMinor: 100n, feeMinor: 0n, source: 'manual' as const, status: 'cleared' as const, currencyCode: 'PHP' }))
    await prisma.transaction.createMany({ data: rows })
    await prisma.transactionBalanceEffect.createMany({ data: rows.map((r) => ({ transactionId: r.id, accountId: a, role: 'income' as const, deltaMinor: 100n, balanceAfterMinor: 0n })) })
    const started = Date.now()
    const out = (await get(cookie, '/reports/net-tracked-position?from=2026-09-01&to=2026-09-28')).json<{ date: string; netTrackedPosition: string }[]>()
    expect(Date.now() - started).toBeLessThan(3000)
    expect(out.at(-1)?.netTrackedPosition).toBe('150000')
  })
})
