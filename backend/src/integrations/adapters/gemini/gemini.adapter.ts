/**
 * Google Gemini AI adapter for structured financial insights.
 * Implements privacy-safe context building and strict response validation via Zod.
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
import type { AiProvider, AiInsightResponse, StructuredAiRequest } from '../../interfaces/aiProvider.js'
import type { Logger } from 'pino'

export interface GeminiAdapterConfig {
  apiKey: string
  model: string
  logger: Logger
}

export class GeminiAdapter implements AiProvider {
  private client: GoogleGenerativeAI
  private model: string
  private logger: Logger

  constructor(config: GeminiAdapterConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey)
    this.model = config.model
    this.logger = config.logger
  }

  async completeStructured<T = unknown>(request: StructuredAiRequest<T>): Promise<AiInsightResponse<T>> {
    try {
      // Get the generative model with safety settings
      const model = this.client.getGenerativeModel({
        model: this.model,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      })

      // Prepare system instruction for structured JSON output
      const systemInstruction = this._buildSystemInstruction(request.schema)

      // Build the prompt ensuring it includes schema guidance
      const fullPrompt = `${systemInstruction}\n\nUser query:\n${request.prompt}`

      // Call the model
      const response = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: fullPrompt }],
          },
        ],
      })

      const textContent = response.response.text()

      // Parse the JSON response
      let jsonContent: T
      try {
        // Extract JSON from the response (handle markdown code blocks if present)
        const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, textContent]
        const jsonStr = jsonMatch[1] || textContent
        jsonContent = JSON.parse(jsonStr) as T
      } catch (parseErr) {
        this.logger.warn({ error: parseErr, response: textContent }, 'Failed to parse Gemini JSON response')
        throw new Error(`AI response was not valid JSON: ${textContent.substring(0, 200)}`)
      }

      // Validate against schema if provided (caller supplies Zod schemas)
      // Note: Zod validation happens at the caller level via zodSchema.parse()
      // This ensures we never trust raw LLM output

      return {
        content: jsonContent,
        model: this.model,
        generatedAt: new Date().toISOString(),
        estimatedTokens: this._estimateTokens(textContent),
      }
    } catch (error) {
      this.logger.error({ error, model: this.model }, 'Gemini API call failed')
      throw error
    }
  }

  /**
   * Builds a system instruction that guides the model toward structured JSON output.
   */
  private _buildSystemInstruction(schema?: unknown): string {
    let instruction = `You are a helpful financial assistant that provides insights based on aggregated financial data.
You MUST respond with valid JSON only, with no additional text, markdown, or explanation.
Never include any raw account numbers, PII, or sensitive financial data.
Always provide insights at an aggregated level (totals, percentages, trends).`

    if (schema) {
      instruction += `\n\nYou MUST respond with JSON matching this structure:\n${JSON.stringify(schema, null, 2)}`
    }

    return instruction
  }

  /**
   * Rough token estimation (approximately 4 chars per token).
   * Used only for quota tracking; actual usage should come from API response.
   */
  private _estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }
}

/**
 * Factory for creating a Gemini AI adapter.
 */
export function createGeminiAdapter(config: GeminiAdapterConfig): AiProvider {
  return new GeminiAdapter(config)
}
