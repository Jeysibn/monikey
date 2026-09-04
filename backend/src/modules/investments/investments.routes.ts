import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { LedgerService } from '../ledger/ledger.service.js'
import { calculatePortfolio, type Dividend as EngineDividend, type Quote as EngineQuote, type Trade as EngineTrade } from './portfolioAccounting.js'
import type { QuoteProvider } from './quotes.js'
import type { FxRateService } from '../fx/fx.module.js'

const tradeSchema = z.object({ ticker: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(160), assetClass: z.enum(['equity', 'etf', 'crypto', 'reit', 'bond']), sector: z.string().trim().min(1).max(80), type: z.enum(['buy', 'sell']), units: z.number().positive(), priceMinor: z.number().int().positive(), feeMinor: z.number().int().nonnegative().optional(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cashAccountId: z.string().uuid().nullable().optional(), note: z.string().max(500).nullable().optional(), idempotencyKey: z.string().max(128).nullable().optional() })
const dividendSchema = z.object({ ticker: z.string().trim().min(1).max(16), amountMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cashAccountId: z.string().uuid().nullable().optional(), note: z.string().max(500).nullable().optional() })
const updateTradeSchema = z.object({ type: z.enum(['buy', 'sell']), units: z.number().positive(), priceMinor: z.number().int().positive(), feeMinor: z.number().int().nonnegative().optional(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).nullable().optional() })
const tradeIdParamSchema = z.object({ id: z.string().uuid('Invalid trade ID format') })

// Phase 3 (plan §9): crypto trades 24/7 so a quote goes stale fast; equities/
// ETFs/REITs/bonds only move during market hours, so a much longer TTL
// doesn't mean "wrong", it means "as of last close". Still a coarse
// two-bucket split, not per-exchange market-hours awareness — that's future
// work once a real quote provider (rather than trade-price-as-quote) exists.
const QUOTE_STALE_AFTER_MS: Record<'crypto' | 'equity', number> = {
  crypto: 5 * 60 * 1000,
  equity: 24 * 60 * 60 * 1000,
}
// Instruments created before Phase 1 (or created without going through the
// trade-creation upsert below) may have `assetType` still null. Fall back to
// the free-text `assetClass` string trades have always carried.
function staleAfterMs(instrument: { assetType: string | null; assetClass: string }): number {
  const kind = instrument.assetType ?? instrument.assetClass
  return kind === 'crypto' ? QUOTE_STALE_AFTER_MS.crypto : QUOTE_STALE_AFTER_MS.equity
}
// assetClass (this route's long-standing free-text field, e.g. from
// tradeSchema's enum) -> the persisted InstrumentAssetType enum. 'equity'
// predates the Phase 1 schema addition and has no matching enum value, so it
// maps to 'stock' — the closest real market-identity bucket.
function toInstrumentAssetType(assetClass: string): 'stock' | 'etf' | 'crypto' | 'reit' | 'bond' {
  return assetClass === 'equity' ? 'stock' : (assetClass as 'etf' | 'crypto' | 'reit' | 'bond')
}

// Plan §10: a manual refresh must not allow rapid repeated requests to burn
// through provider quota. This is a per-process, in-memory cooldown (not
// persisted) — good enough for a single-user click-to-refresh button; the
// shared quota table in quotes.ts is the real cross-process backstop.
const REFRESH_COOLDOWN_MS = 60 * 1000
const lastManualRefreshAt = new Map<string, number>()

export async function investmentsRoutes(app: FastifyInstance, options: { prisma: PrismaClient; ledgerService: LedgerService; appOrigin: string; quoteProvider?: QuoteProvider; fxService?: FxRateService }) {
  const requireAuth = authGuard({ prisma: options.prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: options.appOrigin })
  app.get('/investments', { preHandler: requireAuth }, async (request) => {
    const [trades, dividends] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId: request.user!.id }, include: { instrument: { include: { quoteSnapshots: { orderBy: { fetchedAt: 'desc' }, take: 1 } } } }, orderBy: { occurredOn: 'desc' } }),
      options.prisma.dividend.findMany({ where: { userId: request.user!.id }, include: { instrument: true }, orderBy: { occurredOn: 'desc' } }),
    ])

    // Authoritative accounting lives entirely in portfolioAccounting.ts —
    // this route only translates Prisma rows into the engine's plain input
    // types, then translates the engine's Decimal output into the wire
    // response (Number(...) conversion happens only at that final
    // serialization boundary, never mid-calculation).
    type InstrumentWithOptionalQuotes = typeof dividends[number]['instrument'] & { quoteSnapshots?: typeof trades[number]['instrument']['quoteSnapshots'] }
    const instrumentById = new Map<string, InstrumentWithOptionalQuotes>(trades.map((trade) => [trade.instrumentId, trade.instrument]))
    for (const dividend of dividends) if (!instrumentById.has(dividend.instrumentId)) instrumentById.set(dividend.instrumentId, dividend.instrument)

    const engineTrades: EngineTrade[] = trades.map((trade) => ({ id: trade.id, instrumentId: trade.instrumentId, type: trade.type, units: trade.units.toString(), priceMinor: trade.priceMinor.toString(), feeMinor: trade.feeMinor.toString(), occurredOn: trade.occurredOn }))
    const engineDividends: EngineDividend[] = dividends.map((dividend) => ({ instrumentId: dividend.instrumentId, amountMinor: dividend.amountMinor.toString() }))
    const engineQuotes: EngineQuote[] = []
    for (const instrument of instrumentById.values()) {
      const snapshot = instrument.quoteSnapshots?.[0]
      if (!snapshot) continue
      engineQuotes.push({
        instrumentId: instrument.id,
        priceMinor: snapshot.priceMinor.toString(),
        currencyCode: snapshot.currencyCode,
        source: snapshot.source,
        fetchedAt: snapshot.fetchedAt,
        stale: Date.now() - snapshot.fetchedAt.getTime() > staleAfterMs(instrument),
        change24hMinor: snapshot.change24hMinor?.toString() ?? null,
        change24hPct: snapshot.change24hPct?.toString() ?? null,
      })
    }

    const portfolio = calculatePortfolio(engineTrades, engineDividends, engineQuotes)

    // Plan §13: a quote's native market currency (e.g. USD for AAPL/BTC) can
    // differ from the user's base display currency (default PHP). Cost basis
    // is entered by the user and always treated as already-base-currency (no
    // trade-level currencyCode exists yet), but marketValue/unrealizedPnL are
    // *derived from the live quote* and must be converted before display —
    // never formatted as PHP while actually holding a USD number. When a
    // rate can't be obtained, native figures are kept and flagged rather
    // than invented (never fabricate a conversion).
    const baseCurrency = request.user!.baseCurrency
    const nativeCurrencies = [...new Set(engineQuotes.map((q) => q.currencyCode).filter((code) => code !== baseCurrency))]
    // Kept as Decimal, not Number — the FX rate can carry more decimal places
    // than a float safely multiplies against a minor-unit integer without
    // rounding error (see the conversion below, which stays in Decimal
    // through the multiply and rounds exactly once at the end).
    const fxRateToBase = new Map<string, Prisma.Decimal>()
    if (options.fxService && nativeCurrencies.length > 0) {
      await Promise.all(nativeCurrencies.map(async (native) => {
        try {
          // `preferCache: true` — this route is a hot read path (every
          // portfolio load) with its own daily-refreshed cache (the worker's
          // `refreshRatesForActiveCurrencies`); a live outbound FX call per
          // page load is unnecessary latency/dependency risk when a cached
          // rate already exists. Falls through to a live fetch automatically
          // when nothing is cached yet.
          const rateSet = await options.fxService!.getRates(native, [baseCurrency], undefined, { preferCache: true })
          const rate = rateSet.rates[baseCurrency]?.rate
          if (rate !== undefined) fxRateToBase.set(native, new Prisma.Decimal(String(rate)))
        } catch {
          // Leave unset — surfaced per-holding as baseValuationUnavailable.
        }
      }))
    }

    const toHolding = (holding: (typeof portfolio.holdings)[number]) => {
      const instrument = instrumentById.get(holding.instrumentId)!
      const nativeCurrencyCode = holding.quote?.currencyCode ?? baseCurrency
      const needsConversion = nativeCurrencyCode !== baseCurrency
      const rate = needsConversion ? fxRateToBase.get(nativeCurrencyCode) : new Prisma.Decimal(1)
      const baseValuationUnavailable = needsConversion && rate === undefined
      const marketValueMinor = holding.marketValueMinor?.round().toNumber() ?? null
      // Bug: the engine (portfolioAccounting.ts) computes
      // unrealizedPnlMinor = marketValueMinor(native currency, e.g. USD
      // cents from a crypto quote) - remainingCostBasisMinor(base currency,
      // e.g. PHP centavos the user entered) — it has no way to know these
      // differ, since cost basis carries no currencyCode of its own and is
      // always treated as base-currency (see the comment above). Applying
      // the FX rate to that already-mismatched difference afterwards (the
      // old `unrealizedPnlMinor.times(rate)` below) does not fix it — it
      // just scales a nonsense number, which is how a 1-unit XRP position
      // (cost ₱84.90, market value ₱78) previously showed a "Total Return"
      // of -₱4,773.48 (-5622.47%) instead of the correct ~-₱6.90 (-8.1%).
      // Recompute unrealized P&L here in base currency instead of trusting
      // the engine's mixed-currency figure: convert market value to base
      // *first*, then subtract the (already base-currency) cost basis.
      const marketValueBaseMinorForPnl = baseValuationUnavailable || marketValueMinor === null
        ? null
        : new Prisma.Decimal(marketValueMinor).times(rate!).round().toNumber()
      const unrealizedPnlMinor = holding.unrealizedPnlMinor?.round().toNumber() ?? null
      const unrealizedPnlBaseMinor = marketValueBaseMinorForPnl === null
        ? null
        : marketValueBaseMinorForPnl - holding.remainingCostBasisMinor.round().toNumber()
      return {
        instrumentId: holding.instrumentId,
        ticker: instrument.ticker,
        name: instrument.name,
        assetClass: instrument.assetClass,
        sector: instrument.sector,
        units: holding.unitsHeld.toNumber(),
        averageCostMinor: holding.averageCostMinor.round().toNumber(),
        costBasisMinor: holding.remainingCostBasisMinor.round().toNumber(),
        realizedPnlMinor: holding.realizedPnlMinor.round().toNumber(),
        dividendsReceivedMinor: holding.dividendsReceivedMinor.round().toNumber(),
        feesPaidMinor: holding.feesPaidMinor.round().toNumber(),
        latestPriceMinor: holding.quote ? Math.round(Number(holding.quote.priceMinor)) : null,
        // Base-currency conversion of the raw quote price above, so a
        // "Current Price" column never shows a native (e.g. USD) figure
        // with a base-currency (e.g. ₱) symbol — null when conversion isn't
        // possible (see baseValuationUnavailable).
        latestPriceBaseMinor: baseValuationUnavailable || holding.quote == null
          ? null
          : new Prisma.Decimal(Number(holding.quote.priceMinor)).times(rate!).round().toNumber(),
        // Trailing-24h change — percent is currency-agnostic (a ratio), so
        // it's passed through as-is; the currency figure needs the same
        // base-currency conversion as every other native-currency amount
        // here. Both null (not 0) when the quote has none (e.g. equities,
        // or before the worker's first 24h-change-aware refresh).
        change24hPct: holding.quote?.change24hPct != null ? Number(holding.quote.change24hPct) : null,
        change24hBaseMinor: baseValuationUnavailable || holding.quote?.change24hMinor == null
          ? null
          : new Prisma.Decimal(Number(holding.quote.change24hMinor)).times(rate!).round().toNumber(),
        // The above is a per-unit price move; scaled by units held for the
        // position's actual currency daily gain/loss, feeding the
        // portfolio-level "Today's Change" KPI below.
        dailyChangeBaseMinor: baseValuationUnavailable || holding.quote?.change24hMinor == null
          ? null
          : new Prisma.Decimal(Number(holding.quote.change24hMinor)).times(rate!).times(holding.unitsHeld).round().toNumber(),
        // Native-currency figures, straight from the quote — always present.
        marketValueMinor,
        unrealizedPnlMinor,
        nativeCurrencyCode,
        // Base-currency (display) figures — null when conversion isn't
        // possible. Converted via Decimal multiplication (never
        // Number*Number — that reintroduces float error precisely where
        // this module otherwise bans it) with a single final rounding.
        // unrealizedPnlBaseMinor is NOT simply unrealizedPnlMinor*rate — see
        // the comment above marketValueBaseMinorForPnl for why that was
        // wrong (it scaled an already currency-mismatched subtraction).
        marketValueBaseMinor: marketValueBaseMinorForPnl,
        unrealizedPnlBaseMinor,
        baseValuationUnavailable,
        quoteSource: holding.quote?.source ?? 'trade',
        quoteFetchedAt: holding.quote?.fetchedAt.toISOString() ?? null,
        quoteStale: holding.quote?.stale ?? true,
      }
    }

    const holdingsWithBase = portfolio.holdings.map(toHolding)
    // Summary valuation totals are derived from each holding's base-currency
    // figure (falling back to the native one when conversion is unavailable
    // — better than silently dropping the position from the total) rather
    // than the engine's raw currency-agnostic sum, so a mixed PHP/USD
    // portfolio doesn't add unlike currencies together.
    const portfolioValueBaseMinor = holdingsWithBase.reduce((sum, h) => sum + (h.marketValueBaseMinor ?? h.marketValueMinor ?? 0), 0)
    const unrealizedPnlBaseMinor = holdingsWithBase.reduce((sum, h) => sum + (h.unrealizedPnlBaseMinor ?? h.unrealizedPnlMinor ?? 0), 0)
    const anyBaseValuationUnavailable = holdingsWithBase.some((h) => h.baseValuationUnavailable)
    // Skips holdings with no 24h figure (equities, or a not-yet-refreshed
    // quote) rather than treating "unknown" as "flat 0%" — a portfolio of
    // only such holdings correctly reports null, not a fabricated 0.
    const holdingsWithDailyChange = holdingsWithBase.filter((h) => h.dailyChangeBaseMinor != null)
    const todaysChangeBaseMinor = holdingsWithDailyChange.length > 0
      ? holdingsWithDailyChange.reduce((sum, h) => sum + (h.dailyChangeBaseMinor ?? 0), 0)
      : null
    // Percent uses yesterday's implied portfolio value (today's value minus
    // today's move) as the denominator — the same "vs this time yesterday"
    // convention every tracker uses for a daily % badge — restricted to the
    // subset of holdings that actually have a 24h figure, so a holding with
    // no data doesn't silently distort the ratio for the ones that do.
    const yesterdayValueForPct = holdingsWithDailyChange.reduce((sum, h) => sum + (h.marketValueBaseMinor ?? h.marketValueMinor ?? 0) - (h.dailyChangeBaseMinor ?? 0), 0)
    const todaysChangePct = todaysChangeBaseMinor != null && yesterdayValueForPct > 0
      ? new Prisma.Decimal(todaysChangeBaseMinor).dividedBy(yesterdayValueForPct).times(100).toDecimalPlaces(4).toNumber()
      : null

    return {
      baseCurrency,
      summary: {
        portfolioValueMinor: portfolioValueBaseMinor,
        remainingCostBasisMinor: portfolio.summary.remainingCostBasisMinor.round().toNumber(),
        realizedPnlMinor: portfolio.summary.realizedPnlMinor.round().toNumber(),
        unrealizedPnlMinor: unrealizedPnlBaseMinor,
        todaysChangeMinor: todaysChangeBaseMinor,
        todaysChangePct,
        dividendsMinor: portfolio.summary.dividendsMinor.round().toNumber(),
        feesMinor: portfolio.summary.feesMinor.round().toNumber(),
        // realizedPnlMinor/dividendsMinor aren't currency-tagged yet (no
        // per-trade currencyCode exists — see the module-level comment
        // above), so they're taken as-is (assumed base-currency, same as
        // cost basis). unrealizedPnlBaseMinor is the corrected,
        // FX-converted figure computed per-holding above — using the
        // engine's raw portfolio.summary.totalReturnMinor here instead
        // would reintroduce the same mixed-currency bug this route now
        // fixes at the holding level, just at the summary level.
        totalReturnMinor: portfolio.summary.realizedPnlMinor.round().toNumber()
          + unrealizedPnlBaseMinor
          + portfolio.summary.dividendsMinor.round().toNumber(),
        totalReturnPct: portfolio.summary.remainingCostBasisMinor.greaterThan(0)
          ? new Prisma.Decimal(portfolio.summary.realizedPnlMinor.round().toNumber() + unrealizedPnlBaseMinor + portfolio.summary.dividendsMinor.round().toNumber())
              .dividedBy(portfolio.summary.remainingCostBasisMinor)
              .times(100)
              .toDecimalPlaces(4)
              .toNumber()
          : null,
        baseValuationUnavailable: anyBaseValuationUnavailable,
      },
      holdings: holdingsWithBase,
      closedPositions: portfolio.closedPositions.map(toHolding),
      trades: trades.map((trade) => ({ id: trade.id, userId: trade.userId, instrumentId: trade.instrumentId, ticker: trade.instrument.ticker, type: trade.type, units: Number(trade.units), priceMinor: Number(trade.priceMinor), feeMinor: Number(trade.feeMinor), occurredOn: trade.occurredOn.toISOString().slice(0, 10), cashAccountId: trade.cashAccountId, note: trade.note, idempotencyKey: trade.idempotencyKey, createdAt: trade.createdAt.toISOString() })),
      dividends: dividends.map((dividend) => ({ ...dividend, amountMinor: Number(dividend.amountMinor), occurredOn: dividend.occurredOn.toISOString().slice(0, 10) })),
    }
  })
  app.post('/investments/trades', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const input = tradeSchema.parse(request.body)
    const userId = request.user!.id
    const existing = input.idempotencyKey ? await options.prisma.investmentTrade.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey }, include: { instrument: true } }) : null
    // feeMinor is a BigInt column — must be converted like the 201 response
    // below, or a duplicate submission (the very case this branch exists to
    // handle) 500s on `JSON.stringify` instead of returning the cached trade.
    if (existing) return reply.code(200).send({ ...existing, units: Number(existing.units), priceMinor: Number(existing.priceMinor), feeMinor: Number(existing.feeMinor), occurredOn: existing.occurredOn.toISOString().slice(0, 10) })
    // An instrument's ticker->identity mapping is fixed once created: a
    // trade against an existing ticker never changes its name/assetClass/
    // sector (previously it always did via the upsert's `update` clause,
    // silently reclassifying every past and future trade under that ticker
    // whenever a later submission carried different metadata — e.g. a typo'd
    // sector, or the same ticker symbol legitimately meaning a different
    // instrument). A mismatch is now rejected instead of applied, so the
    // caller finds out rather than the classification silently drifting.
    const existingInstrument = await options.prisma.instrument.findUnique({ where: { userId_ticker: { userId, ticker: input.ticker } } })
    if (existingInstrument && (existingInstrument.name !== input.name || existingInstrument.assetClass !== input.assetClass || existingInstrument.sector !== input.sector)) {
      return reply.code(409).send({
        error: {
          code: 'INSTRUMENT_METADATA_MISMATCH',
          message: `Ticker ${input.ticker} is already logged as ${existingInstrument.name} (${existingInstrument.assetClass}, ${existingInstrument.sector}). Use the same details, or a different ticker for a different instrument.`,
          field: 'ticker',
          requestId: request.id,
        },
      })
    }
    const instrument = existingInstrument ?? await options.prisma.instrument.create({ data: { userId, ticker: input.ticker, name: input.name, assetClass: input.assetClass, assetType: toInstrumentAssetType(input.assetClass), sector: input.sector } })
    const previous = await options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: instrument.id }, select: { type: true, units: true } })
    const heldUnits = previous.reduce((sum, trade) => sum.plus(trade.type === 'buy' ? new Prisma.Decimal(trade.units.toString()) : new Prisma.Decimal(trade.units.toString()).negated()), new Prisma.Decimal(0))
    const inputUnits = new Prisma.Decimal(input.units.toString())
    if (input.type === 'sell' && inputUnits.greaterThan(heldUnits)) return reply.code(422).send({ error: { code: 'INVESTMENT_OVERSELL', message: 'Sell quantity exceeds current units.', field: 'units', requestId: request.id } })
    const feeMinor = input.feeMinor ?? 0
    // Decimal multiplication before the single final rounding — never a
    // Number*Number chain (QA Attempt 1, Defect 2). The cash that actually
    // moves includes the fee: a buy costs gross + fee, a sell nets gross - fee
    // (plan §26 — fees are never tracked as a separate ordinary expense).
    const grossAmount = inputUnits.times(input.priceMinor)
    const cashAmount = (input.type === 'buy' ? grossAmount.plus(feeMinor) : grossAmount.minus(feeMinor)).round().toNumber()
    // Plan §14: buying/selling an investment is an asset transfer between
    // cash and the (ledger-external) investment position, not ordinary
    // spending or income — posting it as 'transfer' keeps it out of expense/
    // income reports while still moving the cash account balance. Only one
    // side of the transfer is a `financial_accounts` row (see the ledger
    // repository's debit-only/credit-only half-transfer handling).
    // The trade's priceMinor is entered in the user's base currency (see the
    // §13 comment on GET /investments above — cost basis has no per-trade
    // currencyCode yet and is always treated as base-currency), so the cash
    // that actually moves is base-currency too. Use the user's real base
    // currency rather than a hardcoded 'PHP', which posted a wrong
    // currencyCode for any non-PHP account.
    // A cash-linked trade must always carry an idempotency key shared with
    // its ledger transaction — it's the only way DELETE/edit can later find
    // the matching transaction to reverse. If the caller didn't supply one,
    // generate it server-side rather than leaving both rows keyless (which
    // made that later lookup permanently unable to find a match — see
    // TRADE_CASH_LINK_UNRESOLVED below).
    const linkKey = input.cashAccountId ? (input.idempotencyKey ?? randomUUID()) : (input.idempotencyKey ?? null)
    const ledgerInput = input.cashAccountId ? { type: 'transfer' as const, title: `${input.type === 'buy' ? 'Investment buy' : 'Investment sell'} · ${input.ticker}`, categoryId: null, goalId: null, fromAccountId: input.type === 'buy' ? input.cashAccountId : null, toAccountId: input.type === 'sell' ? input.cashAccountId : null, occurredOn: input.occurredOn, occurredTime: null, amountMinor: cashAmount, feeMinor: 0, currencyCode: request.user!.baseCurrency, source: 'manual' as const, status: 'cleared' as const, note: input.note ?? null, idempotencyKey: linkKey } : null
    const createTrade = async (tx: any) => tx.investmentTrade.create({ data: { userId, instrumentId: instrument.id, type: input.type, units: input.units, priceMinor: BigInt(input.priceMinor), feeMinor: BigInt(feeMinor), occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), cashAccountId: input.cashAccountId ?? null, note: input.note ?? null, idempotencyKey: linkKey }, include: { instrument: true } })
    const trade = ledgerInput ? await options.ledgerService.postTransactionWithCallback(userId, ledgerInput, async (tx) => createTrade(tx)) : await createTrade(options.prisma)
    return reply.code(201).send({ ...trade, units: Number(trade.units), priceMinor: Number(trade.priceMinor), feeMinor: Number(trade.feeMinor), occurredOn: trade.occurredOn.toISOString().slice(0, 10) })
  })
  app.patch<{ Params: { id: string } }>('/investments/trades/:id', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const { id } = tradeIdParamSchema.parse(request.params)
    const input = updateTradeSchema.parse(request.body)
    const userId = request.user!.id
    const existing = await options.prisma.investmentTrade.findFirst({ where: { id, userId }, include: { instrument: true } })
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Trade not found.', requestId: request.id } })
    // Recompute the instrument's net held units as if this trade did not
    // exist, then re-apply the edited version — same guard as trade
    // creation, so an edit can't push a sell past what would remain held.
    const siblings = await options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: existing.instrumentId, id: { not: id } }, select: { type: true, units: true } })
    const heldWithoutThis = siblings.reduce((sum, trade) => sum.plus(trade.type === 'buy' ? new Prisma.Decimal(trade.units.toString()) : new Prisma.Decimal(trade.units.toString()).negated()), new Prisma.Decimal(0))
    const editedUnits = new Prisma.Decimal(input.units.toString())
    if (input.type === 'sell' && editedUnits.greaterThan(heldWithoutThis)) return reply.code(422).send({ error: { code: 'INVESTMENT_OVERSELL', message: 'Sell quantity exceeds current units.', field: 'units', requestId: request.id } })
    // Trades created via the app never carry a cashAccountId (the gateway
    // always sends null), so there is no linked ledger transaction to keep
    // in sync for the normal edit flow. Defensively refuse editing the rare
    // trade that does have one, rather than silently letting the cash
    // account balance drift out of sync with the trade record.
    if (existing.cashAccountId) return reply.code(409).send({ error: { code: 'TRADE_HAS_LINKED_TRANSACTION', message: 'Cannot edit a trade linked to a cash account transaction.', requestId: request.id } })
    const updated = await options.prisma.investmentTrade.update({ where: { id }, data: { type: input.type, units: input.units, priceMinor: BigInt(input.priceMinor), feeMinor: input.feeMinor !== undefined ? BigInt(input.feeMinor) : existing.feeMinor, occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), note: input.note ?? null }, include: { instrument: true } })
    return reply.send({ ...updated, units: Number(updated.units), priceMinor: Number(updated.priceMinor), feeMinor: Number(updated.feeMinor), occurredOn: updated.occurredOn.toISOString().slice(0, 10) })
  })
  app.delete<{ Params: { id: string } }>('/investments/trades/:id', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const { id } = tradeIdParamSchema.parse(request.params)
    const userId = request.user!.id
    const existing = await options.prisma.investmentTrade.findFirst({ where: { id, userId } })
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Trade not found.', requestId: request.id } })
    if (existing.cashAccountId) {
      // Undo the linked cash-account transaction (matched by the shared
      // idempotency key) via the existing reversal pattern before removing
      // the trade, so the account balance doesn't drift. If the trade is
      // marked as cash-linked but the matching transaction can't be found
      // (no idempotencyKey, already reversed, or deleted out-of-band), that
      // is a real data-integrity problem — refuse to delete the trade rather
      // than silently proceeding and leaving the cash balance permanently
      // wrong with no record of why.
      let linked = existing.idempotencyKey ? await options.prisma.transaction.findFirst({ where: { userId, idempotencyKey: existing.idempotencyKey, reversedTransactionId: null } }) : null
      // Legacy fallback: trades created before the idempotency-key generation
      // fix above have `idempotencyKey: null` on both the trade and its
      // paired transaction, so the direct lookup above can never match them —
      // permanently blocking delete with no way to resolve it. Recover the
      // link by matching on the same shape the create route used to post it
      // (account side, amount, date, transfer type). Only act on an
      // unambiguous single match; multiple candidates fall through to the
      // safe refusal below rather than risk reversing the wrong transaction.
      if (!linked && !existing.idempotencyKey) {
        const grossAmount = new Prisma.Decimal(existing.units.toString()).times(existing.priceMinor.toString())
        const cashAmount = (existing.type === 'buy' ? grossAmount.plus(existing.feeMinor.toString()) : grossAmount.minus(existing.feeMinor.toString())).round().toNumber()
        const candidates = await options.prisma.transaction.findMany({
          where: {
            userId,
            reversedTransactionId: null,
            idempotencyKey: null,
            type: 'transfer',
            amountMinor: cashAmount,
            occurredOn: existing.occurredOn,
            ...(existing.type === 'buy' ? { fromAccountId: existing.cashAccountId } : { toAccountId: existing.cashAccountId }),
          },
        })
        if (candidates.length === 1) linked = candidates[0]!
      }
      if (!linked) {
        request.log.error({ tradeId: id, userId, idempotencyKey: existing.idempotencyKey }, 'investment trade delete: cash-linked trade has no matching unreversed transaction to reverse')
        return reply.code(409).send({
          error: {
            code: 'TRADE_CASH_LINK_UNRESOLVED',
            message: 'This trade moved cash but the matching transaction could not be found or was already reversed. Resolve the cash-account transaction manually before deleting this trade.',
            requestId: request.id,
          },
        })
      }
      await options.ledgerService.reverseTransaction(userId, linked.id, {})
    }
    await options.prisma.investmentTrade.delete({ where: { id } })
    return reply.code(204).send()
  })
  app.post('/investments/dividends', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const input = dividendSchema.parse(request.body)
    const instrument = await options.prisma.instrument.findFirst({ where: { userId: request.user!.id, ticker: input.ticker } })
    if (!instrument) return reply.code(422).send({ error: { code: 'UNKNOWN_INSTRUMENT', message: 'Instrument not found.', field: 'ticker', requestId: request.id } })
    const createDividend = async (tx: any) => tx.dividend.create({ data: { userId: request.user!.id, instrumentId: instrument.id, amountMinor: BigInt(input.amountMinor), occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), note: input.note ?? null } })
    const dividend = input.cashAccountId
      ? await options.ledgerService.postTransactionWithCallback(request.user!.id, { type: 'income', title: `Dividend · ${input.ticker}`, categoryId: null, goalId: null, fromAccountId: null, toAccountId: input.cashAccountId, occurredOn: input.occurredOn, occurredTime: null, amountMinor: input.amountMinor, feeMinor: 0, currencyCode: request.user!.baseCurrency, source: 'manual', status: 'cleared', note: input.note ?? null }, async (tx) => createDividend(tx))
      : await createDividend(options.prisma)
    return reply.code(201).send({ ...dividend, amountMinor: Number(dividend.amountMinor), occurredOn: dividend.occurredOn.toISOString().slice(0, 10) })
  })
  // Plan §10/§18: on-demand refresh, scoped to only this user's instruments
  // (never every instrument in the table — that would leak cross-user quota
  // usage and cost). Never fatal to the caller: a provider/quota failure is
  // reported as `refreshed: 0` with the specific instruments left stale
  // rather than a 5xx, since GET /investments already tolerates stale quotes.
  app.post('/investments/quotes/refresh', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const userId = request.user!.id
    const last = lastManualRefreshAt.get(userId)
    if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
      return reply.code(429).send({ error: { code: 'QUOTE_REFRESH_COOLDOWN', message: 'Prices were just refreshed. Try again shortly.', requestId: request.id } })
    }
    lastManualRefreshAt.set(userId, Date.now())
    if (!options.quoteProvider) return reply.send({ refreshed: 0, checked: 0 })
    const instruments = await options.prisma.instrument.findMany({ where: { userId }, select: { id: true, ticker: true } })
    if (instruments.length === 0) return reply.send({ refreshed: 0, checked: 0 })
    let quotes: Map<string, { priceMinor: number; source: string; currencyCode?: string; change24hPct?: number }>
    try {
      quotes = await options.quoteProvider.getQuotes(instruments.map((instrument) => instrument.ticker), request.user!.baseCurrency.toLowerCase())
    } catch (err) {
      request.log.warn({ err }, 'manual quote refresh: provider call failed')
      return reply.send({ refreshed: 0, checked: instruments.length, error: 'QUOTE_PROVIDER_UNAVAILABLE' })
    }
    const now = new Date()
    let refreshed = 0
    for (const instrument of instruments) {
      const quote = quotes.get(instrument.ticker.toUpperCase())
      if (!quote) continue
      // Bug: this endpoint never carried the 24h-change fields into the new
      // snapshot row (only the background worker's refreshQuoteSnapshots did)
      // — every manual "Refresh prices" click wrote change24hPct/Minor as
      // null, so the very next GET /investments read that newest-but-blank
      // snapshot and Today's Change dropped to ₱0.00 / 0.00% until the next
      // scheduled worker cycle overwrote it again. Same derivation as there:
      // pct = (current-old)/old*100 => old = current/(1+pct/100).
      const change24hMinor = quote.change24hPct != null && Number.isFinite(quote.change24hPct)
        ? Math.round(quote.priceMinor * quote.change24hPct / (100 + quote.change24hPct))
        : null
      await options.prisma.quoteSnapshot.create({
        data: {
          instrumentId: instrument.id,
          source: quote.source,
          priceMinor: BigInt(quote.priceMinor),
          currencyCode: quote.currencyCode ?? 'USD',
          fetchedAt: now,
          change24hPct: quote.change24hPct ?? null,
          change24hMinor: change24hMinor != null ? BigInt(change24hMinor) : null,
        },
      })
      refreshed += 1
    }
    return reply.send({ refreshed, checked: instruments.length })
  })
}
