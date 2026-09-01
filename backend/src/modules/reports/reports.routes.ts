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

/**
 * Helper: Get the UTC date corresponding to a local date in a given timezone.
 * Uses binary search to find the exact UTC moment that, when formatted in the
 * target timezone, yields the desired local date/time.
 */
function getUTCDateForLocalDateTime(
  localYear: number,
  localMonth: number,
  localDay: number,
  localHour: number,
  localMinute: number,
  localSecond: number,
  timezone: string
): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Binary search: find the UTC timestamp that yields the desired local date
  let low = new Date(Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, localSecond)).getTime() - 24 * 60 * 60 * 1000
  let high = new Date(Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, localSecond)).getTime() + 24 * 60 * 60 * 1000

  while (high - low > 1000) {
    // 1 second tolerance
    const mid = Math.floor((low + high) / 2)
    const testDate = new Date(mid)
    const parts = formatter.formatToParts(testDate)

    const tzYear = parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10)
    const tzMonth = parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10)
    const tzDay = parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10)
    const tzHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
    const tzMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
    const tzSecond = parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10)

    // Compare
    if (tzYear < localYear || (tzYear === localYear && tzMonth < localMonth) || (tzYear === localYear && tzMonth === localMonth && tzDay < localDay) || (tzYear === localYear && tzMonth === localMonth && tzDay === localDay && tzHour < localHour) || (tzYear === localYear && tzMonth === localMonth && tzDay === localDay && tzHour === localHour && tzMinute < localMinute) || (tzYear === localYear && tzMonth === localMonth && tzDay === localDay && tzHour === localHour && tzMinute === localMinute && tzSecond < localSecond)) {
      low = mid
    } else {
      high = mid
    }
  }

  return new Date(Math.round((low + high) / 2))
}

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
    const userTimezone = request.user!.timezone

    // Parse period string: YYYY-MM or YYYY-MM-DD
    const parts = query.period.split('-').map(Number)
    const year = parts[0]!
    const month = parts[1]!
    const day = parts[2]

    let localPeriodStart: { year: number; month: number; day: number; hour: number; minute: number; second: number }
    let localPeriodEnd: { year: number; month: number; day: number; hour: number; minute: number; second: number }

    if (query.view === 'daily' && day) {
      localPeriodStart = { year, month, day, hour: 0, minute: 0, second: 0 }
      localPeriodEnd = { year, month, day, hour: 23, minute: 59, second: 59 }
    } else if (query.view === 'monthly' || !day) {
      localPeriodStart = { year, month, day: 1, hour: 0, minute: 0, second: 0 }
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      localPeriodEnd = { year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0, second: 0 }
    } else if (query.view === 'quarterly') {
      const quarter = Math.ceil(month / 3)
      const quarterStart = (quarter - 1) * 3 + 1
      localPeriodStart = { year, month: quarterStart, day: 1, hour: 0, minute: 0, second: 0 }
      const quarterEnd = quarterStart + 2
      const endMonth = quarterEnd + 1
      const endYear = endMonth > 12 ? year + 1 : year
      localPeriodEnd = { year: endYear, month: endMonth > 12 ? endMonth - 13 : endMonth - 1, day: 1, hour: 0, minute: 0, second: 0 }
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
