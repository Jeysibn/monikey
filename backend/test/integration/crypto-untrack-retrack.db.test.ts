import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { CoinGeckoCryptoCatalog } from '../../src/modules/investments/cryptoCatalog.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const APP_ORIGIN = 'http://localhost:8080'
const providerAssetId = 'bitcoin'

function sessionCookie(res: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = res.cookies.find((item) => item.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

describeIfDb('Crypto untrack → re-track history preservation (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const emails: string[] = []
  let app: FastifyInstance

  beforeEach(async () => {
    const catalog = new CoinGeckoCryptoCatalog(undefined, 'https://catalog.test/api/v3', async (input) => {
      if (!input.includes('/coins/markets')) return new Response(JSON.stringify({ coins: [] }), { status: 200 })
      return new Response(JSON.stringify([{ id: providerAssetId, symbol: 'btc', name: 'Bitcoin', image: null, market_cap_rank: 1, current_price: 4_000_000, price_change_percentage_24h_in_currency: 0 }]), { status: 200 })
    })
    const env = loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent', APP_ORIGIN, SESSION_SECURE: 'false' })
    app = await buildApp({ env, prisma, cryptoCatalog: catalog })
  })

  afterEach(async () => { await app.close() })
  afterAll(async () => { await prisma.user.deleteMany({ where: { email: { in: emails } } }); await prisma.$disconnect() })

  it('hides a coin without deleting activity and restores that activity when re-tracked', async () => {
    const email = `qa-crypto-retrack-${randomUUID()}@monikey.test`
    emails.push(email)
    const registration = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin: APP_ORIGIN }, payload: { email, password: 'correct-horse-1', displayName: 'Crypto Retrack Test' } })
    expect(registration.statusCode).toBe(201)
    const cookie = sessionCookie(registration)
    expect(cookie).toBeDefined()
    const headers = { cookie: cookie!, origin: APP_ORIGIN }

    const tracked = await app.inject({ method: 'POST', url: '/api/v1/crypto/coins', headers, payload: { providerAssetId } })
    expect(tracked.statusCode).toBe(201)
    const instrumentId = tracked.json().coin.instrumentId as string

    const location = await app.inject({ method: 'POST', url: '/api/v1/crypto/locations', headers, payload: { name: 'Test Wallet', type: 'wallet' } })
    expect(location.statusCode).toBe(201)
    const locationId = location.json().location.id as string
    const trade = await app.inject({ method: 'POST', url: '/api/v1/crypto/trades', headers, payload: { instrumentId, type: 'buy', units: '0.5', priceAmount: '4000000', feeAmount: '0', currencyCode: 'PHP', locationId, occurredOn: '2026-09-01', idempotencyKey: randomUUID() } })
    expect(trade.statusCode).toBe(201)

    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/crypto/coins/${instrumentId}`, headers })
    expect(removed.statusCode).toBe(204)
    const hidden = await app.inject({ method: 'GET', url: '/api/v1/crypto/activities', headers })
    expect(hidden.statusCode).toBe(200)
    expect(hidden.json().activities).toHaveLength(1)
    const hiddenPortfolio = await app.inject({ method: 'GET', url: '/api/v1/crypto', headers })
    expect(hiddenPortfolio.statusCode).toBe(200)
    expect(hiddenPortfolio.json().coins).toHaveLength(0)

    const retracked = await app.inject({ method: 'POST', url: '/api/v1/crypto/coins', headers, payload: { providerAssetId } })
    expect(retracked.statusCode).toBe(201)
    expect(retracked.json().coin.instrumentId).toBe(instrumentId)
    const restored = await app.inject({ method: 'GET', url: '/api/v1/crypto', headers })
    expect(restored.statusCode).toBe(200)
    expect(restored.json().coins[0].quantity).toBe('0.5')
    const restoredActivities = await app.inject({ method: 'GET', url: `/api/v1/crypto/activities?instrumentId=${instrumentId}`, headers })
    expect(restoredActivities.json().activities).toHaveLength(1)
  })
})
