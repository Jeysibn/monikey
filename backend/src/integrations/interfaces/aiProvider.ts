/**
 * AI provider interface for structured financial insights.
 * Implementations must:
 * - send only aggregated/privacy-safe data (never raw PII, account numbers, credentials)
 * - validate model output with Zod schemas before returning
 * - fail gracefully without crashing on provider errors
 * - be strictly read-only (no LedgerModule mutations)
 *
 * Privacy rules (plan §16.7, §9.6):
 * - external AI off by default until user opts in via `externalAiEnabled`
 * - by default send aggregated values only (category totals, budget %, goal progress)
 * - transaction notes and merchant titles excluded unless user enables `detailedAiContextEnabled`
 * - never send: account numbers, last-four, credentials, session tokens, API keys, raw DB rows
 */

export interface StructuredAiRequest<_T = unknown> {
  /** The question/prompt to send to the model (already redacted per privacy policy). */
  prompt: string
  /**
   * Optional JSON schema (as a Zod schema or JSON Schema) that the model response must conform to.
   * If provided, the model output will be validated against this before returning.
   */
  schema?: unknown
  /** Optional structured conversation history for multi-turn context. */
  conversationHistory?: Array<{ role: string; content: string }>
  /**
   * Optional read-only finance tools the model can call (e.g., get_month_summary).
   * Each tool MUST be strictly read-only; no mutations allowed.
   */
  tools?: ReadOnlyFinanceTool[]
}

export interface ReadOnlyFinanceTool {
  name: string
  description: string
  /** Tool parameters (field names and types only; never pre-populated with user data). */
  parameters: Record<string, unknown>
}

export interface AiInsightResponse<T = unknown> {
  /** Structured model output (validated against the provided schema if applicable). */
  content: T
  /** The model used (e.g., 'gemini-2.0-flash'). */
  model: string
  /** ISO timestamp when the insight was generated. */
  generatedAt: string
  /** Estimated tokens consumed (for quota tracking). */
  estimatedTokens?: number
}

export interface AiProvider {
  /**
   * Sends a structured request to the AI model and returns a validated response.
   *
   * @param request - The prompt, schema, and optional tools/context.
   * @returns Promise resolving to an AiInsightResponse with validated content.
   * @throws Error if provider is unavailable, response is malformed, or validation fails.
   */
  completeStructured<T = unknown>(request: StructuredAiRequest<T>): Promise<AiInsightResponse<T>>
}
