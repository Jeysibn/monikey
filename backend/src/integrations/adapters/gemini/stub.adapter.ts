/**
 * Deterministic stub AI provider for CI/testing.
 * Returns predictable responses without making real network calls.
 * Accepts any schema and returns valid (minimal) content matching it.
 */

import type { AiProvider, AiInsightResponse, StructuredAiRequest } from '../../interfaces/aiProvider.js'

export class StubAiAdapter implements AiProvider {
  async completeStructured<T = unknown>(_request: StructuredAiRequest<T>): Promise<AiInsightResponse<T>> {
    // Return a minimal valid response that satisfies most schemas.
    // In real tests, the caller provides a schema they control, so this stub
    // just needs to return *something* structured that won't crash the consumer.
    const stubContent: T = {
      summary: 'This is a stub AI response. Configure GEMINI_API_KEY and AI_PROVIDER=gemini for live insights.',
      categories: [],
      topSpending: [],
      goals: [],
    } as T

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
