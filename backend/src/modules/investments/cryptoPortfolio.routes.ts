import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import type { LedgerService } from '../ledger/ledger.service.js'
import { calculateCryptoLocationBalances, calculateCryptoPosition, CryptoInsufficientUnitsError, CryptoLocationInsufficientUnitsError, CryptoTransferSameLocationError } from './cryptoPortfolioAccounting.js'
import { CoinGeckoCryptoCatalog, CryptoProviderUnavailableError, type CryptoHistoryRange } from './cryptoCatalog.js'

const searchQuery = z.object({ q: z.string().trim().max(120).default('') })
const coinInput = z.object({ providerAssetId: z.string().trim().min(1).max(160) })
const locationInput = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(['exchange', 'wallet', 'other']) })
const transferInput = z.object({ instrumentId: z.string().uuid(), fromLocationId: z.string().uuid(), toLocationId: z.string().uuid(), units: z.string().regex(/^\d+(?:\.\d{1,18})?$/), networkFeeUnits: z.string().regex(/^\d+(?:\.\d{1,18})?$/).default('0'), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), occurredTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), note: z.string().max(500).nullable().optional(), idempotencyKey: z.string().max(128).nullable().optional() })
const tradeInput = z.object({ instrumentId: z.string().uuid(), type: z.enum(['buy', 'sell']), units: z.string().regex(/^\d+(?:\.\d{1,18})?$/), priceAmount: z.string().regex(/^\d+(?:\.\d{1,18})?$/), feeAmount: z.string().regex(/^\d+(?:\.\d{1,18})?$/).default('0'), currencyCode: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()), fxRateToBase: z.string().regex(/^\d+(?:\.\d{1,10})?$/).nullable().optional(), locationId: z.string().uuid(), cashAccountId: z.string().uuid().nullable().optional(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), occurredTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), note: z.string().max(500).nullable().optional(), idempotencyKey: z.string().max(128).nullable().optional() })
const activityQuery = z.object({ type: z.enum(['all', 'buy', 'sell', 'transfer']).default('all'), q: z.string().trim().max(120).default(''), instrumentId: z.string().uuid().optional() })
const historyQuery = z.object({ range: z.enum(['1d', '7d', '1m', '3m', '1y', 'all']).default('1m') })
const coinIdParam = z.object({ id: z.string().uuid() })
const decimalJson = { type: 'string', pattern: '^-?\\d+(?:\\.\\d+)?$' } as const
const nullable = <T>(schema: T) => ({ anyOf: [schema, { type: 'null' }] } as const)
const errorJson = { type: 'object', additionalProperties: false, required: ['error'], properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: { code: { type: 'string' }, message: { type: 'string' }, field: { type: 'string' }, requestId: { type: 'string' } } } } } as const
const uuidParamsJson = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } as const
const searchQueryJson = { type: 'object', additionalProperties: false, properties: { q: { type: 'string', maxLength: 120, default: '' } } } as const
const historyQueryJson = { type: 'object', additionalProperties: false, properties: { range: { type: 'string', enum: ['1d', '7d', '1m', '3m', '1y', 'all'], default: '1m' } } } as const
const activityQueryJson = { type: 'object', additionalProperties: false, properties: { type: { type: 'string', enum: ['all', 'buy', 'sell', 'transfer'], default: 'all' }, q: { type: 'string', maxLength: 120, default: '' }, instrumentId: { type: 'string', format: 'uuid' } } } as const
const catalogCoinJson = { type: 'object', additionalProperties: false, required: ['providerAssetId', 'symbol', 'name', 'imageUrl', 'marketCapRank'], properties: { providerAssetId: { type: 'string' }, symbol: { type: 'string' }, name: { type: 'string' }, imageUrl: nullable({ type: 'string' }), marketCapRank: nullable({ type: 'number' }) } } as const
const searchResponseJson = { type: 'object', additionalProperties: false, required: ['coins'], properties: { coins: { type: 'array', items: catalogCoinJson } } } as const
const locationJson = { type: 'object', additionalProperties: false, required: ['id', 'userId', 'name', 'type', 'active', 'createdAt', 'updatedAt'], properties: { id: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, type: { type: 'string', enum: ['exchange', 'wallet', 'other'] }, active: { type: 'boolean' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } } as const
const locationsResponseJson = { type: 'object', additionalProperties: false, required: ['locations'], properties: { locations: { type: 'array', items: locationJson } } } as const
const holdingJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'providerAssetId', 'symbol', 'name', 'tracked', 'quantity', 'currentPrice', 'marketValue', 'averageCost', 'costBasis', 'realizedPnl', 'unrealizedPnl', 'totalPnl', 'change1hPct', 'change24hPct', 'change7dPct', 'imageUrl', 'marketCapRank', 'quoteFetchedAt', 'quoteStale', 'marketDataLinkRequired', 'allocationPct', 'totalPnlPct'], properties: { instrumentId: { type: 'string', format: 'uuid' }, providerAssetId: nullable({ type: 'string' }), symbol: { type: 'string' }, name: { type: 'string' }, tracked: { type: 'boolean' }, quantity: decimalJson, currentPrice: nullable(decimalJson), marketValue: nullable(decimalJson), averageCost: decimalJson, costBasis: decimalJson, realizedPnl: decimalJson, unrealizedPnl: nullable(decimalJson), totalPnl: nullable(decimalJson), change1hPct: nullable({ type: 'number' }), change24hPct: nullable({ type: 'number' }), change7dPct: nullable({ type: 'number' }), imageUrl: nullable({ type: 'string' }), marketCapRank: nullable({ type: 'number' }), quoteFetchedAt: nullable({ type: 'string', format: 'date-time' }), quoteStale: { type: 'boolean' }, marketDataLinkRequired: { type: 'boolean' }, allocationPct: decimalJson, totalPnlPct: nullable(decimalJson) } } as const
const portfolioResponseJson = { type: 'object', additionalProperties: false, required: ['baseCurrency', 'summary', 'coins'], properties: { baseCurrency: { type: 'string', minLength: 3, maxLength: 3 }, summary: { type: 'object', additionalProperties: false, required: ['portfolioValue', 'change24h', 'change24hPct', 'costBasis', 'realizedPnl', 'unrealizedPnl', 'totalPnl', 'totalPnlPct'], properties: { portfolioValue: decimalJson, change24h: decimalJson, change24hPct: nullable(decimalJson), costBasis: decimalJson, realizedPnl: decimalJson, unrealizedPnl: decimalJson, totalPnl: decimalJson, totalPnlPct: nullable(decimalJson) } }, coins: { type: 'array', items: holdingJson } } } as const
// A provider outage must only take away provider-dependent fields (current
// price, market value, 24h change, market cap). Locally-known accounting —
// quantity, cost basis, average cost, realized P&L — never depends on
// CoinGecko and must keep showing (§15 provider degradation).
const stalePortfolioResponseJson = { type: 'object', additionalProperties: false, required: ['baseCurrency', 'coins', 'marketStatus'], properties: { baseCurrency: { type: 'string', minLength: 3, maxLength: 3 }, coins: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['instrumentId', 'providerAssetId', 'symbol', 'name', 'tracked', 'quantity', 'averageCost', 'costBasis', 'realizedPnl', 'market', 'marketDataLinkRequired'], properties: { instrumentId: { type: 'string', format: 'uuid' }, providerAssetId: nullable({ type: 'string' }), symbol: { type: 'string' }, name: { type: 'string' }, tracked: { type: 'boolean' }, quantity: decimalJson, averageCost: decimalJson, costBasis: decimalJson, realizedPnl: decimalJson, market: { type: 'null' }, marketDataLinkRequired: { type: 'boolean' } } } }, marketStatus: { type: 'object', additionalProperties: false, required: ['stale', 'code'], properties: { stale: { const: true }, code: { const: 'CRYPTO_PROVIDER_UNAVAILABLE' } } } } } as const
const historyResponseJson = { type: 'object', additionalProperties: false, required: ['baseCurrency', 'points'], properties: { baseCurrency: { type: 'string', minLength: 3, maxLength: 3 }, points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['timestamp', 'valueAmount'], properties: { timestamp: { type: 'string', format: 'date-time' }, valueAmount: decimalJson } } } } } as const
const tradeActivityJson = { type: 'object', additionalProperties: false, required: ['id', 'type', 'instrumentId', 'symbol', 'name', 'units', 'priceAmount', 'feeAmount', 'currencyCode', 'location', 'occurredOn', 'occurredTime', 'note', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['buy', 'sell'] }, instrumentId: { type: 'string', format: 'uuid' }, symbol: { type: 'string' }, name: { type: 'string' }, units: decimalJson, priceAmount: decimalJson, feeAmount: decimalJson, currencyCode: { type: 'string' }, location: nullable({ type: 'string' }), occurredOn: { type: 'string', format: 'date' }, occurredTime: nullable({ type: 'string', pattern: '^\\d{2}:\\d{2}$' }), note: nullable({ type: 'string' }), createdAt: { type: 'string', format: 'date-time' } } } as const
const transferActivityJson = { type: 'object', additionalProperties: false, required: ['id', 'type', 'instrumentId', 'symbol', 'name', 'units', 'networkFeeUnits', 'fromLocation', 'toLocation', 'occurredOn', 'occurredTime', 'note', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, type: { const: 'transfer' }, instrumentId: { type: 'string', format: 'uuid' }, symbol: { type: 'string' }, name: { type: 'string' }, units: decimalJson, networkFeeUnits: decimalJson, fromLocation: { type: 'string' }, toLocation: { type: 'string' }, occurredOn: { type: 'string', format: 'date' }, occurredTime: nullable({ type: 'string', pattern: '^\\d{2}:\\d{2}$' }), note: nullable({ type: 'string' }), createdAt: { type: 'string', format: 'date-time' } } } as const
const activitiesResponseJson = { type: 'object', additionalProperties: false, required: ['activities'], properties: { activities: { type: 'array', items: { oneOf: [tradeActivityJson, transferActivityJson] } } } } as const
const coinBodyJson = { type: 'object', additionalProperties: false, required: ['providerAssetId'], properties: { providerAssetId: { type: 'string', minLength: 1, maxLength: 160 } } } as const
const locationBodyJson = { type: 'object', additionalProperties: false, required: ['name', 'type'], properties: { name: { type: 'string', minLength: 1, maxLength: 120 }, type: { type: 'string', enum: ['exchange', 'wallet', 'other'] } } } as const
const nullableUuidJson = nullable({ type: 'string', format: 'uuid' })
const decimalInputJson = { type: 'string', pattern: '^\\d+(?:\\.\\d{1,18})?$' } as const
const tradeBodyJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'type', 'units', 'priceAmount', 'locationId', 'occurredOn'], properties: { instrumentId: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['buy', 'sell'] }, units: decimalInputJson, priceAmount: decimalInputJson, feeAmount: decimalInputJson, currencyCode: { type: 'string', pattern: '^[A-Za-z]{3}$' }, fxRateToBase: nullable({ type: 'string', pattern: '^\\d+(?:\\.\\d{1,10})?$' }), locationId: { type: 'string', format: 'uuid' }, cashAccountId: nullableUuidJson, occurredOn: { type: 'string', format: 'date' }, occurredTime: nullable({ type: 'string', pattern: '^\\d{2}:\\d{2}$' }), note: nullable({ type: 'string', maxLength: 500 }), idempotencyKey: nullable({ type: 'string', maxLength: 128 }) } } as const
const transferBodyJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'fromLocationId', 'toLocationId', 'units', 'occurredOn'], properties: { instrumentId: { type: 'string', format: 'uuid' }, fromLocationId: { type: 'string', format: 'uuid' }, toLocationId: { type: 'string', format: 'uuid' }, units: decimalInputJson, networkFeeUnits: decimalInputJson, occurredOn: { type: 'string', format: 'date' }, occurredTime: nullable({ type: 'string', pattern: '^\\d{2}:\\d{2}$' }), note: nullable({ type: 'string', maxLength: 500 }), idempotencyKey: nullable({ type: 'string', maxLength: 128 }) } } as const
const trackedCoinJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'providerAssetId', 'symbol', 'name', 'tracked'], properties: { instrumentId: { type: 'string', format: 'uuid' }, providerAssetId: nullable({ type: 'string' }), symbol: { type: 'string' }, name: { type: 'string' }, tracked: { type: 'boolean' } } } as const
const tradeJson = { type: 'object', additionalProperties: false, required: ['id', 'instrumentId', 'type', 'units', 'priceAmount', 'feeAmount', 'currencyCode', 'fxRateToBase', 'locationId', 'cashAccountId', 'occurredOn', 'occurredTime', 'note', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, instrumentId: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['buy', 'sell'] }, units: decimalJson, priceAmount: decimalJson, feeAmount: decimalJson, currencyCode: { type: 'string' }, fxRateToBase: nullable(decimalJson), locationId: nullableUuidJson, cashAccountId: nullableUuidJson, occurredOn: { type: 'string', format: 'date' }, occurredTime: nullable({ type: 'string', pattern: '^\\d{2}:\\d{2}$' }), note: nullable({ type: 'string' }), createdAt: { type: 'string', format: 'date-time' } } } as const
const transferJson = { type: 'object', additionalProperties: false, required: ['id', 'instrumentId', 'fromLocationId', 'toLocationId', 'units', 'networkFeeUnits', 'occurredOn', 'occurredTime', 'note', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, instrumentId: { type: 'string', format: 'uuid' }, fromLocationId: { type: 'string', format: 'uuid' }, toLocationId: { type: 'string', format: 'uuid' }, units: decimalJson, networkFeeUnits: decimalJson, occurredOn: { type: 'string', format: 'date' }, occurredTime: nullable({ type: 'string', pattern: '^\\d{2}:\\d{2}$' }), note: nullable({ type: 'string' }), createdAt: { type: 'string', format: 'date-time' } } } as const
const tradePrefillJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'type', 'units', 'priceAmount', 'feeAmount', 'currencyCode', 'fxRateToBase', 'locationId', 'cashAccountId', 'occurredOn', 'occurredTime', 'note', 'createdAt'], properties: tradeJson.properties } as const
const transferPrefillJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'fromLocationId', 'toLocationId', 'units', 'networkFeeUnits', 'occurredOn', 'occurredTime', 'note', 'createdAt'], properties: transferJson.properties } as const
const coinDetailJson = { type: 'object', additionalProperties: false, required: ['coin'], properties: { coin: { type: 'object', additionalProperties: false, required: ['instrumentId', 'symbol', 'name', 'whereHeld'], properties: { instrumentId: { type: 'string', format: 'uuid' }, symbol: { type: 'string' }, name: { type: 'string' }, whereHeld: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['locationId', 'name', 'type', 'units'], properties: { locationId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, type: { type: 'string', enum: ['exchange', 'wallet', 'other'] }, units: decimalJson } } } } } } } as const
const coinHistoryJson = { type: 'object', additionalProperties: false, required: ['instrumentId', 'providerAssetId', 'baseCurrency', 'points'], properties: { instrumentId: { type: 'string', format: 'uuid' }, providerAssetId: { type: 'string' }, baseCurrency: { type: 'string' }, points: historyResponseJson.properties.points } } as const

function time(value: string | null | undefined): Date | null { return value ? new Date(`1970-01-01T${value}:00Z`) : null }
function eventTime(date: Date, occurredTime: Date | null): Date { return new Date(`${date.toISOString().slice(0, 10)}T${occurredTime ? occurredTime.toISOString().slice(11, 19) : '00:00:00'}Z`) }

export async function cryptoPortfolioRoutes(app: FastifyInstance, options: { prisma: PrismaClient; appOrigin: string; catalog: CoinGeckoCryptoCatalog; ledgerService: LedgerService }) {
  const requireAuth = authGuard({ prisma: options.prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: options.appOrigin })

  app.get('/crypto/search', { preValidation: requireAuth, schema: { querystring: searchQueryJson, response: { 200: searchResponseJson, 503: errorJson } } }, async (request, reply) => {
    const { q } = searchQuery.parse(request.query)
    try { return { coins: await options.catalog.searchCoins(q) } }
    catch (error) { if (error instanceof CryptoProviderUnavailableError) return reply.code(503).send({ error: { code: error.code, message: error.message, requestId: request.id } }); throw error }
  })

  app.get('/crypto', { preValidation: requireAuth, schema: { response: { 200: { oneOf: [portfolioResponseJson, stalePortfolioResponseJson] } } } }, async (request, reply) => {
    const instruments = await options.prisma.instrument.findMany({ where: { userId: request.user!.id, assetType: 'crypto', tracked: true }, orderBy: { ticker: 'asc' } })
    const [trades, transfers] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId: request.user!.id, instrumentId: { in: instruments.map((instrument) => instrument.id) } } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId: request.user!.id, instrumentId: { in: instruments.map((instrument) => instrument.id) } } }),
    ])
    const ids = instruments.flatMap((instrument) => instrument.providerAssetId ? [instrument.providerAssetId] : [])
    try {
      const markets = await options.catalog.getMarkets(ids, request.user!.baseCurrency)
      const marketById = new Map(markets.map((market) => [market.providerAssetId, market]))
      const holdings = instruments.map((instrument) => {
        const position = positionFor(instrument.id, trades, transfers, request.user!.baseCurrency)
        const market = instrument.providerAssetId ? marketById.get(instrument.providerAssetId) ?? null : null
        const currentPrice = market?.currentPrice ? new Prisma.Decimal(market.currentPrice) : null
        const marketValue = currentPrice ? currentPrice.times(position.units) : null
        const unrealizedPnl = marketValue ? marketValue.minus(position.costBasisBase) : null
        // totalInvestedBase (lifetime buy cost, never reduced by sells) is
        // the denominator for total-return %; it is stripped from the coin
        // response below and used only to compute totalPnlPct correctly.
        return { instrumentId: instrument.id, providerAssetId: instrument.providerAssetId, symbol: instrument.ticker, name: instrument.name, tracked: instrument.tracked, quantity: position.units.toString(), currentPrice: currentPrice?.toString() ?? null, marketValue: marketValue?.toString() ?? null, averageCost: position.averageCostBase.toString(), costBasis: position.costBasisBase.toString(), totalInvestedBase: position.totalInvestedBase.toString(), realizedPnl: position.realizedPnlBase.toString(), unrealizedPnl: unrealizedPnl?.toString() ?? null, totalPnl: unrealizedPnl ? unrealizedPnl.plus(position.realizedPnlBase).toString() : null, change1hPct: market?.change1hPct ?? null, change24hPct: market?.change24hPct ?? null, change7dPct: market?.change7dPct ?? null, imageUrl: market?.imageUrl ?? null, marketCapRank: market?.marketCapRank ?? null, quoteFetchedAt: market?.fetchedAt ?? null, quoteStale: !market, marketDataLinkRequired: instrument.providerAssetId === null }
      })
      const portfolioValue = holdings.reduce((sum, holding) => sum.plus(holding.marketValue ?? 0), new Prisma.Decimal(0))
      const totalCostBasis = holdings.reduce((sum, holding) => sum.plus(holding.costBasis), new Prisma.Decimal(0))
      // Lifetime invested cost is the correct denominator for total-return %:
      // `totalCostBasis` (remaining, open-position cost) goes to zero for a
      // fully-closed coin, which would hide a real realized gain/loss behind
      // a null percentage.
      const totalInvested = holdings.reduce((sum, holding) => sum.plus(holding.totalInvestedBase), new Prisma.Decimal(0))
      const realizedPnl = holdings.reduce((sum, holding) => sum.plus(holding.realizedPnl), new Prisma.Decimal(0))
      const unrealizedPnl = holdings.reduce((sum, holding) => sum.plus(holding.unrealizedPnl ?? 0), new Prisma.Decimal(0))
      // CoinGecko supplies a percentage, not an account-level quote. Revalue
      // today's holdings at the implied price 24 hours ago; cash flows remain
      // separate from this market-movement indicator.
      const value24hAgo = holdings.reduce((sum, holding) => {
        if (!holding.marketValue || holding.change24hPct === null) return sum
        const divisor = new Prisma.Decimal(1).plus(new Prisma.Decimal(holding.change24hPct).dividedBy(100))
        return divisor.isZero() ? sum : sum.plus(new Prisma.Decimal(holding.marketValue).dividedBy(divisor))
      }, new Prisma.Decimal(0))
      const valuedFor24hChange = holdings.filter((holding) => holding.marketValue && holding.change24hPct !== null).reduce((sum, holding) => sum.plus(holding.marketValue!), new Prisma.Decimal(0))
      const change24h = valuedFor24hChange.minus(value24hAgo)
      const coins = holdings.map(({ totalInvestedBase, ...holding }) => ({ ...holding, allocationPct: holding.marketValue && !portfolioValue.isZero() ? new Prisma.Decimal(holding.marketValue).dividedBy(portfolioValue).times(100).toString() : '0', totalPnlPct: !new Prisma.Decimal(totalInvestedBase).isZero() && holding.totalPnl ? new Prisma.Decimal(holding.totalPnl).dividedBy(totalInvestedBase).times(100).toString() : null }))
      return {
        baseCurrency: request.user!.baseCurrency,
        summary: { portfolioValue: portfolioValue.toString(), change24h: change24h.toString(), change24hPct: !value24hAgo.isZero() ? change24h.dividedBy(value24hAgo).times(100).toString() : null, costBasis: totalCostBasis.toString(), realizedPnl: realizedPnl.toString(), unrealizedPnl: unrealizedPnl.toString(), totalPnl: realizedPnl.plus(unrealizedPnl).toString(), totalPnlPct: !totalInvested.isZero() ? realizedPnl.plus(unrealizedPnl).dividedBy(totalInvested).times(100).toString() : null },
        coins,
      }
    } catch (error) {
      if (error instanceof CryptoProviderUnavailableError) return {
        baseCurrency: request.user!.baseCurrency,
        // A provider outage only removes provider-dependent fields (price,
        // market value, 24h change). Quantity/cost basis/realized P&L are
        // derived purely from local trades/transfers and must still show.
        coins: instruments.map((instrument) => {
          const position = positionFor(instrument.id, trades, transfers, request.user!.baseCurrency)
          return { instrumentId: instrument.id, providerAssetId: instrument.providerAssetId, symbol: instrument.ticker, name: instrument.name, tracked: instrument.tracked, quantity: position.units.toString(), averageCost: position.averageCostBase.toString(), costBasis: position.costBasisBase.toString(), realizedPnl: position.realizedPnlBase.toString(), market: null, marketDataLinkRequired: instrument.providerAssetId === null }
        }),
        marketStatus: { stale: true, code: error.code },
      }
      throw error
    }
  })

  app.post('/crypto/coins', { preValidation: [requireOrigin, requireAuth], schema: { body: coinBodyJson, response: { 201: { type: 'object', additionalProperties: false, required: ['coin'], properties: { coin: trackedCoinJson } }, 404: errorJson, 409: errorJson, 503: errorJson } } }, async (request, reply) => {
    const { providerAssetId } = coinInput.parse(request.body)
    const userId = request.user!.id
    let market
    try { market = (await options.catalog.getMarkets([providerAssetId], request.user!.baseCurrency))[0] }
    catch (error) { if (error instanceof CryptoProviderUnavailableError) return reply.code(503).send({ error: { code: error.code, message: error.message, requestId: request.id } }); throw error }
    if (!market) return reply.code(404).send({ error: { code: 'CRYPTO_COIN_NOT_FOUND', message: 'CoinGecko could not find that coin.', field: 'providerAssetId', requestId: request.id } })
    const existing = await options.prisma.instrument.findFirst({ where: { userId, providerAssetId } })
    if (existing?.tracked) return reply.code(409).send({ error: { code: 'CRYPTO_COIN_ALREADY_TRACKED', message: `${existing.name} is already tracked.`, field: 'providerAssetId', requestId: request.id } })
    const instrument = existing
      ? await options.prisma.instrument.update({ where: { id: existing.id }, data: { tracked: true, ticker: market.symbol, name: market.name } })
      : await options.prisma.instrument.create({ data: { userId, providerAssetId, ticker: market.symbol, name: market.name, assetClass: 'crypto', assetType: 'crypto', baseAsset: market.symbol, quoteAsset: request.user!.baseCurrency, sector: 'Crypto' } })
    return reply.code(201).send({ coin: { instrumentId: instrument.id, providerAssetId: instrument.providerAssetId, symbol: instrument.ticker, name: instrument.name, tracked: instrument.tracked } })
  })

  // Removing a coin only changes the portfolio view. Its immutable activity
  // history remains available and is restored if the same CoinGecko id is added.
  app.delete<{ Params: { id: string } }>('/crypto/coins/:id', { preValidation: [requireOrigin, requireAuth], schema: { params: uuidParamsJson, response: { 204: { type: 'null' } } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params)
    const instrument = await options.prisma.instrument.findFirst({ where: { id, userId: request.user!.id, assetType: 'crypto' } })
    if (!instrument) return reply.code(404).send({ error: { code: 'CRYPTO_COIN_NOT_FOUND', message: 'Tracked crypto coin not found.', requestId: request.id } })
    await options.prisma.instrument.update({ where: { id }, data: { tracked: false } })
    return reply.code(204).send()
  })

  app.get('/crypto/locations', { preValidation: requireAuth, schema: { response: { 200: locationsResponseJson } } }, async (request) => ({ locations: await options.prisma.cryptoLocation.findMany({ where: { userId: request.user!.id }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }) }))

  app.get('/crypto/activities', { preValidation: requireAuth, schema: { querystring: activityQueryJson, response: { 200: activitiesResponseJson } } }, async (request) => {
    const { type, q, instrumentId } = activityQuery.parse(request.query); const userId = request.user!.id; const query = q.toLowerCase()
    const [trades, transfers] = await Promise.all([
      type === 'transfer' ? [] : options.prisma.investmentTrade.findMany({ where: { userId, instrument: { assetType: 'crypto' }, ...(instrumentId ? { instrumentId } : {}), ...(type === 'all' ? {} : { type }) }, include: { instrument: true, location: true }, orderBy: [{ occurredOn: 'desc' }, { occurredTime: 'desc' }, { createdAt: 'desc' }] }),
      type === 'buy' || type === 'sell' ? [] : options.prisma.cryptoTransfer.findMany({ where: { userId, ...(instrumentId ? { instrumentId } : {}) }, include: { instrument: true, fromLocation: true, toLocation: true }, orderBy: [{ occurredOn: 'desc' }, { occurredTime: 'desc' }, { createdAt: 'desc' }] }),
    ])
    const activities = [
      ...trades.map((trade) => ({ id: trade.id, type: trade.type, instrumentId: trade.instrumentId, symbol: trade.instrument.ticker, name: trade.instrument.name, units: trade.units.toString(), priceAmount: trade.priceAmount.toString(), feeAmount: trade.feeAmount.toString(), currencyCode: trade.currencyCode, location: trade.location?.name ?? null, occurredOn: trade.occurredOn.toISOString().slice(0, 10), occurredTime: trade.occurredTime?.toISOString().slice(11, 16) ?? null, note: trade.note, createdAt: trade.createdAt.toISOString() })),
      ...transfers.map((transfer) => ({ id: transfer.id, type: 'transfer' as const, instrumentId: transfer.instrumentId, symbol: transfer.instrument.ticker, name: transfer.instrument.name, units: transfer.units.toString(), networkFeeUnits: transfer.networkFeeUnits.toString(), fromLocation: transfer.fromLocation.name, toLocation: transfer.toLocation.name, occurredOn: transfer.occurredOn.toISOString().slice(0, 10), occurredTime: transfer.occurredTime?.toISOString().slice(11, 16) ?? null, note: transfer.note, createdAt: transfer.createdAt.toISOString() })),
    ].filter((activity) => !query || `${activity.symbol} ${activity.name} ${activity.note ?? ''}`.toLowerCase().includes(query))
      .sort((a, b) => `${b.occurredOn}T${b.occurredTime ?? '00:00'}`.localeCompare(`${a.occurredOn}T${a.occurredTime ?? '00:00'}`) || b.createdAt.localeCompare(a.createdAt))
    return { activities }
  })

  // Duplicate is intentionally a read-only prefill command. The caller must
  // submit the returned values through the normal idempotent create endpoint.
  app.post<{ Params: { id: string } }>('/crypto/trades/:id/duplicate', { preValidation: [requireOrigin, requireAuth], schema: { params: uuidParamsJson, response: { 200: { type: 'object', additionalProperties: false, required: ['trade'], properties: { trade: tradePrefillJson } }, 404: errorJson } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params)
    const trade = await options.prisma.investmentTrade.findFirst({ where: { id, userId: request.user!.id, instrument: { assetType: 'crypto' } } })
    if (!trade) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Crypto trade not found.', requestId: request.id } })
    return { trade: { ...serializeTrade(trade), id: undefined, idempotencyKey: undefined } }
  })

  app.post<{ Params: { id: string } }>('/crypto/transfers/:id/duplicate', { preValidation: [requireOrigin, requireAuth], schema: { params: uuidParamsJson, response: { 200: { type: 'object', additionalProperties: false, required: ['transfer'], properties: { transfer: transferPrefillJson } }, 404: errorJson } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params)
    const transfer = await options.prisma.cryptoTransfer.findFirst({ where: { id, userId: request.user!.id } })
    if (!transfer) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Crypto transfer not found.', requestId: request.id } })
    return { transfer: { ...serializeTransfer(transfer), id: undefined, idempotencyKey: undefined } }
  })

  app.get('/crypto/history', { preValidation: requireAuth, schema: { querystring: historyQueryJson, response: { 200: historyResponseJson, 503: errorJson } } }, async (request, reply) => {
    const { range } = historyQuery.parse(request.query); const userId = request.user!.id; const baseCurrency = request.user!.baseCurrency
    const instruments = await options.prisma.instrument.findMany({ where: { userId, assetType: 'crypto', tracked: true, providerAssetId: { not: null } } })
    if (instruments.length === 0) return { baseCurrency, points: [] }
    const [trades, transfers] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: { in: instruments.map((instrument) => instrument.id) } } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId, instrumentId: { in: instruments.map((instrument) => instrument.id) } } }),
    ])
    try {
      const histories = await Promise.all(instruments.map(async (instrument) => ({ instrument, points: await options.catalog.getHistory(instrument.providerAssetId!, baseCurrency, range as CryptoHistoryRange) })))
      const timestamps = [...new Set(histories.flatMap((history) => history.points.map((point) => point.timestamp)))].sort()
      const points = timestamps.map((timestamp) => {
        const at = new Date(timestamp); let value = new Prisma.Decimal(0)
        for (const history of histories) {
          const price = priceAt(history.points, at)
          if (!price) continue
          const position = positionFor(history.instrument.id, trades, transfers, baseCurrency, at)
          value = value.plus(position.units.times(price))
        }
        return { timestamp, valueAmount: value.toString() }
      })
      return { baseCurrency, points }
    } catch (error) { if (error instanceof CryptoProviderUnavailableError) return reply.code(503).send({ error: { code: error.code, message: error.message, requestId: request.id } }); throw error }
  })

  app.get<{ Params: { id: string } }>('/crypto/coins/:id', { preValidation: requireAuth, schema: { params: uuidParamsJson, response: { 200: coinDetailJson, 404: errorJson, 422: errorJson } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params); const userId = request.user!.id
    const instrument = await options.prisma.instrument.findFirst({ where: { id, userId, assetType: 'crypto' } })
    if (!instrument) return reply.code(404).send({ error: { code: 'CRYPTO_COIN_NOT_FOUND', message: 'Tracked crypto coin not found.', requestId: request.id } })
    const [trades, transfers, locations] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: id }, select: { id: true, type: true, locationId: true, units: true, occurredOn: true, occurredTime: true, createdAt: true } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId, instrumentId: id }, select: { id: true, fromLocationId: true, toLocationId: true, units: true, networkFeeUnits: true, occurredOn: true, occurredTime: true, createdAt: true } }),
      options.prisma.cryptoLocation.findMany({ where: { userId }, select: { id: true, name: true, type: true } }),
    ])
    try {
      const balances = calculateCryptoLocationBalances(
        trades.map((trade) => ({ id: trade.id, type: trade.type, locationId: trade.locationId, units: trade.units, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })),
        transfers.map((transfer) => ({ id: transfer.id, fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, units: transfer.units, networkFeeUnits: transfer.networkFeeUnits, occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })),
      )
      const byId = new Map(locations.map((location) => [location.id, location]))
      return { coin: { instrumentId: instrument.id, symbol: instrument.ticker, name: instrument.name, whereHeld: [...balances.entries()].filter(([, units]) => units.greaterThan(0)).map(([locationId, units]) => ({ locationId, name: byId.get(locationId)?.name ?? 'Unknown location', type: byId.get(locationId)?.type ?? 'other', units: units.toString() })) } }
    } catch (error) { if (error instanceof CryptoLocationInsufficientUnitsError) return reply.code(422).send({ error: { code: error.code, message: error.message, requestId: request.id } }); throw error }
  })

  app.get<{ Params: { id: string } }>('/crypto/coins/:id/history', { preValidation: requireAuth, schema: { params: uuidParamsJson, querystring: historyQueryJson, response: { 200: coinHistoryJson, 404: errorJson, 503: errorJson } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params); const { range } = historyQuery.parse(request.query)
    const instrument = await options.prisma.instrument.findFirst({ where: { id, userId: request.user!.id, assetType: 'crypto', providerAssetId: { not: null } } })
    if (!instrument) return reply.code(404).send({ error: { code: 'CRYPTO_COIN_NOT_FOUND', message: 'Tracked crypto coin not found.', requestId: request.id } })
    try {
      const points = await options.catalog.getHistory(instrument.providerAssetId!, request.user!.baseCurrency, range as CryptoHistoryRange)
      return { instrumentId: instrument.id, providerAssetId: instrument.providerAssetId, baseCurrency: request.user!.baseCurrency, points: points.map((point) => ({ timestamp: point.timestamp, valueAmount: point.price })) }
    } catch (error) { if (error instanceof CryptoProviderUnavailableError) return reply.code(503).send({ error: { code: error.code, message: error.message, requestId: request.id } }); throw error }
  })

  app.post('/crypto/locations', { preValidation: [requireOrigin, requireAuth], schema: { body: locationBodyJson, response: { 201: { type: 'object', additionalProperties: false, required: ['location'], properties: { location: locationJson } }, 409: errorJson } } }, async (request, reply) => {
    const input = locationInput.parse(request.body)
    try { return reply.code(201).send({ location: await options.prisma.cryptoLocation.create({ data: { userId: request.user!.id, ...input } }) }) }
    catch (error: any) { if (error?.code === 'P2002') return reply.code(409).send({ error: { code: 'CRYPTO_LOCATION_ALREADY_EXISTS', message: 'A location with this name already exists.', field: 'name', requestId: request.id } }); throw error }
  })

  app.post('/crypto/trades', { preValidation: [requireOrigin, requireAuth], schema: { body: tradeBodyJson, response: { 200: { type: 'object', additionalProperties: false, required: ['trade'], properties: { trade: tradeJson } }, 201: { type: 'object', additionalProperties: false, required: ['trade'], properties: { trade: tradeJson } }, 404: errorJson, 409: errorJson, 422: errorJson } } }, async (request, reply) => {
    const input = tradeInput.parse(request.body); const userId = request.user!.id; const baseCurrency = request.user!.baseCurrency
    const fxRate = input.currencyCode === baseCurrency ? new Prisma.Decimal(1) : input.fxRateToBase ? new Prisma.Decimal(input.fxRateToBase) : null
    if (!fxRate) return reply.code(422).send({ error: { code: 'CRYPTO_HISTORICAL_FX_UNAVAILABLE', message: 'Provide the historical exchange rate for this trade currency.', field: 'fxRateToBase', requestId: request.id } })
    const price = new Prisma.Decimal(input.priceAmount); const fee = new Prisma.Decimal(input.feeAmount); const units = new Prisma.Decimal(input.units)
    if (price.lessThanOrEqualTo(0)) return reply.code(422).send({ error: { code: 'CRYPTO_INVALID_PRICE', message: 'Price must be greater than zero.', field: 'priceAmount', requestId: request.id } })
    if (units.lessThanOrEqualTo(0)) return reply.code(422).send({ error: { code: 'CRYPTO_INVALID_QUANTITY', message: 'Quantity must be greater than zero.', field: 'units', requestId: request.id } })
    if (input.type === 'sell' && fee.greaterThan(price.times(units))) return reply.code(422).send({ error: { code: 'CRYPTO_FEE_EXCEEDS_PROCEEDS', message: 'Fee cannot exceed gross sale proceeds.', field: 'feeAmount', requestId: request.id } })
    const duplicate = input.idempotencyKey ? await options.prisma.investmentTrade.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } }) : null
    if (duplicate) return reply.send({ trade: serializeTrade(duplicate) })
    const [instrument, location, existingTrades, transfers, cashAccount] = await Promise.all([
      options.prisma.instrument.findFirst({ where: { id: input.instrumentId, userId, assetType: 'crypto', tracked: true } }),
      options.prisma.cryptoLocation.findFirst({ where: { id: input.locationId, userId, active: true } }),
      options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: input.instrumentId }, select: { id: true, type: true, locationId: true, units: true, priceAmount: true, feeAmount: true, fxRateToBase: true, currencyCode: true, occurredOn: true, occurredTime: true, createdAt: true } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId, instrumentId: input.instrumentId }, select: { id: true, fromLocationId: true, toLocationId: true, units: true, networkFeeUnits: true, occurredOn: true, occurredTime: true, createdAt: true } }),
      input.cashAccountId ? options.prisma.financialAccount.findFirst({ where: { id: input.cashAccountId, userId } }) : null,
    ])
    if (!instrument) return reply.code(404).send({ error: { code: 'CRYPTO_COIN_NOT_FOUND', message: 'Tracked crypto coin not found.', requestId: request.id } })
    if (!location) return reply.code(404).send({ error: { code: 'CRYPTO_LOCATION_NOT_FOUND', message: 'Location not found.', field: 'locationId', requestId: request.id } })
    if (input.cashAccountId && !cashAccount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Funding account not found.', field: 'cashAccountId', requestId: request.id } })
    if (cashAccount && cashAccount.currencyCode !== baseCurrency) return reply.code(422).send({ error: { code: 'CRYPTO_HISTORICAL_FX_UNAVAILABLE', message: 'Cash-linked crypto trades currently require an account in your portfolio base currency.', field: 'cashAccountId', requestId: request.id } })
    // A candidate that has not been persisted yet has no createdAt. `new Date()`
    // here is guaranteed to be earlier than the createdAt the trade receives if
    // this validation passes and the create below proceeds, so it sorts after
    // every existing same-`occurredAt` event and before nothing — consistent
    // with "this is being recorded now".
    const now = new Date()
    try {
      for (const trade of existingTrades) if (!trade.fxRateToBase && trade.currencyCode !== baseCurrency) throw new CryptoHistoricalFxUnavailableError(trade.id)
      calculateCryptoPosition([...existingTrades.map((trade) => ({ id: trade.id, type: trade.type, units: trade.units, priceAmount: trade.priceAmount, feeAmount: trade.feeAmount, fxRateToBase: trade.fxRateToBase ?? '1', occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })), { id: 'candidate', type: input.type, units, priceAmount: price, feeAmount: fee, fxRateToBase: fxRate, occurredAt: eventTime(new Date(`${input.occurredOn}T00:00:00Z`), time(input.occurredTime)), createdAt: now }])
      calculateCryptoLocationBalances(
        [...existingTrades.map((trade) => ({ id: trade.id, type: trade.type, locationId: trade.locationId, units: trade.units, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })), { id: 'candidate', type: input.type, locationId: input.locationId, units, occurredAt: eventTime(new Date(`${input.occurredOn}T00:00:00Z`), time(input.occurredTime)), createdAt: now }],
        transfers.map((transfer) => ({ id: transfer.id, fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, units: transfer.units, networkFeeUnits: transfer.networkFeeUnits, occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })),
      )
    } catch (error) {
      if (error instanceof CryptoInsufficientUnitsError || error instanceof CryptoLocationInsufficientUnitsError) return reply.code(422).send({ error: { code: error.code, message: error.message, field: 'units', requestId: request.id } })
      if (error instanceof CryptoHistoricalFxUnavailableError) return reply.code(422).send({ error: { code: error.code, message: 'An earlier trade for this coin has no recorded historical FX rate; it must be corrected before new activity can be validated.', requestId: request.id } })
      throw error
    }
    const basePrice = price.times(fxRate); const baseFee = fee.times(fxRate)
    const priceMinor = BigInt(basePrice.times(100).toDecimalPlaces(0).toString()); const feeMinor = BigInt(baseFee.times(100).toDecimalPlaces(0).toString())
    const grossBase = units.times(basePrice); const cashMinor = BigInt((input.type === 'buy' ? grossBase.plus(baseFee) : grossBase.minus(baseFee)).times(100).toDecimalPlaces(0).toFixed(0))
    const linkKey = input.cashAccountId ? (input.idempotencyKey ?? randomUUID()) : (input.idempotencyKey ?? null)
    const create = async (tx: Prisma.TransactionClient | PrismaClient) => tx.investmentTrade.create({ data: { userId, instrumentId: input.instrumentId, type: input.type, units, priceMinor, priceAmount: price, currencyCode: input.currencyCode, feeMinor, feeAmount: fee, fxRateToBase: fxRate, locationId: input.locationId, cashAccountId: input.cashAccountId ?? null, settlementAmountMinor: input.cashAccountId ? cashMinor : null, settlementCurrencyCode: input.cashAccountId ? baseCurrency : null, occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), occurredTime: time(input.occurredTime), note: input.note ?? null, idempotencyKey: linkKey } })
    const trade = input.cashAccountId
      ? await options.ledgerService.postTransactionWithCallback(userId, { type: 'transfer', title: `Crypto ${input.type} · ${instrument.ticker}`, categoryId: null, goalId: null, fromAccountId: input.type === 'buy' ? input.cashAccountId : null, toAccountId: input.type === 'sell' ? input.cashAccountId : null, occurredOn: input.occurredOn, occurredTime: input.occurredTime ?? null, amountMinor: cashMinor, feeMinor: 0n, currencyCode: baseCurrency, source: 'manual', status: 'cleared', note: null, idempotencyKey: linkKey! }, create)
      : await create(options.prisma)
    return reply.code(201).send({ trade: serializeTrade(trade) })
  })

  app.delete<{ Params: { id: string } }>('/crypto/trades/:id', { preValidation: [requireOrigin, requireAuth], schema: { params: uuidParamsJson, response: { 204: { type: 'null' }, 404: errorJson, 409: errorJson } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params); const userId = request.user!.id
    const existing = await options.prisma.investmentTrade.findFirst({ where: { id, userId, instrument: { assetType: 'crypto' } } })
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Crypto trade not found.', requestId: request.id } })
    const [remainingTrades, transfers] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: existing.instrumentId, id: { not: id } } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId, instrumentId: existing.instrumentId } }),
    ])
    try {
      positionFor(existing.instrumentId, remainingTrades, transfers, request.user!.baseCurrency)
      calculateCryptoLocationBalances(
        remainingTrades.map((trade) => ({ id: trade.id, type: trade.type, locationId: trade.locationId, units: trade.units, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })),
        transfers.map((transfer) => ({ id: transfer.id, fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, units: transfer.units, networkFeeUnits: transfer.networkFeeUnits, occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })),
      )
    } catch (error) { if (error instanceof CryptoInsufficientUnitsError || error instanceof CryptoLocationInsufficientUnitsError) return reply.code(409).send({ error: { code: 'CRYPTO_ACTIVITY_DEPENDENCY', message: 'This trade is required by later crypto activity and cannot be deleted.', requestId: request.id } }); if (error instanceof CryptoHistoricalFxUnavailableError) return reply.code(409).send({ error: { code: error.code, message: 'A trade for this coin is missing its historical FX rate and cannot be safely recalculated.', requestId: request.id } }); throw error }
    if (existing.cashAccountId) {
      const linked = existing.idempotencyKey ? await options.prisma.transaction.findFirst({ where: { userId, idempotencyKey: existing.idempotencyKey, reversedTransactionId: null } }) : null
      if (!linked) return reply.code(409).send({ error: { code: 'TRADE_CASH_LINK_UNRESOLVED', message: 'The linked cash transaction could not be found for reversal.', requestId: request.id } })
      // The cash reversal and the crypto trade deletion must commit together:
      // reversing cash and then separately deleting the trade risks leaving
      // cash reversed with the trade still on record (or the reverse) if the
      // second statement fails. reverseTransactionWithCallback runs both in
      // the ledger's own transaction.
      await options.ledgerService.reverseTransactionWithCallback(userId, linked.id, {}, async (tx) => {
        await tx.investmentTrade.delete({ where: { id } })
      })
    } else {
      await options.prisma.investmentTrade.delete({ where: { id } })
    }
    return reply.code(204).send()
  })

  app.post('/crypto/transfers', { preValidation: [requireOrigin, requireAuth], schema: { body: transferBodyJson, response: { 200: { type: 'object', additionalProperties: false, required: ['transfer'], properties: { transfer: transferJson } }, 201: { type: 'object', additionalProperties: false, required: ['transfer'], properties: { transfer: transferJson } }, 404: errorJson, 409: errorJson, 422: errorJson } } }, async (request, reply) => {
    const input = transferInput.parse(request.body); const userId = request.user!.id
    if (input.fromLocationId === input.toLocationId) return reply.code(422).send({ error: { code: 'CRYPTO_TRANSFER_SAME_LOCATION', message: 'Choose different source and destination locations.', field: 'toLocationId', requestId: request.id } })
    const duplicate = input.idempotencyKey ? await options.prisma.cryptoTransfer.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } }) : null
    if (duplicate) return reply.send({ transfer: serializeTransfer(duplicate) })
    const [instrument, source, destination, trades, transfers] = await Promise.all([
      options.prisma.instrument.findFirst({ where: { id: input.instrumentId, userId, assetType: 'crypto' } }),
      options.prisma.cryptoLocation.findFirst({ where: { id: input.fromLocationId, userId, active: true } }), options.prisma.cryptoLocation.findFirst({ where: { id: input.toLocationId, userId, active: true } }),
      options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: input.instrumentId }, select: { id: true, type: true, locationId: true, units: true, occurredOn: true, occurredTime: true, createdAt: true } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId, instrumentId: input.instrumentId }, select: { id: true, fromLocationId: true, toLocationId: true, units: true, networkFeeUnits: true, occurredOn: true, occurredTime: true, createdAt: true } }),
    ])
    if (!instrument) return reply.code(404).send({ error: { code: 'CRYPTO_COIN_NOT_FOUND', message: 'Tracked crypto coin not found.', requestId: request.id } })
    if (!source || !destination) return reply.code(404).send({ error: { code: 'CRYPTO_LOCATION_NOT_FOUND', message: 'Source or destination location not found.', requestId: request.id } })
    try {
      calculateCryptoLocationBalances(trades.map((trade) => ({ ...trade, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })), transfers.map((transfer) => ({ ...transfer, occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })))
      const candidate = { id: 'candidate', fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, units: input.units, networkFeeUnits: input.networkFeeUnits, occurredAt: eventTime(new Date(`${input.occurredOn}T00:00:00Z`), time(input.occurredTime)), createdAt: new Date() }
      calculateCryptoLocationBalances(trades.map((trade) => ({ ...trade, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })), [...transfers.map((transfer) => ({ ...transfer, occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })), candidate])
    } catch (error) {
      if (error instanceof CryptoLocationInsufficientUnitsError || error instanceof CryptoTransferSameLocationError) return reply.code(422).send({ error: { code: error.code, message: error.message, requestId: request.id } })
      throw error
    }
    const transfer = await options.prisma.cryptoTransfer.create({ data: { userId, instrumentId: input.instrumentId, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, units: input.units, networkFeeUnits: input.networkFeeUnits, occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), occurredTime: time(input.occurredTime), note: input.note ?? null, idempotencyKey: input.idempotencyKey ?? null } })
    return reply.code(201).send({ transfer: serializeTransfer(transfer) })
  })

  app.delete<{ Params: { id: string } }>('/crypto/transfers/:id', { preValidation: [requireOrigin, requireAuth], schema: { params: uuidParamsJson, response: { 204: { type: 'null' }, 404: errorJson, 409: errorJson } } }, async (request, reply) => {
    const { id } = coinIdParam.parse(request.params); const userId = request.user!.id
    const existing = await options.prisma.cryptoTransfer.findFirst({ where: { id, userId } })
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Crypto transfer not found.', requestId: request.id } })
    const [trades, remainingTransfers] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: existing.instrumentId } }),
      options.prisma.cryptoTransfer.findMany({ where: { userId, instrumentId: existing.instrumentId, id: { not: id } } }),
    ])
    try {
      positionFor(existing.instrumentId, trades, remainingTransfers, request.user!.baseCurrency)
      calculateCryptoLocationBalances(
        trades.map((trade) => ({ id: trade.id, type: trade.type, locationId: trade.locationId, units: trade.units, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt })),
        remainingTransfers.map((transfer) => ({ id: transfer.id, fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, units: transfer.units, networkFeeUnits: transfer.networkFeeUnits, occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })),
      )
    } catch (error) { if (error instanceof CryptoInsufficientUnitsError || error instanceof CryptoLocationInsufficientUnitsError) return reply.code(409).send({ error: { code: 'CRYPTO_ACTIVITY_DEPENDENCY', message: 'This transfer is required by later crypto activity and cannot be deleted.', requestId: request.id } }); if (error instanceof CryptoHistoricalFxUnavailableError) return reply.code(409).send({ error: { code: error.code, message: 'A trade for this coin is missing its historical FX rate and cannot be safely recalculated.', requestId: request.id } }); throw error }
    await options.prisma.cryptoTransfer.delete({ where: { id } })
    return reply.code(204).send()
  })
}

/**
 * A trade's historical FX must never be fabricated. Every currently-created
 * trade requires an explicit rate (see the 422 in POST /crypto/trades), so a
 * null value here can only come from a legacy/imported row. Treat that as
 * "cost basis unavailable" rather than inventing a rate of zero, which would
 * silently zero out cost basis and manufacture fake realized gains on sale.
 */
export class CryptoHistoricalFxUnavailableError extends Error {
  readonly code = 'CRYPTO_HISTORICAL_FX_UNAVAILABLE' as const
  constructor(readonly tradeId: string) {
    super(`Trade ${tradeId} has no recorded FX rate to the portfolio base currency.`)
  }
}

function positionFor(instrumentId: string, trades: Array<{ id: string; instrumentId: string; type: 'buy' | 'sell'; units: { toString(): string }; priceAmount: { toString(): string }; feeAmount: { toString(): string }; fxRateToBase: { toString(): string } | null; currencyCode: string; occurredOn: Date; occurredTime: Date | null; createdAt: Date }>, transfers: Array<{ id: string; instrumentId: string; networkFeeUnits: { toString(): string }; occurredOn: Date; occurredTime: Date | null; createdAt: Date }>, baseCurrency: string, through?: Date) {
  return calculateCryptoPosition(
    trades.filter((trade) => trade.instrumentId === instrumentId && (!through || eventTime(trade.occurredOn, trade.occurredTime) <= through)).map((trade) => {
      const fxRateToBase = trade.fxRateToBase?.toString() ?? (trade.currencyCode === baseCurrency ? '1' : null)
      if (fxRateToBase === null) throw new CryptoHistoricalFxUnavailableError(trade.id)
      return { id: trade.id, type: trade.type, units: trade.units.toString(), priceAmount: trade.priceAmount.toString(), feeAmount: trade.feeAmount.toString(), fxRateToBase, occurredAt: eventTime(trade.occurredOn, trade.occurredTime), createdAt: trade.createdAt }
    }),
    transfers.filter((transfer) => transfer.instrumentId === instrumentId && (!through || eventTime(transfer.occurredOn, transfer.occurredTime) <= through)).map((transfer) => ({ id: transfer.id, networkFeeUnits: transfer.networkFeeUnits.toString(), occurredAt: eventTime(transfer.occurredOn, transfer.occurredTime), createdAt: transfer.createdAt })),
  )
}

function priceAt(points: Array<{ timestamp: string; price: string }>, at: Date): Prisma.Decimal | null {
  let closest: string | null = null
  for (const point of points) { if (new Date(point.timestamp) <= at) closest = point.price; else break }
  return closest ? new Prisma.Decimal(closest) : null
}

function serializeTransfer(transfer: { id: string; instrumentId: string; fromLocationId: string; toLocationId: string; units: { toString(): string }; networkFeeUnits: { toString(): string }; occurredOn: Date; occurredTime: Date | null; note: string | null; createdAt: Date }) {
  return { id: transfer.id, instrumentId: transfer.instrumentId, fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, units: transfer.units.toString(), networkFeeUnits: transfer.networkFeeUnits.toString(), occurredOn: transfer.occurredOn.toISOString().slice(0, 10), occurredTime: transfer.occurredTime?.toISOString().slice(11, 16) ?? null, note: transfer.note, createdAt: transfer.createdAt.toISOString() }
}

function serializeTrade(trade: { id: string; instrumentId: string; type: string; units: { toString(): string }; priceAmount: { toString(): string }; feeAmount: { toString(): string }; currencyCode: string; fxRateToBase: { toString(): string } | null; locationId: string | null; cashAccountId: string | null; occurredOn: Date; occurredTime: Date | null; note: string | null; createdAt: Date }) {
  return { id: trade.id, instrumentId: trade.instrumentId, type: trade.type, units: trade.units.toString(), priceAmount: trade.priceAmount.toString(), feeAmount: trade.feeAmount.toString(), currencyCode: trade.currencyCode, fxRateToBase: trade.fxRateToBase?.toString() ?? null, locationId: trade.locationId, cashAccountId: trade.cashAccountId, occurredOn: trade.occurredOn.toISOString().slice(0, 10), occurredTime: trade.occurredTime?.toISOString().slice(11, 16) ?? null, note: trade.note, createdAt: trade.createdAt.toISOString() }
}
