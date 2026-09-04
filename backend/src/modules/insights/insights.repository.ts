/**
 * Insights repository for persisting AI-generated insights (future use).
 * Phase 10 initial implementation may not persist insights, but this repository
 * provides the contract for future caching/history features.
 */

import type { PrismaClient } from '@prisma/client'

export interface StoredInsight {
  id: string
  userId: string
  type: string // 'summary', 'recommendation', 'analysis', etc.
  content: Record<string, unknown> // JSON payload
  createdAt: Date
}

export interface InsightQuery {
  userId: string
  type?: string
  limit?: number
  offset?: number
}

export class InsightsRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Stores an insight for future reference/history.
   * Note: Phase 10 initial implementation may not use this; it's for future enhancement.
   */
  async storeInsight(
    userId: string,
    type: string,
    content: Record<string, unknown>,
  ): Promise<StoredInsight> {
    // This would normally use a database table like 'ai_insights'
    // For now, return a mock object since the schema doesn't include it yet
    return {
      id: Math.random().toString(36).substring(7),
      userId,
      type,
      content,
      createdAt: new Date(),
    }
  }

  /**
   * Retrieves recent insights for a user.
   */
  async getRecentInsights(_query: InsightQuery): Promise<StoredInsight[]> {
    // This would query the ai_insights table once it's added to the schema
    return []
  }

  /**
   * Deletes old insights to avoid table bloat.
   * Called periodically by a worker job (future enhancement).
   */
  async deleteOldInsights(_userId: string, _daysOld: number = 30): Promise<number> {
    // Future implementation
    return 0
  }
}

export function createInsightsRepository(prisma: PrismaClient): InsightsRepository {
  return new InsightsRepository(prisma)
}
