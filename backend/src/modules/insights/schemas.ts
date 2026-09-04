/**
 * Zod schemas for validating AI responses.
 *
 * CRITICAL: The AI model can hallucinate or return malformed JSON.
 * Every response MUST be validated against a Zod schema before it is:
 * - persisted to the database
 * - returned to the frontend
 * - used to influence any financial decision
 *
 * The schema itself is what the model is instructed to follow; validation
 * ensures it actually did.
 */

import { z } from 'zod'

/**
 * Schema for month summary insights.
 * Model is instructed to return exactly this shape.
 */
export const monthSummaryInsightSchema = z.object({
  summary: z.string().describe('Brief summary of the month (2-3 sentences)'),
  income: z.number().int().describe('Total income in minor units (e.g., PHP centavos)'),
  expenses: z.number().int().describe('Total expenses in minor units'),
  netCashFlow: z.number().int().describe('Net cash flow (income - expenses) in minor units'),
  topCategory: z.string().optional().describe('Category with highest spending'),
  topCategoryAmount: z.number().int().optional().describe('Amount spent in top category (minor units)'),
  budgetStatus: z.string().optional().describe('Brief assessment of budget utilization (e.g., "On track", "Overspent")'),
  recommendations: z.array(z.string()).optional().describe('1-3 actionable recommendations for next month'),
})

export type MonthSummaryInsight = z.infer<typeof monthSummaryInsightSchema>

/**
 * Schema for transaction categorization draft.
 * Model helps assign a category to ambiguous expense transactions.
 */
export const transactionCategorizationSchema = z.object({
  suggestedCategory: z.string().describe('Recommended category name (must match known categories)'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0.0-1.0)'),
  reasoning: z.string().describe('Brief explanation for the categorization'),
  alternativeCategories: z.array(z.string()).optional().describe('Other plausible categories'),
})

export type TransactionCategorization = z.infer<typeof transactionCategorizationSchema>

/**
 * Schema for budget analysis insights.
 */
export const budgetAnalysisSchema = z.object({
  summary: z.string().describe('Overview of current budget status'),
  percentageUsed: z.number().min(0).max(100).describe('Budget utilization percentage'),
  onTrack: z.boolean().describe('Whether the user is on track to stay within budget'),
  riskyCategories: z.array(z.string()).optional().describe('Categories approaching or exceeding budget'),
  recommendations: z.array(z.string()).optional().describe('Suggestions to stay on budget'),
})

export type BudgetAnalysis = z.infer<typeof budgetAnalysisSchema>

/**
 * Schema for spending trends analysis.
 */
export const spendingTrendsSchema = z.object({
  trend: z.enum(['increasing', 'decreasing', 'stable']).describe('Overall spending trend'),
  trendDescription: z.string().describe('Explanation of the trend'),
  highestSpendingCategory: z.string().optional(),
  lowestSpendingCategory: z.string().optional(),
  anomalies: z.array(z.string()).optional().describe('Unusual spending patterns'),
  insights: z.array(z.string()).optional().describe('Key insights about spending behavior'),
})

export type SpendingTrends = z.infer<typeof spendingTrendsSchema>

/**
 * Schema for goal progress analysis.
 */
export const goalProgressAnalysisSchema = z.object({
  summary: z.string().describe('Summary of goal progress'),
  onTrack: z.array(z.string()).optional().describe('Goals on track to completion'),
  atRisk: z.array(z.string()).optional().describe('Goals at risk of missing target date'),
  completed: z.array(z.string()).optional().describe('Recently completed goals'),
  recommendations: z.array(z.string()).optional().describe('Suggestions to improve goal progress'),
})

export type GoalProgressAnalysis = z.infer<typeof goalProgressAnalysisSchema>

/**
 * Generic insight response wrapper.
 */
export const insightResponseSchema = z.object({
  type: z.enum(['summary', 'recommendation', 'analysis']).describe('Type of insight'),
  content: z.string().describe('The main insight text'),
  timestamp: z.string().describe('ISO timestamp when generated'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence in the insight'),
})

export type InsightResponse = z.infer<typeof insightResponseSchema>

/**
 * Helper to safely parse and validate AI responses.
 * Returns null if validation fails, never throws.
 */
export function parseAndValidateInsight<T>(
  response: unknown,
  schema: z.ZodSchema<T>,
): T | null {
  try {
    return schema.parse(response)
  } catch {
    // Validation failed; return null instead of throwing
    // The caller should treat null as "AI response was invalid, treat as unavailable"
    return null
  }
}
