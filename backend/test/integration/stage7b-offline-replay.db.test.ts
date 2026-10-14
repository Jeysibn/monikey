// Stage 7B: safe replay of queued offline operations (browser IndexedDB outbox) against a restored/recovered database.
// The outbox replays only `create_transaction` through POST /transactions with the operation's idempotency key.
// Real PostgreSQL + real HTTP (Fastify inject).
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'

describeIfDb('Stage 7B offline outbox replay safety (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const emails: string[] = []
  let app: FastifyInstance

  beforeAll(async () => {
    const [{ current_database }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`
    expect(current_database).toMatch(/test/i)
    app = await buildApp({ env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' }), prisma })
  })
  afterAll(async () => {
    await app.close()
    await prisma.user.deleteMany({ where: { email: { in: emails } } })
    await prisma.$disconnect()
  })

  async function newUser() {
    const email = `s7b-replay-${randomUUID()}@monikey.test`
    emails.push(email)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', remoteAddress: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Replay' } })
    const c = res.cookies.find((x) => x.name === 'monikey_session')!
    const userId = res.json().user.id as string
    const accountId = (await prisma.financialAccount.create({ data: { userId, name: 'Cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: 1_000_000n, openingBalanceMinor: 1_000_000n } })).id
    return { userId, accountId, cookie: `${c.name}=${c.value}` }
  }
  const post = (cookie: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/v1/transactions', headers: { origin: APP_ORIGIN, cookie }, payload })
  const op = (accountId: string, key: string, over: Record<string, unknown> = {}) => ({ type: 'expense', title: 'Queued offline', amountMinor: '25000', fromAccountId: accountId, occurredOn: '2026-10-15', source: 'manual', status: 'cleared', idempotencyKey: key, ...over })
  const bal = async (id: string) => (await prisma.financialAccount.findUniqueOrThrow({ where: { id } })).currentBalanceMinor
  const count = (userId: string, key: string) => prisma.transaction.count({ where: { userId, idempotencyKey: key } })

  it('replaying an operation already committed before the backup returns the original and posts nothing new', async () => {
    const u = await newUser(); const key = `offline-${randomUUID()}`
    const first = await post(u.cookie, op(u.accountId, key))
    expect(first.statusCode).toBe(201)
    const afterFirst = await bal(u.accountId)
    // the tab was offline when the response arrived, so the outbox still says "pending" and replays after the restore
    const replay = await post(u.cookie, op(u.accountId, key))
    expect(replay.statusCode).toBeLessThan(300)
    expect(replay.json().transaction.id).toBe(first.json().transaction.id)
    expect(await count(u.userId, key)).toBe(1)
    expect(await bal(u.accountId)).toBe(afterFirst)
  })

  it('an operation whose commit was lost by the restore is created exactly once on replay', async () => {
    const u = await newUser(); const key = `offline-${randomUUID()}`
    const start = await bal(u.accountId)
    // restore simulation: the server has no record of the key (the write happened after the restore point)
    expect(await count(u.userId, key)).toBe(0)
    const replay = await post(u.cookie, op(u.accountId, key))
    expect(replay.statusCode).toBe(201)
    const again = await post(u.cookie, op(u.accountId, key))
    expect(again.json().transaction.id).toBe(replay.json().transaction.id)
    expect(await count(u.userId, key)).toBe(1)
    expect(await bal(u.accountId)).toBe(start - 25000n)
  })

  it('concurrent replays of one key (two tabs or a retry racing the original) produce one transaction', async () => {
    const u = await newUser(); const key = `offline-${randomUUID()}`
    const start = await bal(u.accountId)
    const results = await Promise.all(Array.from({ length: 6 }, () => post(u.cookie, op(u.accountId, key))))
    expect(results.every((r) => r.statusCode < 300)).toBe(true)
    expect(new Set(results.map((r) => r.json().transaction.id)).size).toBe(1)
    expect(await count(u.userId, key)).toBe(1)
    expect(await bal(u.accountId)).toBe(start - 25000n)
  })

  it('replaying the key after the transaction was reversed does not re-create or re-apply it', async () => {
    const u = await newUser(); const key = `offline-${randomUUID()}`
    const start = await bal(u.accountId)
    const first = await post(u.cookie, op(u.accountId, key))
    const rev = await app.inject({ method: 'POST', url: `/api/v1/transactions/${first.json().transaction.id}/reverse`, headers: { origin: APP_ORIGIN, cookie: u.cookie }, payload: {} })
    expect(rev.statusCode).toBeLessThan(300)
    const replay = await post(u.cookie, op(u.accountId, key))
    expect(replay.json().transaction.id).toBe(first.json().transaction.id)
    expect(await count(u.userId, key)).toBe(1)
    expect(await bal(u.accountId)).toBe(start)
  })

  it('reusing a key with a materially different request is a 409 conflict, never silently accepted', async () => {
    const u = await newUser(); const key = `offline-${randomUUID()}`
    const first = await post(u.cookie, op(u.accountId, key, { amountMinor: '25000' }))
    const changed = await post(u.cookie, op(u.accountId, key, { amountMinor: '99999' }))
    expect(changed.statusCode).toBe(409)
    expect(changed.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    const otherDay = await post(u.cookie, op(u.accountId, key, { occurredOn: '2026-10-16' }))
    expect(otherDay.statusCode).toBe(409)
    expect(await count(u.userId, key)).toBe(1)
    expect(await bal(u.accountId)).toBe(975_000n)
    // an unchanged retry (cosmetic differences only) is still a replay of the original
    const retry = await post(u.cookie, op(u.accountId, key, { title: 'Queued offline (retry)' }))
    expect(retry.statusCode).toBeLessThan(300)
    expect(retry.json().transaction.id).toBe(first.json().transaction.id)
  })

  it('idempotency keys are scoped per user: another session or user cannot collide with or read the operation', async () => {
    const a = await newUser(); const b = await newUser(); const key = `offline-${randomUUID()}`
    const first = await post(a.cookie, op(a.accountId, key))
    const other = await post(b.cookie, op(b.accountId, key))
    expect(other.statusCode).toBe(201)
    expect(other.json().transaction.id).not.toBe(first.json().transaction.id)
    // a replay that names someone else's account is refused and never posts
    const foreign = await post(b.cookie, op(a.accountId, `offline-${randomUUID()}`))
    expect(foreign.statusCode).toBeGreaterThanOrEqual(400)
    expect(await bal(a.accountId)).toBe(975_000n)
  })

  it('a session change (logged out) cannot replay: 401 and nothing posts, so the outbox keeps the operation', async () => {
    const u = await newUser(); const key = `offline-${randomUUID()}`
    const res = await app.inject({ method: 'POST', url: '/api/v1/transactions', headers: { origin: APP_ORIGIN }, payload: op(u.accountId, key) })
    expect(res.statusCode).toBe(401)
    expect(await count(u.userId, key)).toBe(0)
  })

  it('the reserved recurring: key prefix cannot be forged by an outbox replay', async () => {
    const u = await newUser()
    const res = await post(u.cookie, op(u.accountId, `recurring:${randomUUID()}:2026-10-10`))
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(await bal(u.accountId)).toBe(1_000_000n)
  })
})
