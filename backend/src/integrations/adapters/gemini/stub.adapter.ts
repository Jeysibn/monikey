/**
 * Deterministic stub AI provider for CI/testing and default out-of-the-box mode.
 * Returns predictable responses that conform to the actual Zod schemas without making real network calls.
 *
 * Used when GEMINI_API_KEY is not configured (the default deployment state).
 * Ensures insights work standalone with valid schema-conforming responses.
 */

import type { AiProvider, AiInsightResponse, StructuredAiRequest } from '../../interfaces/aiProvider.js'

export class StubAiAdapter implements AiProvider {
  async completeStructured<T = unknown>(request: StructuredAiRequest<T>): Promise<AiInsightResponse<T>> {
    // Detect insight type from the prompt to return appropriate stub data
    const prompt = request.prompt.toLowerCase()

    let stubContent: T

    if (prompt.includes('monthly summary')) {
      // MonthSummaryInsight schema
      stubContent = {
        summary:
          'This month shows moderate spending across categories. Configure GEMINI_API_KEY for live AI analysis.',
        income: 100000, // PHP 1000
        expenses: 50000, // PHP 500
        netCashFlow: 50000, // PHP 500
        topCategory: 'Food & Dining',
        topCategoryAmount: 20000, // PHP 200
        budgetStatus: 'On track',
        recommendations: [
          'Continue monitoring discretionary spending',
          'Consider meal planning to reduce food expenses',
        ],
      } as T
    } else if (prompt.includes('budget')) {
      // BudgetAnalysis schema
      stubContent = {
        summary:
          'Your budget utilization is healthy. Most categories remain within planned limits. Configure GEMINI_API_KEY for detailed analysis.',
        percentageUsed: 65,
        onTrack: true,
        riskyCategories: [],
        recommendations: ['Maintain current spending patterns', 'Review entertainment category next month'],
      } as T
    } else if (prompt.includes('categoriz') || prompt.includes('category')) {
      // TransactionCategorization schema
      stubContent = {
        suggestedCategory: 'Food & Dining',
        confidence: 0.85,
        reasoning:
          'The transaction description suggests a merchant in the food service industry. This is a stub response; configure GEMINI_API_KEY for live categorization.',
        alternativeCategories: ['Groceries', 'Entertainment'],
      } as T
    } else if (prompt.includes('trend')) {
      // SpendingTrends schema
      stubContent = {
        trend: 'stable',
        trendDescription:
          'Spending patterns remain consistent month-over-month. No significant changes detected. This is a stub response; configure GEMINI_API_KEY for live trend analysis.',
        highestSpendingCategory: 'Housing',
        lowestSpendingCategory: 'Entertainment',
        anomalies: [],
        insights: ['Spending is stable', 'No unusual patterns detected'],
      } as T
    } else if (prompt.includes('goal')) {
      // GoalProgressAnalysis schema
      stubContent = {
        summary:
          'Goal progress tracking is available with live AI analysis. Configure GEMINI_API_KEY for personalized insights.',
        onTrack: [],
        atRisk: [],
        completed: [],
        recommendations: ['Set specific financial goals to track progress', 'Review goals monthly for progress'],
      } as T
    } else {
      // Fallback for unknown types - return a reasonable default based on common fields
      stubContent = {
        summary:
          'This is a stub AI response. Configure GEMINI_API_KEY and AI_PROVIDER=gemini for live insights.',
      } as T
    }

    return {
      content: stubContent,
      model: 'stub',
      generatedAt: new Date().toISOString(),
      estimatedTokens: 100,
    }
  }
}

/**
 * Factory for creating a stub AI adapter.
 */
export function createStubAiAdapter(): AiProvider {
  return new StubAiAdapter()
}
