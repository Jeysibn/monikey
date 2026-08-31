import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { LedgerService } from '../ledger/ledger.service.js'

const tradeSchema = z.object({ ticker: z.string().trim().min(1).max(16), name: z.string().trim().min(1).max(160), assetClass: z.enum(['equity', 'etf', 'crypto', 'reit', 'bond']), sector: z.string().trim().min(1).max(80), type: z.enum(['buy', 'sell']), units: z.number().positive(), priceMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cashAccountId: z.string().uuid().nullable().optional(), note: z.string().max(500).nullable().optional(), idempotencyKey: z.string().max(128).nullable().optional() })
const dividendSchema = z.object({ ticker: z.string().trim().min(1).max(16), amountMinor: z.number().int().positive(), occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cashAccountId: z.string().uuid().nullable().optional(), note: z.string().max(500).nullable().optional() })

export async function investmentsRoutes(app: FastifyInstance, options: { prisma: PrismaClient; ledgerService: LedgerService; appOrigin: string }) {
  const requireAuth = authGuard({ prisma: options.prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: options.appOrigin })
  app.get('/investments', { preHandler: requireAuth }, async (request) => {
    const [trades, dividends] = await Promise.all([
      options.prisma.investmentTrade.findMany({ where: { userId: request.user!.id }, include: { instrument: true }, orderBy: { occurredOn: 'desc' } }),
      options.prisma.dividend.findMany({ where: { userId: request.user!.id }, include: { instrument: true }, orderBy: { occurredOn: 'desc' } }),
    ])
    return { trades: trades.map((trade) => ({ ...trade, units: Number(trade.units), priceMinor: Number(trade.priceMinor), occurredOn: trade.occurredOn.toISOString().slice(0, 10) })), dividends: dividends.map((dividend) => ({ ...dividend, amountMinor: Number(dividend.amountMinor), occurredOn: dividend.occurredOn.toISOString().slice(0, 10) })) }
  })
  app.post('/investments/trades', { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    const input = tradeSchema.parse(request.body)
    const userId = request.user!.id
    const existing = input.idempotencyKey ? await options.prisma.investmentTrade.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey }, include: { instrument: true } }) : null
    if (existing) return reply.code(200).send({ ...existing, units: Number(existing.units), priceMinor: Number(existing.priceMinor), occurredOn: existing.occurredOn.toISOString().slice(0, 10) })
    const instrument = await options.prisma.instrument.upsert({ where: { userId_ticker: { userId, ticker: input.ticker } }, create: { userId, ticker: input.ticker, name: input.name, assetClass: input.assetClass, sector: input.sector }, update: { name: input.name, assetClass: input.assetClass, sector: input.sector } })
    const previous = await options.prisma.investmentTrade.findMany({ where: { userId, instrumentId: instrument.id }, select: { type: true, units: true } })
    const heldUnits = previous.reduce((sum, trade) => sum + (trade.type === 'buy' ? Number(trade.units) : -Number(trade.units)), 0)
    if (input.type === 'sell' && input.units > heldUnits) return reply.code(422).send({ error: { code: 'INVESTMENT_OVERSELL', message: 'Sell quantity exceeds current units.', field: 'units', requestId: request.id } })
    const cashAmount = Math.round(input.units * input.priceMinor)
    const ledgerInput = input.cashAccountId ? { type: input.type === 'buy' ? 'expense' as const : 'income' as const, title: `${input.type === 'buy' ? 'Investment buy' : 'Investment sell'} · ${input.ticker}`, categoryId: null, goalId: null, fromAccountId: input.type === 'buy' ? input.cashAccountId : null, toAccountId: input.type === 'sell' ? input.cashAccountId : null, occurredOn: input.occurredOn, occurredTime: null, amountMinor: cashAmount, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: input.note ?? null, idempotencyKey: input.idempotencyKey ?? null } : null
    const createTrade = async (tx: any) => tx.investmentTrade.create({ data: { userId, instrumentId: instrument.id, type: input.type, units: input.units, priceMinor: BigInt(input.priceMinor), occurredOn: new Date(`${input.occurredOn}T00:00:00Z`), cashAccountId: input.cashAccountId ?? null, note: input.note ?? null, idempotencyKey: input.idempotencyKey ?? null }, include: { instrument: true } })
    const trade = ledgerInput ? await options.ledgerService.postTransactionWithCallback(userId, ledgerInput, async (tx) => createTrade(tx)) : await createTrade(options.prisma)
    return reply.code(201).send({ ...trade, units: Number(trade.units), priceMinor: Number(trade.priceMinor), occurredOn: trade.occurredOn.toISOString().slice(0, 10) })
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
