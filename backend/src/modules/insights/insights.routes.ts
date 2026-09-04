/**
 * Insights module routes.
 *
 * Endpoints:
 * - POST /assistant/messages - Generate insights (monthly summary, analysis, etc.)
 * - POST /assistant/categorize-draft - Suggest category for a draft transaction
 *
 * All routes are gated by externalAiEnabled user preference.
 */

import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { createInsightsService } from './insights.service.js'
import type { AiProvider } from '../../integrations/interfaces/aiProvider.js'

const insightRequestSchema = z.object({
  type: z.enum(['monthly_summary', 'budget_analysis', 'spending_trends']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const categorizationRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  amount: z.number().int().optional(),
})

export interface InsightsRoutesOptions {
  prisma: PrismaClient
  aiProvider: AiProvider
  maxCallsPerDay: number
  maxCallsPerMonth: number
  appOrigin: string
}

/**
 * Registers insights routes under /api/v1/assistant/*
 */
export async function insightsRoutes(app: FastifyInstance, options: InsightsRoutesOptions) {
  const { prisma, aiProvider, maxCallsPerDay, maxCallsPerMonth, appOrigin } = options

  const service = createInsightsService({
    aiProvider,
    prisma,
    logger: app.log as any, // Fastify logger compatible with pino Logger
    maxCallsPerDay,
    maxCallsPerMonth,
  })

  const requireAuth = authGuard({ prisma })
  const requireOrigin = originCheckPreHandler({ APP_ORIGIN: appOrigin })

  app.addHook('preHandler', requireAuth)

  /**
   * POST /assistant/messages
   * Generate various financial insights (summary, analysis, etc.)
   */
  app.post('/assistant/messages', { preHandler: requireOrigin }, async (request, reply) => {
    const input = insightRequestSchema.parse(request.body)
    const userId = request.user!.id

    // Get user preferences
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    })

    if (!prefs?.externalAiEnabled) {
      return reply.code(403).send({
        error: {
          code: 'AI_INSIGHTS_DISABLED',
          message: 'AI insights are disabled. Enable in settings to use this feature.',
        },
      })
    }

    try {
      // Default period: current month
      const now = new Date()
      const periodStart = input.periodStart ? new Date(input.periodStart) : new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = input.periodEnd ? new Date(input.periodEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

      let insight: unknown

      switch (input.type) {
        case 'monthly_summary':
          insight = await service.generateMonthlySummary(userId, prefs, periodStart, periodEnd)
          break
        case 'budget_analysis':
          insight = await service.analyzeBudget(userId, prefs, periodStart, periodEnd)
          break
        case 'spending_trends':
          insight = await service.analyzeSpendingTrends(userId, prefs, periodStart, periodEnd)
          break
        default:
          return reply.code(400).send({
            error: {
              code: 'INVALID_TYPE',
              message: `Unknown insight type: ${input.type}`,
            },
          })
      }

      return reply.send({
        insight,
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      // Distinguish between user-facing errors and server errors
      if (errorMsg.includes('disabled') || errorMsg.includes('limit reached')) {
        return reply.code(403).send({
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errorMsg,
          },
        })
      }

      if (errorMsg.includes('malformed') || errorMsg.includes('validation')) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_RESPONSE',
            message: errorMsg,
          },
        })
      }

      app.log.error({ userId, error }, 'Insight generation failed')
      return reply.code(500).send({
        error: {
          code: 'INSIGHT_GENERATION_FAILED',
          message: 'Failed to generate insight. Please try again later.',
        },
      })
    }
  })

  /**
   * POST /assistant/categorize-draft
   * Suggest a category for a draft transaction using AI
   */
  app.post('/assistant/categorize-draft', { preHandler: requireOrigin }, async (request, reply) => {
    const input = categorizationRequestSchema.parse(request.body)
    const userId = request.user!.id

    // Get user preferences
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    })

    if (!prefs?.externalAiEnabled) {
      return reply.code(403).send({
        error: {
          code: 'AI_CATEGORIZATION_DISABLED',
          message: 'AI categorization is disabled. Enable in settings to use this feature.',
        },
      })
    }

    try {
      // Fetch available categories
      const categories = await prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true },
      })

      if (categories.length === 0) {
        return reply.code(400).send({
          error: {
            code: 'NO_CATEGORIES',
            message: 'No categories found. Create at least one category first.',
          },
        })
      }

      const categorization = await service.categorizeDraftTransaction(userId, prefs, input.title, categories)

      return reply.send(categorization)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      if (errorMsg.includes('limit reached')) {
        return reply.code(429).send({
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errorMsg,
          },
        })
      }

      app.log.error({ userId, title: input.title, error }, 'Categorization failed')
      return reply.code(500).send({
        error: {
          code: 'CATEGORIZATION_FAILED',
          message: 'Failed to categorize transaction. Please try again.',
        },
      })
    }
  })
}
