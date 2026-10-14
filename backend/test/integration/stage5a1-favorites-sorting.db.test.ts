// Stage 5A — favorite accounts (migration, API) and server-side Activity sorting.
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

describeIfDb('Stage 5A.1 favorites and global sorting (real PostgreSQL)', () => {
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
    const email = `stage5a1-${randomUUID()}@monikey.test`
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

  const put = (cookie: string, accountIds: string[]) => app.inject({ method: 'PUT', url: '/api/v1/accounts/favorites', headers: { cookie, origin: APP_ORIGIN }, payload: { accountIds } })
  const prefs = (userId: string) => prisma.userPreferences.findUnique({ where: { userId } })
  const ranks = async (userId: string) => (await prisma.financialAccount.findMany({ where: { userId, favoriteRank: { not: null } }, orderBy: { favoriteRank: 'asc' } })).map((a) => [a.id, a.favoriteRank])

  it('migration leaves existing accounts unranked and preferences unconfigured', async () => {
    const { userId, cookie } = await newUser()
    await account(userId, 1000)
    const boot = (await get(cookie, '/bootstrap')).json<{ financeState: { accounts: { favoriteRank: number | null }[] }; preferences: { favoritesConfigured: boolean } }>()
    expect(boot.financeState.accounts.every((a) => a.favoriteRank === null)).toBe(true)
    expect(boot.settings.favoritesConfigured).toBe(false)
  })

  it('saves, orders, reorders and clears favorites; empty is configured, not unconfigured', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 1000); const b = await account(userId, 1000, 'cash'); const c = await card(userId, 500)
    const res = await put(cookie, [c, a, b])
    expect(res.statusCode).toBe(200)
    expect(res.json<{ favorites: { id: string; favoriteRank: number }[] }>().favorites.map((f) => [f.id, f.favoriteRank])).toEqual([[c, 1], [a, 2], [b, 3]])
    expect((await prefs(userId))?.favoritesConfigured).toBe(true)
    expect(await ranks(userId)).toEqual([[c, 1], [a, 2], [b, 3]])
    expect((await put(cookie, [b, c])).statusCode).toBe(200)                     // reorder + shrink
    expect(await ranks(userId)).toEqual([[b, 1], [c, 2]])
    expect((await put(cookie, [])).statusCode).toBe(200)                          // intentional empty
    expect(await ranks(userId)).toEqual([])
    expect((await prefs(userId))?.favoritesConfigured).toBe(true)
    const boot = (await get(cookie, '/bootstrap')).json<{ settings: { favoritesConfigured: boolean } }>()
    expect(boot.settings.favoritesConfigured).toBe(true)
  })

  it('rejects duplicates, more than four, unknown, foreign and archived accounts without changing state', async () => {
    const { userId, cookie } = await newUser()
    const other = await newUser()
    const ids = [await account(userId, 1), await account(userId, 1), await account(userId, 1), await account(userId, 1), await account(userId, 1)]
    const foreign = await account(other.userId, 1)
    const archived = await account(userId, 1)
    await prisma.financialAccount.update({ where: { id: archived }, data: { archivedAt: new Date() } })
    expect((await put(cookie, [ids[0]!])).statusCode).toBe(200)
    expect((await put(cookie, [ids[0]!, ids[0]!])).statusCode).toBe(422)
    expect((await put(cookie, ids)).statusCode).toBe(400)
    expect((await put(cookie, [randomUUID()])).statusCode).toBe(404)
    expect((await put(cookie, [foreign])).statusCode).toBe(404)
    expect((await put(cookie, [archived])).statusCode).toBe(422)
    expect((await put(cookie, ['not-a-uuid'])).statusCode).toBe(400)
    expect(await ranks(userId)).toEqual([[ids[0], 1]])
    expect(await ranks(other.userId)).toEqual([])
    expect((await app.inject({ method: 'PUT', url: '/api/v1/accounts/favorites', headers: { origin: APP_ORIGIN }, payload: { accountIds: [] } })).statusCode).toBe(401)
  })

  it('archiving removes the account from favorites and the CHECK constraint rejects invalid ranks', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 1); const b = await account(userId, 1)
    await put(cookie, [a, b])
    expect((await app.inject({ method: 'POST', url: `/api/v1/accounts/${a}/archive`, headers: { cookie, origin: APP_ORIGIN } })).statusCode).toBe(204)
    expect(await ranks(userId)).toEqual([[b, 2]])
    await expect(prisma.financialAccount.update({ where: { id: b }, data: { favoriteRank: 5 } })).rejects.toThrow()
    await expect(prisma.financialAccount.update({ where: { id: b }, data: { favoriteRank: 0 } })).rejects.toThrow()
    const c = await account(userId, 1)
    await expect(prisma.financialAccount.update({ where: { id: c }, data: { favoriteRank: 2 } })).rejects.toThrow()   // duplicate rank for same user
  })

  it('concurrent replacements serialize and leave one consistent selection', async () => {
    const { userId, cookie } = await newUser()
    const ids = [await account(userId, 1), await account(userId, 1), await account(userId, 1), await account(userId, 1)]
    const sets = [[ids[0]!, ids[1]!], [ids[1]!, ids[0]!], [ids[2]!, ids[3]!, ids[0]!], [ids[3]!]]
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => put(cookie, sets[i % 4]!)))
    expect(results.every((r) => r.statusCode === 200)).toBe(true)
    const final = await ranks(userId)
    expect(sets.map((s) => JSON.stringify(s.map((id, i) => [id, i + 1])))).toContain(JSON.stringify(final))
  })

  it('sorts across the whole dataset by date and amount, both directions, with no duplicates across pages', async () => {
    const { userId, cookie } = await newUser()
    const a = await account(userId, 100_000_000)
    const amounts = [500, 100, 900, 100, 300, 700, 300, 100, 1000, 200, 800, 600, 400, 50, 950]   // ties on purpose
    for (const [i, amountMinor] of amounts.entries()) {
      await ledger.postTransaction(userId, input({ fromAccountId: a, title: `T${i}`, amountMinor, occurredOn: `2026-09-${String(1 + (i % 7)).padStart(2, '0')}` }))
    }
    async function walk(query: string) {
      const seen: { id: string; amountMinor: string; occurredOn: string }[] = []
      let cursor: string | null = null
      do {
        const page: { items: { id: string; amountMinor: string; occurredOn: string }[]; nextCursor: string | null } = (await get(cookie, `/transactions?limit=4&${query}${cursor ? `&cursor=${cursor}` : ''}`)).json()
        seen.push(...page.items); cursor = page.nextCursor
      } while (cursor)
      return seen
    }
    for (const [sort, dir] of [['amount', 'desc'], ['amount', 'asc'], ['date', 'asc'], ['date', 'desc']] as const) {
      const rows = await walk(`sort=${sort}&dir=${dir}`)
      expect(rows).toHaveLength(amounts.length)
      expect(new Set(rows.map((r) => r.id)).size).toBe(amounts.length)
      const keys = rows.map((r) => (sort === 'amount' ? BigInt(r.amountMinor) : BigInt(Date.parse(r.occurredOn))))
      const sorted = [...keys].sort((x, y) => (x === y ? 0 : x < y ? -1 : 1))
      expect(keys).toEqual(dir === 'asc' ? sorted : sorted.reverse())
    }
    // filters and sort compose across pages
    const filtered = await walk(`sort=amount&dir=desc&accountId=${a}&q=T1`)
    expect(filtered.length).toBeGreaterThan(0)
    expect((await get(cookie, '/transactions?sort=title')).statusCode).toBe(400)
  })
})
