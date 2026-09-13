import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authGuard } from '../../common/auth/authGuard.js'
import { getUTCDateForLocalDateTime } from '../../common/timezone.js'
import {
  computeReportSummary,
  computeCashFlow,
  computeSpendingByCategory,
  computeSpendingByTag,
  computeNetWorthTrend,
  computeBudgetPerformance,
  computeGoalsReport,
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

const dateJson = { type: 'string', format: 'date' } as const
const minorUnitsJson = { type: 'string', pattern: '^-?\\d+$' } as const
const dateRangeQueryJson = {
  type: 'object', additionalProperties: false, required: ['from', 'to'],
  properties: { from: dateJson, to: dateJson },
} as const
const periodQueryJson = {
  type: 'object', additionalProperties: false, required: ['period'],
  properties: { period: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } },
} as const
const asOfQueryJson = {
  type: 'object', additionalProperties: false, required: ['asOf'], properties: { asOf: dateJson },
} as const
const viewQueryJson = {
  type: 'object', additionalProperties: false, required: ['period'],
  properties: {
    view: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
    period: { type: 'string', pattern: '^\\d{4}-\\d{2}(?:-\\d{2})?$' },
  },
} as const
const errorJson = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: { code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } } } },
} as const
const summaryJson = { type: 'object', additionalProperties: false, required: ['income', 'expenses', 'netCashFlow', 'cardDebtChange', 'netWorthChange', 'cardDebtAtEnd', 'netWorthAtEnd'], properties: { income: minorUnitsJson, expenses: minorUnitsJson, netCashFlow: minorUnitsJson, cardDebtChange: minorUnitsJson, netWorthChange: minorUnitsJson, cardDebtAtEnd: minorUnitsJson, netWorthAtEnd: minorUnitsJson } } as const
const cashFlowJson = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'income', 'expenses', 'netFlow'], properties: { date: dateJson, income: minorUnitsJson, expenses: minorUnitsJson, netFlow: minorUnitsJson } } } as const
const categorySpendJson = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['categoryId', 'categoryName', 'spent'], properties: { categoryId: { type: 'string', format: 'uuid' }, categoryName: { type: 'string' }, spent: minorUnitsJson, budget: { type: 'number' }, remaining: { type: 'number' }, utilization: { type: 'number' } } } } as const
const tagSpendJson = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tagId', 'tagName', 'spent'], properties: { tagId: { type: 'string', format: 'uuid' }, tagName: { type: 'string' }, spent: minorUnitsJson } } } as const
const netWorthJson = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'assetTotal', 'liabilityTotal', 'netWorth'], properties: { date: dateJson, assetTotal: minorUnitsJson, liabilityTotal: minorUnitsJson, netWorth: minorUnitsJson } } } as const
const budgetPerformanceJson = { type: 'object', additionalProperties: false, required: ['periodStart', 'periodEnd', 'categories', 'totalAllocated', 'totalSpent', 'totalRemaining'], properties: { periodStart: dateJson, periodEnd: dateJson, categories: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['categoryId', 'categoryName', 'allocated', 'spent', 'remaining', 'utilization'], properties: { categoryId: { type: 'string', format: 'uuid' }, categoryName: { type: 'string' }, allocated: minorUnitsJson, spent: minorUnitsJson, remaining: minorUnitsJson, utilization: { type: 'number' } } } }, totalAllocated: minorUnitsJson, totalSpent: minorUnitsJson, totalRemaining: minorUnitsJson } } as const
const goalsJson = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['goalId', 'name', 'target', 'current', 'targetDate', 'progress', 'completed'], properties: { goalId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, target: minorUnitsJson, current: minorUnitsJson, targetDate: dateJson, monthlyContribution: minorUnitsJson, progress: { type: 'number' }, completed: { type: 'boolean' }, completedDate: dateJson } } } as const

function addDaysToLocalDate(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0, second: 0 }
}

export async function reportsRoutes(app: FastifyInstance, options: { prisma: PrismaClient }) {
  const { prisma } = options

  app.addHook('preHandler', authGuard({ prisma }))

  /**
   * GET /reports/summary?view=monthly&period=2026-09
   *
   * Returns income, expenses, net cash flow, and net worth change for a period.
   */
  app.get<{ Querystring: { view?: string; period: string } }>('/summary', { schema: { querystring: viewQueryJson, response: { 200: summaryJson } } }, async (request, reply) => {
    const query = viewSchema.parse(request.query)
    const userId = request.user!.id
    const userTimezone = request.user!.timezone

    // Parse period string: YYYY-MM or YYYY-MM-DD
    const parts = query.period.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]

    let localPeriodStart: { year: number; month: number; day: number; hour: number; minute: number; second: number }
    let localPeriodEnd: { year: number; month: number; day: number; hour: number; minute: number; second: number }

    if (query.view === 'daily') {
      const startDay = day ?? 1
      localPeriodStart = { year, month, day: startDay, hour: 0, minute: 0, second: 0 }
      localPeriodEnd = addDaysToLocalDate(year, month, startDay, 1)
    } else if (query.view === 'weekly') {
      const startDay = day ?? 1
      localPeriodStart = { year, month, day: startDay, hour: 0, minute: 0, second: 0 }
      localPeriodEnd = addDaysToLocalDate(year, month, startDay, 7)
    } else if (query.view === 'quarterly') {
      const quarterStart = (Math.ceil(month / 3) - 1) * 3 + 1
      localPeriodStart = { year, month: quarterStart, day: 1, hour: 0, minute: 0, second: 0 }
      localPeriodEnd = quarterStart === 10
        ? { year: year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
        : { year, month: quarterStart + 3, day: 1, hour: 0, minute: 0, second: 0 }
    } else if (query.view === 'monthly') {
      localPeriodStart = { year, month, day: 1, hour: 0, minute: 0, second: 0 }
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      localPeriodEnd = { year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0, second: 0 }
    } else {
      // yearly
      localPeriodStart = { year, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
      localPeriodEnd = { year: year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
    }

    // Convert local period boundaries to UTC using user's timezone
    const periodStart = getUTCDateForLocalDateTime(localPeriodStart.year, localPeriodStart.month, localPeriodStart.day, localPeriodStart.hour, localPeriodStart.minute, localPeriodStart.second, userTimezone)
    const periodEndUTC = getUTCDateForLocalDateTime(localPeriodEnd.year, localPeriodEnd.month, localPeriodEnd.day, localPeriodEnd.hour, localPeriodEnd.minute, localPeriodEnd.second, userTimezone)
    // For period end, we want the last moment before the next period starts
    const periodEnd = new Date(periodEndUTC.getTime() - 1)

    const summary = await computeReportSummary(prisma, userId, periodStart, periodEnd, userTimezone)
    return reply.send(summary)
  })

  /**
   * GET /reports/cash-flow?from=2026-09-01&to=2026-09-30
   *
   * Returns daily income, expenses, and net flow for the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/cash-flow', { schema: { querystring: dateRangeQueryJson, response: { 200: cashFlowJson } } }, async (request, reply) => {
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
  app.get<{ Querystring: Record<string, string> }>('/spending-by-category', { schema: { querystring: dateRangeQueryJson, response: { 200: categorySpendJson } } }, async (request, reply) => {
    const query = dateRangeSchema.parse(request.query)
    const userId = request.user!.id
    const dateFrom = new Date(`${query.from}T00:00:00Z`)
    const dateTo = new Date(`${query.to}T23:59:59Z`)

    const spending = await computeSpendingByCategory(prisma, userId, dateFrom, dateTo)
    return reply.send(spending)
  })

  app.get<{ Querystring: Record<string, string> }>('/spending-by-tag', { schema: { querystring: dateRangeQueryJson, response: { 200: tagSpendJson } } }, async (request, reply) => {
    const query = dateRangeSchema.parse(request.query)
    const spending = await computeSpendingByTag(prisma, request.user!.id, new Date(`${query.from}T00:00:00Z`), new Date(`${query.to}T23:59:59Z`))
    return reply.send(spending)
  })

  /**
   * GET /reports/net-worth?from=2026-09-01&to=2026-09-30
   *
   * Returns daily asset, liability, and net worth trend for the period.
   */
  app.get<{ Querystring: Record<string, string> }>('/net-worth', { schema: { querystring: dateRangeQueryJson, response: { 200: netWorthJson } } }, async (request, reply) => {
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
  app.get<{ Querystring: Record<string, string> }>('/budget-performance', { schema: { querystring: periodQueryJson, response: { 200: budgetPerformanceJson, 404: errorJson } } }, async (request, reply) => {
    const query = periodSchema.parse(request.query)
    const userId = request.user!.id
    const userTimezone = request.user!.timezone
    const parts = query.period.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!

    // Convert local period boundaries to UTC using user's timezone
    const localPeriodStart = { year, month, day: 1, hour: 0, minute: 0, second: 0 }
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const localPeriodEnd = { year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0, second: 0 }

    const periodStart = getUTCDateForLocalDateTime(localPeriodStart.year, localPeriodStart.month, localPeriodStart.day, localPeriodStart.hour, localPeriodStart.minute, localPeriodStart.second, userTimezone)
    const periodEndUTC = getUTCDateForLocalDateTime(localPeriodEnd.year, localPeriodEnd.month, localPeriodEnd.day, localPeriodEnd.hour, localPeriodEnd.minute, localPeriodEnd.second, userTimezone)
    // For period end, we want the last moment before the next period starts
    const periodEnd = new Date(periodEndUTC.getTime() - 1)

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
  app.get<{ Querystring: Record<string, string> }>('/goals', { schema: { querystring: asOfQueryJson, response: { 200: goalsJson } } }, async (request, reply) => {
    const query = asOfSchema.parse(request.query)
    const userId = request.user!.id
    const asOf = new Date(`${query.asOf}T23:59:59Z`)

    const goals = await computeGoalsReport(prisma, userId, asOf)
    return reply.send(goals)
  })

  // The /investments report route is deliberately unregistered along with
  // the rest of the Investments feature — `computeInvestmentsReport` itself
  // is left in reports.repository.ts, untouched, for a future rebuild.
}
