import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { LedgerService } from '../ledger/ledger.service.js'

const tradeSchema = z.object({ ticker: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(160), assetClass: z.enum(['equity', 'etf', 'crypto', 'reit', 'bond']), sector: z.string().trim().min(1).max(80), type: z.enum(['buy', 'sell']), units: z.number().positive(), priceMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cashAccountId: z.string().uuid().nullable().optional(), note: z.string().max(500).nullable().optional(), idempotencyKey: z.string().max(128).nullable().optional() })
const dividendSchema = z.object({ ticker: z.string().trim().min(1).max(16), amountMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cashAccountId: z.string().uuid().nullable().optional(), note: z.string().max(500).nullable().optional() })
const updateTradeSchema = z.object({ type: z.enum(['buy', 'sell']), units: z.number().positive(), priceMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).nullable().optional() })
const tradeIdParamSchema = z.object({ id: z.string().uuid('Invalid trade ID format') })

export async function investmentsRoutes(app: FastifyInstance, options: { prisma: PrismaClient; ledgerService: LedgerService; appOrigin: string }) {
  const requireAuth = authGuard({ prisma: options.prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: options.appOrigin })
  app.get('/investments', { preHandler: requireAuth }, async (request) => {
    const [trades, dividends] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId: request.user!.id }, include: { instrument: { include: { quoteSnapshots: { orderBy: { fetchedAt: 'desc' }, take: 1 } } } }, orderBy: { occurredOn: 'desc' } }),
      options.prisma.dividend.findMany({ where: { userId: request.user!.id }, include: { instrument: true }, orderBy: { occurredOn: 'desc' } }),
    ])
    // Decimal.js (Prisma.Decimal) arithmetic throughout — never route
    // cost-basis/units through a lossy Number division/multiplication
    // chain. `Number(...)` only happens at the final response-serialization
    // boundary below (QA Attempt 1, Defects 1 & 2).
    const byInstrument = new Map<string, { instrument: typeof trades[number]['instrument']; units: Prisma.Decimal; costBasisMinor: Prisma.Decimal; latestPriceMinor: Prisma.Decimal }>()
    for (const trade of [...trades].sort((a, b) => a.occurredOn.getTime() - b.occurredOn.getTime())) {
      const current = byInstrument.get(trade.instrumentId) ?? { instrument: trade.instrument, units: new Prisma.Decimal(0), costBasisMinor: new Prisma.Decimal(0), latestPriceMinor: new Prisma.Decimal(trade.priceMinor.toString()) }
      const units = new Prisma.Decimal(trade.units.toString())
      const priceMinor = new Prisma.Decimal(trade.priceMinor.toString())
      if (trade.type === 'buy') {
        current.costBasisMinor = current.costBasisMinor.plus(units.times(priceMinor))
        current.units = current.units.plus(units)
      } else {
        const average = current.units.greaterThan(0) ? current.costBasisMinor.dividedBy(current.units) : new Prisma.Decimal(0)
        const removed = average.times(units)
        current.costBasisMinor = Prisma.Decimal.max(0, current.costBasisMinor.minus(removed))
        current.units = current.units.minus(units)
      }
      current.latestPriceMinor = trade.instrument.quoteSnapshots[0] ? new Prisma.Decimal(trade.instrument.quoteSnapshots[0].priceMinor.toString()) : priceMinor
      byInstrument.set(trade.instrumentId, current)
    }
    return { holdings: Array.from(byInstrument.values()).filter((holding) => holding.units.greaterThan(0)).map((holding) => ({ instrumentId: holding.instrument.id, ticker: holding.instrument.ticker, name: holding.instrument.name, assetClass: holding.instrument.assetClass, sector: holding.instrument.sector, units: holding.units.toNumber(), costBasisMinor: holding.costBasisMinor.round().toNumber(), averageCostMinor: holding.units.greaterThan(0) ? holding.costBasisMinor.dividedBy(holding.units).round().toNumber() : 0, latestPriceMinor: holding.latestPriceMinor.toNumber(), quoteSource: holding.instrument.quoteSnapshots[0]?.source ?? 'trade', quoteFetchedAt: holding.instrument.quoteSnapshots[0]?.fetchedAt.toISOString() ?? null, quoteStale: holding.instrument.quoteSnapshots[0] ? Date.now() - holding.instrument.quoteSnapshots[0].fetchedAt.getTime() > 24 * 60 * 60 * 1000 : true })), trades: trades.map((trade) => ({ id: trade.id, userId: trade.userId, instrumentId: trade.instrumentId, ticker: trade.instrument.ticker, type: trade.type, units: Number(trade.units), priceMinor: Number(trade.priceMinor), occurredOn: trade.occurredOn.toISOString().slice(0, 10), cashAccountId: trade.cashAccountId, note: trade.note, idempotencyKey: trade.idempotencyKey, createdAt: trade.createdAt.toISOString() })), dividends: dividends.map((dividend) => ({ ...dividend, amountMinor: Number(dividend.amountMinor), occurredOn: dividend.occurredOn.toISOString().slice(0, 10) })) }
  })
  app.post('/investments/trades', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const input = tradeSchema.parse(request.body)
    const userId = request.user!.id
    const existing = input.idempotencyKey ? await options.prisma.investmentTrade.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey }, include: { instrument: true } }) : null
    if (existing) return reply.code(200).send({ ...existing, units: Number(existing.units), priceMinor: Number(existing.priceMinor), occurredOn: existing.occurredOn.toISOString().slice(0, 10) })
    const instrument = await options.prisma.instrument.upsert({ where: { userId_ticker: { userId, ticker: input.ticker } }, create: { userId, ticker: input.ticker, name: input.name, assetClass: input.assetClass, sector: input.sector }, update: { name: input.name, assetClass: input.assetClass, sector: input.sector } })
    const previous = await options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: instrument.id }, select: { type: true, units: true } })
    const heldUnits = previous.reduce((sum, trade) => sum.plus(trade.type === 'buy' ? new Prisma.Decimal(trade.units.toString()) : new Prisma.Decimal(trade.units.toString()).negated()), new Prisma.Decimal(0))
    const inputUnits = new Prisma.Decimal(input.units.toString())
    if (input.type === 'sell' && inputUnits.greaterThan(heldUnits)) return reply.code(422).send({ error: { code: 'INVESTMENT_OVERSELL', message: 'Sell quantity exceeds current units.', field: 'units', requestId: request.id } })
    // Decimal multiplication before the single final rounding — never a
    // Number*Number chain (QA Attempt 1, Defect 2).
    const cashAmount = inputUnits.times(input.priceMinor).round().toNumber()
    const ledgerInput = input.cashAccountId ? { type: input.type === 'buy' ? 'expense' as const : 'income' as const, title: `${input.type === 'buy' ? 'Investment buy' : 'Investment sell'} · ${input.ticker}`, categoryId: null, goalId: null, fromAccountId: input.type === 'buy' ? input.cashAccountId : null, toAccountId: input.type === 'sell' ? input.cashAccountId : null, occurredOn: input.occurredOn, occurredTime: null, amountMinor: cashAmount, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: input.note ?? null, idempotencyKey: input.idempotencyKey ?? null } : null
    const createTrade = async (tx: any) => tx.investmentTrade.create({ data: { userId, instrumentId: instrument.id, type: input.type, units: input.units, priceMinor: BigInt(input.priceMinor), occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), cashAccountId: input.cashAccountId ?? null, note: input.note ?? null, idempotencyKey: input.idempotencyKey ?? null }, include: { instrument: true } })
    const trade = ledgerInput ? await options.ledgerService.postTransactionWithCallback(userId, ledgerInput, async (tx) => createTrade(tx)) : await createTrade(options.prisma)
    return reply.code(201).send({ ...trade, units: Number(trade.units), priceMinor: Number(trade.priceMinor), occurredOn: trade.occurredOn.toISOString().slice(0, 10) })
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
    const updated = await options.prisma.investmentTrade.update({ where: { id }, data: { type: input.type, units: input.units, priceMinor: BigInt(input.priceMinor), occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), note: input.note ?? null }, include: { instrument: true } })
    return reply.send({ ...updated, units: Number(updated.units), priceMinor: Number(updated.priceMinor), occurredOn: updated.occurredOn.toISOString().slice(0, 10) })
  })
  app.delete<{ Params: { id: string } }>('/investments/trades/:id', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const { id } = tradeIdParamSchema.parse(request.params)
    const userId = request.user!.id
    const existing = await options.prisma.investmentTrade.findFirst({ where: { id, userId } })
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Trade not found.', requestId: request.id } })
    if (existing.cashAccountId) {
      // Best-effort: undo the linked cash-account transaction (matched by
      // the shared idempotency key) via the existing reversal pattern
      // before removing the trade, so the account balance doesn't drift.
      const linked = existing.idempotencyKey ? await options.prisma.transaction.findFirst({ where: { userId, idempotencyKey: existing.idempotencyKey, reversedTransactionId: null } }) : null
      if (linked) await options.ledgerService.reverseTransaction(userId, linked.id, {})
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
      ? await options.ledgerService.postTransactionWithCallback(request.user!.id, { type: 'income', title: `Dividend · ${input.ticker}`, categoryId: null, goalId: null, fromAccountId: null, toAccountId: input.cashAccountId, occurredOn: input.occurredOn, occurredTime: null, amountMinor: input.amountMinor, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: input.note ?? null }, async (tx) => createDividend(tx))
      : await createDividend(options.prisma)
    return reply.code(201).send({ ...dividend, amountMinor: Number(dividend.amountMinor), occurredOn: dividend.occurredOn.toISOString().slice(0, 10) })
  })
}
