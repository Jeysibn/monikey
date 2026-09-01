import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import {
  computeReportSummary,
  computeCashFlow,
  computeSpendingByCategory,
  computeNetWorthTrend,
  computeBudgetPerformance,
  computeGoalsReport,
  computeInvestmentsReport,
} from './reports.repository.js'

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const periodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
})

const asOfSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const viewSchema = z.object({
  view: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  period: z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/),
})

export async function reportsRoutes(app: FastifyInstance, options: { prisma: PrismaClient }) {
  const { prisma } = options

  app.addHook('preHandler', authGuard({ prisma }))

  /**
   * GET /reports/summary?view=monthly&period=2026-09
   *
   * Returns income, expenses, net cash flow, and net worth change for a period.
   */
  app.get<{ Querystring: { view: string; period: string } }>('/summary', async (request, reply) => {
    const query = viewSchema.parse(request.query)
    const userId = request.user!.id

    // Parse period string: YYYY-MM or YYYY-MM-DD
    const parts = query.period.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]

    let periodStart: Date
    let periodEnd: Date

    if (query.view === 'daily' && day) {
      periodStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
      periodEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))
    } else if (query.view === 'monthly' || !day) {
      periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      periodEnd = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0))
      periodEnd = new Date(periodEnd.getTime() - 1) // Last moment of last day
    } else if (query.view === 'quarterly') {
      const quarter = Math.ceil(month / 3)
      const quarterStart = (quarter - 1) * 3 + 1
      periodStart = new Date(Date.UTC(year, quarterStart - 1, 1, 0, 0, 0))
      const quarterEnd = quarterStart + 2
      const endMonth = quarterEnd + 1
      const endYear = endMonth > 12 ? year + 1 : year
      periodEnd = new Date(Date.UTC(endYear, endMonth > 12 ? endMonth - 13 : endMonth - 1, 1, 0, 0, 0))
      periodEnd = new Date(periodEnd.getTime() - 1)
    } else {
      // yearly
      periodStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
      periodEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
      periodEnd = new Date(periodEnd.getTime() - 1)
    }

    const summary = await computeReportSummary(prisma, userId, periodStart, periodEnd, request.user!.timezone)
    return reply.send(summary)
  })

  /**
   * GET /reports/cash-flow?from=2026-09-01&to=2026-09-30
   *
   * Returns daily income, expenses, and net flow for the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/cash-flow', async (request, reply) => {
    const query = dateRangeSchema.parse(request.query)
    const userId = request.user!.id
    const dateFrom = new Date(`${query.from}T00:00:00Z`)
    const dateTo = new Date(`${query.to}T23:59:59Z`)

    const cashFlow = await computeCashFlow(prisma, userId, dateFrom, dateTo)
    return reply.send(cashFlow)
  })

  /**
   * GET /reports/spending-by-category?from=2026-09-01&to=2026-09-30
   *
   * Returns spending totals per category for the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/spending-by-category', async (request, reply) => {
    const query = dateRangeSchema.parse(request.query)
    const userId = request.user!.id
    const dateFrom = new Date(`${query.from}T00:00:00Z`)
    const dateTo = new Date(`${query.to}T23:59:59Z`)

    const spending = await computeSpendingByCategory(prisma, userId, dateFrom, dateTo)
    return reply.send(spending)
  })

  /**
   * GET /reports/net-worth?from=2026-09-01&to=2026-09-30
   *
   * Returns daily asset, liability, and net worth trend for the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/net-worth', async (request, reply) => {
    const query = dateRangeSchema.parse(request.query)
    const userId = request.user!.id
    const dateFrom = new Date(`${query.from}T00:00:00Z`)
    const dateTo = new Date(`${query.to}T23:59:59Z`)

    const trend = await computeNetWorthTrend(prisma, userId, dateFrom, dateTo)
    return reply.send(trend)
  })

  /**
   * GET /reports/budget-performance?period=2026-09
   *
   * Returns allocated vs spent per category for the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/budget-performance', async (request, reply) => {
    const query = periodSchema.parse(request.query)
    const userId = request.user!.id
    const parts = query.period.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!

    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const periodEnd = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0))
    periodEnd.setUTCHours(23, 59, 59, 999)

    const performance = await computeBudgetPerformance(prisma, userId, periodStart, periodEnd)
    if (!performance) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'No budget found for this period.', requestId: request.id } })
    }

    return reply.send(performance)
  })

  /**
   * GET /reports/goals?asOf=2026-09-01
   *
   * Returns all active goals and their progress as of a date.
   */
  app.get<{ Querystring: Record<string, string> }>('/goals', async (request, reply) => {
    const query = asOfSchema.parse(request.query)
    const userId = request.user!.id
    const asOf = new Date(`${query.asOf}T23:59:59Z`)

    const goals = await computeGoalsReport(prisma, userId, asOf)
    return reply.send(goals)
  })

  /**
   * GET /reports/investments?from=2026-09-01&to=2026-09-30
   *
   * Returns investment holdings and performance for trades executed in the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/investments', async (request, reply) => {
    const query = dateRangeSchema.parse(request.query)
    const userId = request.user!.id
    const dateFrom = new Date(`${query.from}T00:00:00Z`)
    const dateTo = new Date(`${query.to}T23:59:59Z`)

    const investments = await computeInvestmentsReport(prisma, userId, dateFrom, dateTo)
    return reply.send(investments)
  })
}
