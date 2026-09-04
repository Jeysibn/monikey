/**
 * Insights service for generating AI-powered financial insights.
 *
 * Responsibilities:
 * - Check user opt-in and quotas before calling AI
 * - Build privacy-safe context
 * - Call AI provider with structured prompts
 * - Validate responses
 * - Return or persist results
 */

import type { PrismaClient } from '@prisma/client'
import type { Logger } from 'pino'
import type { AiProvider } from '../../integrations/interfaces/aiProvider.js'
import { buildPrivacySafeFinancialContext } from './contextBuilder.js'
import { tryConsumeApiQuota, dailyPeriod, type QuotaTrackingClient } from '../../integrations/quota/quota.js'
import type { MonthSummaryInsight, BudgetAnalysis, SpendingTrends, TransactionCategorization } from './schemas.js'
import { monthSummaryInsightSchema, budgetAnalysisSchema, spendingTrendsSchema, transactionCategorizationSchema, parseAndValidateInsight } from './schemas.js'

export interface InsightsServiceConfig {
  aiProvider: AiProvider
  prisma: PrismaClient
  logger: Logger
  maxCallsPerDay: number
  maxCallsPerMonth: number
}

export class InsightsService {
  private aiProvider: AiProvider
  private prisma: PrismaClient
  private logger: Logger
  private maxCallsPerDay: number
  private maxCallsPerMonth: number

  constructor(config: InsightsServiceConfig) {
    this.aiProvider = config.aiProvider
    this.prisma = config.prisma
    this.logger = config.logger
    this.maxCallsPerDay = config.maxCallsPerDay
    this.maxCallsPerMonth = config.maxCallsPerMonth
  }

  /**
   * Generates a monthly summary insight for the user.
   * Requires: externalAiEnabled=true, available quota
   *
   * @throws Error if user hasn't opted in, quota exceeded, or AI fails
   */
  async generateMonthlySummary(
    userId: string,
    userPreferences: { externalAiEnabled: boolean; detailedAiContextEnabled: boolean },
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MonthSummaryInsight> {
    // 1. Check opt-in
    if (!userPreferences.externalAiEnabled) {
      throw new Error('AI insights are disabled. Enable via settings to use this feature.')
    }

    // 2. Check quota
    const quotaAllowed = await tryConsumeApiQuota(
      this.prisma as unknown as QuotaTrackingClient,
      'gemini',
      dailyPeriod(),
      'monthly_summary',
      this.maxCallsPerDay,
    )

    if (!quotaAllowed) {
      this.logger.warn({ userId }, 'Gemini daily quota exhausted')
      throw new Error('Daily AI insight limit reached. Please try again tomorrow.')
    }

    // 3. Build privacy-safe context
    const context = await buildPrivacySafeFinancialContext(
      userId,
      this.prisma,
      userPreferences.detailedAiContextEnabled,
      periodStart,
      periodEnd,
    )

    // 4. Build prompt
    const prompt = `Based on the following financial data for the period ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}, provide a concise monthly summary insight:

${JSON.stringify(context, null, 2)}

Provide insights in JSON format with exactly this structure:
{
  "summary": "Brief summary of the month (2-3 sentences)",
  "income": <total income in minor units>,
  "expenses": <total expenses in minor units>,
  "netCashFlow": <net cash flow in minor units>,
  "topCategory": "Category with highest spending (or null)",
  "topCategoryAmount": <amount in minor units or null>,
  "budgetStatus": "Brief assessment",
  "recommendations": ["recommendation 1", "recommendation 2"]
}`

    // 5. Call AI provider
    try {
      const response = await this.aiProvider.completeStructured<MonthSummaryInsight>({
        prompt,
        schema: monthSummaryInsightSchema,
      })

      // 6. Validate response
      const validatedInsight = parseAndValidateInsight(response.content, monthSummaryInsightSchema)
      if (!validatedInsight) {
        this.logger.warn({ userId }, 'AI response failed validation for monthly summary')
        throw new Error('AI response was invalid or malformed. Please try again.')
      }

      return validatedInsight
    } catch (error) {
      this.logger.error({ userId, error }, 'Failed to generate monthly summary')
      throw error
    }
  }

  /**
   * Analyzes current budget status and provides insights.
   */
  async analyzeBudget(
    userId: string,
    userPreferences: { externalAiEnabled: boolean; detailedAiContextEnabled: boolean },
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BudgetAnalysis> {
    if (!userPreferences.externalAiEnabled) {
      throw new Error('AI insights are disabled. Enable via settings to use this feature.')
    }

    const quotaAllowed = await tryConsumeApiQuota(
      this.prisma as unknown as QuotaTrackingClient,
      'gemini',
      dailyPeriod(),
      'budget_analysis',
      this.maxCallsPerDay,
    )

    if (!quotaAllowed) {
      throw new Error('Daily AI insight limit reached. Please try again tomorrow.')
    }

    const context = await buildPrivacySafeFinancialContext(
      userId,
      this.prisma,
      userPreferences.detailedAiContextEnabled,
      periodStart,
      periodEnd,
    )

    const prompt = `Based on this financial data, analyze the budget status and provide actionable insights:

${JSON.stringify(context, null, 2)}

Respond in JSON format matching this structure:
{
  "summary": "Overview of current budget status",
  "percentageUsed": <number 0-100>,
  "onTrack": <boolean>,
  "riskyCategories": ["category 1", "category 2"],
  "recommendations": ["suggestion 1", "suggestion 2"]
}`

    try {
      const response = await this.aiProvider.completeStructured<BudgetAnalysis>({
        prompt,
        schema: budgetAnalysisSchema,
      })

      const validatedInsight = parseAndValidateInsight(response.content, budgetAnalysisSchema)
      if (!validatedInsight) {
        throw new Error('AI response validation failed')
      }

      return validatedInsight
    } catch (error) {
      this.logger.error({ userId, error }, 'Failed to analyze budget')
      throw error
    }
  }

  /**
   * Explains aggregate spending direction without granting the provider any
   * mutation capability. Like the other insight methods, this sends only the
   * privacy-safe context and validates the provider response before return.
   */
  async analyzeSpendingTrends(
    userId: string,
    userPreferences: { externalAiEnabled: boolean; detailedAiContextEnabled: boolean },
    periodStart: Date,
    periodEnd: Date,
  ): Promise<SpendingTrends> {
    if (!userPreferences.externalAiEnabled) {
      throw new Error('AI insights are disabled. Enable via settings to use this feature.')
    }

    const quotaAllowed = await tryConsumeApiQuota(
      this.prisma as unknown as QuotaTrackingClient,
      'gemini',
      dailyPeriod(),
      'spending_trends',
      this.maxCallsPerDay,
    )
    if (!quotaAllowed) {
      throw new Error('Daily AI insight limit reached. Please try again tomorrow.')
    }

    const context = await buildPrivacySafeFinancialContext(
      userId,
      this.prisma,
      userPreferences.detailedAiContextEnabled,
      periodStart,
      periodEnd,
    )
    const prompt = `Based on the following aggregated spending data for ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}, explain spending trends. This is read-only analysis; do not propose or perform account changes.

${JSON.stringify(context, null, 2)}

Respond in JSON format matching exactly:
{
  "trend": "increasing" | "decreasing" | "stable",
  "trendDescription": "Concise explanation",
  "highestSpendingCategory": "Category name or omitted",
  "lowestSpendingCategory": "Category name or omitted",
  "anomalies": ["unusual pattern"],
  "insights": ["read-only observation"]
}`

    try {
      const response = await this.aiProvider.completeStructured<SpendingTrends>({
        prompt,
        schema: spendingTrendsSchema,
      })
      const validatedInsight = parseAndValidateInsight(response.content, spendingTrendsSchema)
      if (!validatedInsight) {
        throw new Error('AI response validation failed')
      }
      return validatedInsight
    } catch (error) {
      this.logger.error({ userId, error }, 'Failed to analyze spending trends')
      throw error
    }
  }

  /**
   * Suggests a category for a transaction based on description/merchant.
   * Uses AI to disambiguate unclear transactions.
   */
  async categorizeDraftTransaction(
    userId: string,
    userPreferences: { externalAiEnabled: boolean },
    title: string,
    availableCategories: Array<{ id: string; name: string }>,
  ): Promise<TransactionCategorization> {
    if (!userPreferences.externalAiEnabled) {
      throw new Error('AI categorization requires opting in to AI features.')
    }

    const quotaAllowed = await tryConsumeApiQuota(
      this.prisma as unknown as QuotaTrackingClient,
      'gemini',
      dailyPeriod(),
      'transaction_categorization',
      this.maxCallsPerDay,
    )

    if (!quotaAllowed) {
      throw new Error('Daily AI limit reached. Please categorize manually or try again tomorrow.')
    }

    const categoryList = availableCategories.map((c) => c.name).join(', ')

    const prompt = `You are a financial assistant helping categorize a transaction.

Transaction: "${title}"

Available categories: ${categoryList}

Respond with a JSON object:
{
  "suggestedCategory": "The best matching category from the list above",
  "confidence": <0.0 to 1.0>,
  "reasoning": "Brief explanation",
  "alternativeCategories": ["other possible category"]
}

You MUST choose from the available categories list only. Never invent new categories.`

    try {
      const response = await this.aiProvider.completeStructured<TransactionCategorization>({
        prompt,
        schema: transactionCategorizationSchema,
      })

      const validatedCategorization = parseAndValidateInsight(response.content, transactionCategorizationSchema)
      if (!validatedCategorization) {
        throw new Error('Categorization validation failed')
      }

      return validatedCategorization
    } catch (error) {
      this.logger.error({ userId, title, error }, 'Failed to categorize transaction')
      throw error
    }
  }

  /**
   * Checks if the user has enough quota available for a new insight request.
   */
  async hasQuotaAvailable(_userId: string): Promise<boolean> {
    const allowed = await tryConsumeApiQuota(
      this.prisma as unknown as QuotaTrackingClient,
      'gemini',
      dailyPeriod(),
      'quota_check',
      this.maxCallsPerDay,
    )
    return allowed
  }
}

export function createInsightsService(config: InsightsServiceConfig): InsightsService {
  return new InsightsService(config)
}
