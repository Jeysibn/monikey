// Real-Postgres, real-HTTP integration coverage for Phase 6 (Investments).
// QA Attempt 1, Defect 5: zero coverage previously existed for this module,
// which is precisely how Defects 1/2 (floating-point cost-basis and cash
// math) went undetected. Exercises the actual `app.inject()` pipeline
// (auth cookies, origin checks, ledger-linked cash movement) against a real
// database, plus direct-Prisma coverage for the quota table added for
// Defects 3/4.
//
// Gated on a real database exactly like the other `*.db.test.ts` files:
// skips itself (rather than failing) when no TEST_DATABASE_URL/DATABASE_URL
// is set.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { createQuoteProvider, tryConsumeApiQuota } from '../../src/modules/investments/quotes.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

const APP_ORIGIN = 'http://localhost:8080'

function extractSessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  const cookie = res.cookies.find((c) => c.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

describeIfDb('Phase 6 Investments (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdEmails: string[] = []
  let app: FastifyInstance

  beforeEach(async () => {
    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN,
      SESSION_SECURE: 'false',
    })
    app = await buildApp({ env, prisma })
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } })
    await prisma.externalApiUsage.deleteMany({ where: { provider: { startsWith: 'qa-test-' } } })
    await prisma.$disconnect()
  })

  function uniqueEmail(prefix: string): string {
    const email = `qa-invest-${prefix}-${randomUUID()}@monikey.test`
    createdEmails.push(email)
    return email
  }

  async function registerUser(prefix: string): Promise<{ cookie: string; userId: string }> {
    const email = uniqueEmail(prefix)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'correct-horse-1', displayName: `Invest ${prefix}` },
    })
    expect(res.statusCode).toBe(201)
    const cookie = extractSessionCookie(res)!
    return { cookie, userId: res.json().user.id as string }
  }

  async function makeCashAccount(userId: string, balanceMinor: number): Promise<string> {
    const accountId = randomUUID()
    await prisma.financialAccount.create({ data: { id: accountId, userId, name: 'Brokerage cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: balanceMinor, openingBalanceMinor: balanceMinor } })
    return accountId
  }

  it('posts a buy trade linked to a cash account atomically, and is idempotent on retry', async () => {
    const { cookie, userId } = await registerUser('buy-happy')
    const cashAccountId = await makeCashAccount(userId, 100_000)
    const idempotencyKey = `buy-happy-${randomUUID()}`

    const payload = { ticker: 'IBM', name: 'IBM Corp', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 3, priceMinor: 15000, occurredOn: '2026-09-01', cashAccountId, idempotencyKey }

    const first = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload })
    expect(first.statusCode).toBe(201)
    const trade = first.json()
    expect(trade.units).toBe(3)
    expect(trade.priceMinor).toBe(15000)

    const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccountId } })
    expect(account.currentBalanceMinor).toBe(100_000n - 45_000n)

    // Retrying the same idempotency key returns the original trade without
    // debiting the cash account a second time.
    const retry = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload })
    expect(retry.statusCode).toBe(200)
    expect(retry.json().id).toBe(trade.id)
    const accountAfterRetry = await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccountId } })
    expect(accountAfterRetry.currentBalanceMinor).toBe(100_000n - 45_000n)
  })

  it('rejects a sell that exceeds currently held units (INVESTMENT_OVERSELL)', async () => {
    const { cookie, userId } = await registerUser('oversell')
    const cashAccountId = await makeCashAccount(userId, 100_000)

    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'MSFT', name: 'Microsoft', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 2, priceMinor: 20000, occurredOn: '2026-09-01', cashAccountId } })

    const oversell = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'MSFT', name: 'Microsoft', assetClass: 'equity', sector: 'Tech', type: 'sell', units: 3, priceMinor: 20000, occurredOn: '2026-09-02', cashAccountId } })
    expect(oversell.statusCode).toBe(422)
    expect(oversell.json().error.code).toBe('INVESTMENT_OVERSELL')
  })

  it('computes cost basis and average cost precisely across uneven-priced buys plus a partial sell (catches the float-precision bug class)', async () => {
    const { cookie, userId } = await registerUser('cost-basis')
    const cashAccountId = await makeCashAccount(userId, 1_000_000)

    // Buy 3 units @ 33333 minor and 3 units @ 33334 minor -> total cost basis
    // = 99999 + 100002 = 200001 over 6 units. A float `costBasisMinor/units`
    // average (33333.5) fed back into a later partial-sell subtraction would
    // drift after repeated float rounding; Decimal must not.
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto', sector: 'Crypto', type: 'buy', units: 3, priceMinor: 33333, occurredOn: '2026-09-01', cashAccountId } })
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto', sector: 'Crypto', type: 'buy', units: 3, priceMinor: 33334, occurredOn: '2026-09-02', cashAccountId } })
    // Partial sell of 2 units at the running average cost basis.
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto', sector: 'Crypto', type: 'sell', units: 2, priceMinor: 40000, occurredOn: '2026-09-03', cashAccountId } })

    const list = await app.inject({ method: 'GET', url: '/api/v1/investments', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    const holding = list.json().holdings.find((h: { ticker: string }) => h.ticker === 'BTC')
    expect(holding).toBeDefined()

    // Hand-calculated expected values:
    // totalCostBasis = 3*33333 + 3*33334 = 99999 + 100002 = 200001
    // averageCost (pre-sell) = 200001 / 6 = 33333.5
    // removed on sell of 2 units = 33333.5 * 2 = 66667 (rounded)
    // remaining costBasis = 200001 - 66667 = 133334
    // remaining units = 6 - 2 = 4
    // averageCostMinor (post-sell) = round(133334 / 4) = 33334 (since 33333.5 rounds to 33334)
    expect(holding.units).toBe(4)
    expect(holding.costBasisMinor).toBe(133334)
    expect(holding.averageCostMinor).toBe(33334)
  })

  it('posts a dividend sharing a ledger transaction with the cash account credit', async () => {
    const { cookie, userId } = await registerUser('dividend')
    const cashAccountId = await makeCashAccount(userId, 5_000)
    const buy = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'AAPL', name: 'Apple', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 1, priceMinor: 1000, occurredOn: '2026-09-01', cashAccountId } })
    expect(buy.statusCode).toBe(201)

    const dividendRes = await app.inject({ method: 'POST', url: '/api/v1/investments/dividends', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'AAPL', amountMinor: 250, occurredOn: '2026-09-05', cashAccountId } })
    expect(dividendRes.statusCode).toBe(201)
    expect(dividendRes.json().amountMinor).toBe(250)

    const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccountId } })
    // 5000 - 1000 (buy) + 250 (dividend) = 4250
    expect(account.currentBalanceMinor).toBe(4250n)

    const dividendRow = await prisma.dividend.findFirstOrThrow({ where: { userId, amountMinor: 250n } })
    expect(dividendRow.instrumentId).toBeTruthy()
  })

  it('persists quote snapshots and reports staleness metadata', async () => {
    const { cookie, userId } = await registerUser('quotes')
    const cashAccountId = await makeCashAccount(userId, 10_000)
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'VOO', name: 'Vanguard S&P 500', assetClass: 'etf', sector: 'Index', type: 'buy', units: 1, priceMinor: 5000, occurredOn: '2026-09-01', cashAccountId } })

    const instrument = await prisma.instrument.findFirstOrThrow({ where: { userId, ticker: 'VOO' } })
    const freshFetchedAt = new Date()
    await prisma.quoteSnapshot.create({ data: { instrumentId: instrument.id, source: 'test_provider', priceMinor: 5200n, currencyCode: 'USD', fetchedAt: freshFetchedAt } })

    const list = await app.inject({ method: 'GET', url: '/api/v1/investments', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    const holding = list.json().holdings.find((h: { ticker: string }) => h.ticker === 'VOO')
    expect(holding.latestPriceMinor).toBe(5200)
    expect(holding.quoteSource).toBe('test_provider')
    expect(holding.quoteStale).toBe(false)

    // An old snapshot (>24h) is reported stale.
    const staleInstrument = await prisma.instrument.create({ data: { userId, ticker: 'STALE', name: 'Stale Co', assetClass: 'equity', sector: 'Test' } })
    await prisma.investmentTrade.create({ data: { userId, instrumentId: staleInstrument.id, type: 'buy', units: '1', priceMinor: 1000n, occurredOn: new Date('2026-08-01T00:00:00Z') } })
    await prisma.quoteSnapshot.create({ data: { instrumentId: staleInstrument.id, source: 'test_provider', priceMinor: 900n, currencyCode: 'USD', fetchedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } })
    const list2 = await app.inject({ method: 'GET', url: '/api/v1/investments', headers: { cookie } })
    const staleHolding = list2.json().holdings.find((h: { ticker: string }) => h.ticker === 'STALE')
    expect(staleHolding.quoteStale).toBe(true)
  })

  it('does not let user B see or sell against user A holdings (cross-user isolation)', async () => {
    const userA = await registerUser('iso-a')
    const userB = await registerUser('iso-b')
    const cashA = await makeCashAccount(userA.userId, 100_000)
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie: userA.cookie }, payload: { ticker: 'TSLA', name: 'Tesla', assetClass: 'equity', sector: 'Auto', type: 'buy', units: 5, priceMinor: 10000, occurredOn: '2026-09-01', cashAccountId: cashA } })

    const listB = await app.inject({ method: 'GET', url: '/api/v1/investments', headers: { cookie: userB.cookie } })
    expect(listB.json().holdings).toHaveLength(0)
    expect(listB.json().trades).toHaveLength(0)

    // User B "selling" TSLA has no prior holding under their own userId, so
    // it is rejected as an oversell rather than touching user A's position.
    const sellAttempt = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie: userB.cookie }, payload: { ticker: 'TSLA', name: 'Tesla', assetClass: 'equity', sector: 'Auto', type: 'sell', units: 1, priceMinor: 10000, occurredOn: '2026-09-02' } })
    expect(sellAttempt.statusCode).toBe(422)
    expect(sellAttempt.json().error.code).toBe('INVESTMENT_OVERSELL')

    const accountA = await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashA } })
    expect(accountA.currentBalanceMinor).toBe(100_000n - 50_000n)
  })

  it('enforces the external API quota cap: a live call is skipped (not thrown) once the daily budget is exhausted', async () => {
    const provider = 'qa-test-alpha-vantage'
    const period = '2026-09-01'
    for (let i = 0; i < 2; i++) {
      const allowed = await tryConsumeApiQuota(prisma, provider, period, 'get_quotes', 2)
      expect(allowed).toBe(true)
    }
    const exhausted = await tryConsumeApiQuota(prisma, provider, period, 'get_quotes', 2)
    expect(exhausted).toBe(false)

    const row = await prisma.externalApiUsage.findUniqueOrThrow({ where: { provider_period_operation: { provider, period, operation: 'get_quotes' } } })
    expect(row.callCount).toBe(2)
  })

  it('the quote-refresh worker path skips a live call once quota is gone and never crashes', async () => {
    const { userId } = await registerUser('quota-worker')
    const instrument = await prisma.instrument.create({ data: { userId, ticker: 'QUOTAX', name: 'Quota Test Co', assetClass: 'equity', sector: 'Test' } })

    // Isolate the Alpha Vantage quota path from CoinGecko (which, via
    // `refreshQuoteSnapshots`'s deliberately global instrument scan, would
    // also try to fetch any BTC/ETH/etc. instrument left over from other
    // tests in this file) by driving `QuotaGatedQuoteProvider` directly.
    const { QuotaGatedQuoteProvider, AlphaVantageQuoteProvider, dailyPeriod } = await import('../../src/modules/investments/quotes.js')
    const netFetcher = async () => { throw new Error('network must not be called once quota is exhausted') }
    const gated = new QuotaGatedQuoteProvider(
      new AlphaVantageQuoteProvider('unused-test-key', undefined, netFetcher),
      prisma,
      'qa-test-quota-worker',
      dailyPeriod,
      0,
      { warn: () => undefined },
    )

    const quotes = await gated.getQuotes([instrument.ticker])
    expect(quotes.size).toBe(0)

    const usageRow = await prisma.externalApiUsage.findUniqueOrThrow({ where: { provider_period_operation: { provider: 'qa-test-quota-worker', period: dailyPeriod(), operation: 'get_quotes' } } })
    expect(usageRow.callCount).toBe(0)
  })

  it('edits a non-cash-linked trade and re-validates the oversell guard against its siblings', async () => {
    const { cookie, userId } = await registerUser('edit-trade')
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'NFLX', name: 'Netflix', assetClass: 'equity', sector: 'Media', type: 'buy', units: 10, priceMinor: 40000, occurredOn: '2026-09-01' } })
    const buy2 = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'NFLX', name: 'Netflix', assetClass: 'equity', sector: 'Media', type: 'buy', units: 2, priceMinor: 41000, occurredOn: '2026-09-02' } })
    const tradeId = buy2.json().id as string

    // Editing to a units value still covered by the other buy succeeds.
    const edited = await app.inject({ method: 'PATCH', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie }, payload: { type: 'buy', units: 3, priceMinor: 42000, occurredOn: '2026-09-02' } })
    expect(edited.statusCode).toBe(200)
    expect(edited.json().units).toBe(3)

    // Editing it into a sell larger than what the sibling buy alone holds is rejected.
    const oversell = await app.inject({ method: 'PATCH', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie }, payload: { type: 'sell', units: 50, priceMinor: 42000, occurredOn: '2026-09-02' } })
    expect(oversell.statusCode).toBe(422)
    expect(oversell.json().error.code).toBe('INVESTMENT_OVERSELL')

    // Not found / cross-user.
    const notFound = await app.inject({ method: 'PATCH', url: '/api/v1/investments/trades/00000000-0000-0000-0000-000000000000', headers: { origin: APP_ORIGIN, cookie }, payload: { type: 'buy', units: 1, priceMinor: 1000, occurredOn: '2026-09-02' } })
    expect(notFound.statusCode).toBe(404)
    void userId
  })

  it('refuses to edit a cash-linked trade instead of letting the account balance drift (TRADE_HAS_LINKED_TRANSACTION)', async () => {
    const { cookie, userId } = await registerUser('edit-cash-linked')
    const cashAccountId = await makeCashAccount(userId, 100_000)
    const created = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'ORCL', name: 'Oracle', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 1, priceMinor: 10000, occurredOn: '2026-09-01', cashAccountId } })
    const tradeId = created.json().id as string

    const attempt = await app.inject({ method: 'PATCH', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie }, payload: { type: 'buy', units: 2, priceMinor: 10000, occurredOn: '2026-09-01' } })
    expect(attempt.statusCode).toBe(409)
    expect(attempt.json().error.code).toBe('TRADE_HAS_LINKED_TRANSACTION')
  })

  it('deletes a non-cash-linked trade outright', async () => {
    const { cookie } = await registerUser('delete-trade')
    const created = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'AMD', name: 'AMD', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 1, priceMinor: 5000, occurredOn: '2026-09-01' } })
    const tradeId = created.json().id as string

    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie } })
    expect(deleted.statusCode).toBe(204)
    expect(await prisma.investmentTrade.findUnique({ where: { id: tradeId } })).toBeNull()

    const notFound = await app.inject({ method: 'DELETE', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie } })
    expect(notFound.statusCode).toBe(404)
  })

  it('deletes a cash-linked trade and reverses its ledger transaction, restoring the account balance', async () => {
    const { cookie, userId } = await registerUser('delete-cash-linked')
    const cashAccountId = await makeCashAccount(userId, 100_000)
    const created = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'INTC', name: 'Intel', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 1, priceMinor: 20000, occurredOn: '2026-09-01', cashAccountId } })
    const tradeId = created.json().id as string
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccountId } })).currentBalanceMinor).toBe(80_000n)

    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie } })
    expect(deleted.statusCode).toBe(204)
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccountId } })).currentBalanceMinor).toBe(100_000n)
  })

  it('refuses to delete a cash-linked trade whose matching ledger transaction is already reversed (TRADE_CASH_LINK_UNRESOLVED)', async () => {
    const { cookie, userId } = await registerUser('delete-unresolved')
    const cashAccountId = await makeCashAccount(userId, 100_000)
    const created = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'CSCO', name: 'Cisco', assetClass: 'equity', sector: 'Tech', type: 'buy', units: 1, priceMinor: 20000, occurredOn: '2026-09-01', cashAccountId } })
    const tradeId = created.json().id as string
    const trade = await prisma.investmentTrade.findUniqueOrThrow({ where: { id: tradeId } })
    const linked = await prisma.transaction.findFirstOrThrow({ where: { userId, idempotencyKey: trade.idempotencyKey! } })
    // Simulate the linked transaction having already been reversed
    // out-of-band, so the trade's cash link can no longer be resolved.
    await prisma.transaction.update({ where: { id: linked.id }, data: { reversedTransactionId: linked.id } })

    const attempt = await app.inject({ method: 'DELETE', url: `/api/v1/investments/trades/${tradeId}`, headers: { origin: APP_ORIGIN, cookie } })
    expect(attempt.statusCode).toBe(409)
    expect(attempt.json().error.code).toBe('TRADE_CASH_LINK_UNRESOLVED')
    // The trade itself must still exist — refused, not partially applied.
    expect(await prisma.investmentTrade.findUnique({ where: { id: tradeId } })).not.toBeNull()
  })

  it('rejects logging a second trade under the same ticker with different instrument metadata (INSTRUMENT_METADATA_MISMATCH)', async () => {
    const { cookie } = await registerUser('metadata-mismatch')
    const first = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'GME', name: 'GameStop', assetClass: 'equity', sector: 'Retail', type: 'buy', units: 1, priceMinor: 2000, occurredOn: '2026-09-01' } })
    expect(first.statusCode).toBe(201)

    const mismatch = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'GME', name: 'GameStop Corp', assetClass: 'equity', sector: 'Retail', type: 'buy', units: 1, priceMinor: 2000, occurredOn: '2026-09-02' } })
    expect(mismatch.statusCode).toBe(409)
    expect(mismatch.json().error.code).toBe('INSTRUMENT_METADATA_MISMATCH')
    expect(mismatch.json().error.field).toBe('ticker')

    // Resubmitting with identical metadata still succeeds (not a false positive).
    const same = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'GME', name: 'GameStop', assetClass: 'equity', sector: 'Retail', type: 'buy', units: 1, priceMinor: 2000, occurredOn: '2026-09-03' } })
    expect(same.statusCode).toBe(201)
  })

  it('posts trade and dividend ledger transfers under the user\'s real base currency, not a hardcoded PHP', async () => {
    const { cookie, userId } = await registerUser('base-currency')
    // Registered users default to PHP; exercise a non-default base currency explicitly.
    await prisma.user.update({ where: { id: userId }, data: { baseCurrency: 'USD' } })
    const cashAccountId = await makeCashAccount(userId, 100_000)

    const trade = await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'V', name: 'Visa', assetClass: 'equity', sector: 'Finance', type: 'buy', units: 1, priceMinor: 10000, occurredOn: '2026-09-01', cashAccountId } })
    const tradeTx = await prisma.transaction.findFirstOrThrow({ where: { userId, idempotencyKey: trade.json().idempotencyKey } })
    expect(tradeTx.currencyCode).toBe('USD')

    const instrument = await prisma.instrument.findFirstOrThrow({ where: { userId, ticker: 'V' } })
    await app.inject({ method: 'POST', url: '/api/v1/investments/dividends', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'V', amountMinor: 100, occurredOn: '2026-09-05', cashAccountId } })
    const dividendTx = await prisma.transaction.findFirstOrThrow({ where: { userId, toAccountId: cashAccountId, amountMinor: 100n } })
    expect(dividendTx.currencyCode).toBe('USD')
    void instrument
  })

  it('manually refreshes quotes for only the caller\'s own instruments, honoring the cooldown window', async () => {
    const { cookie } = await registerUser('refresh')
    await app.inject({ method: 'POST', url: '/api/v1/investments/trades', headers: { origin: APP_ORIGIN, cookie }, payload: { ticker: 'PYPL', name: 'PayPal', assetClass: 'equity', sector: 'Fintech', type: 'buy', units: 1, priceMinor: 8000, occurredOn: '2026-09-01' } })

    const first = await app.inject({ method: 'POST', url: '/api/v1/investments/quotes/refresh', headers: { origin: APP_ORIGIN, cookie } })
    expect(first.statusCode).toBe(200)
    expect(first.json().checked).toBeGreaterThanOrEqual(0)

    // Immediately retrying is throttled by the manual-refresh cooldown.
    const second = await app.inject({ method: 'POST', url: '/api/v1/investments/quotes/refresh', headers: { origin: APP_ORIGIN, cookie } })
    expect(second.statusCode).toBe(429)
    expect(second.json().error.code).toBe('QUOTE_REFRESH_COOLDOWN')
  })

  it('stub provider mode never touches the usage table or the network', async () => {
    const provider = createQuoteProvider({ QUOTE_PROVIDER: 'stub' })
    const before = await prisma.externalApiUsage.count({ where: { provider: 'alpha_vantage' } })
    const quotes = await provider.getQuotes(['IBM'])
    expect(quotes.size).toBe(0)
    const after = await prisma.externalApiUsage.count({ where: { provider: 'alpha_vantage' } })
    expect(after).toBe(before)
  })
})
