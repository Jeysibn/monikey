/**
 * OCR.Space provider adapter.
 * Calls the free OCR.Space API to extract text from receipt images.
 * Quota enforcement is handled by the caller via tryConsumeApiQuota().
 */

import { AppError } from '../../../common/errors/appError.js'
import type { OcrInput, OcrProvider, OcrResult } from '../../interfaces/ocrProvider.js'

export interface OcrSpaceAdapterOptions {
  apiKey: string
  /** Base URL for the OCR.Space API (default: https://api.ocr.space/parse) */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number
}

/**
 * Live OCR.Space adapter. Makes actual HTTP requests to OCR.Space API.
 */
export class OcrSpaceAdapter implements OcrProvider {
  private apiKey: string
  private baseUrl: string
  private timeoutMs: number

  constructor(options: OcrSpaceAdapterOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl ?? 'https://api.ocr.space/parse'
    this.timeoutMs = options.timeoutMs ?? 30000
  }

  async extract(input: OcrInput): Promise<OcrResult> {
    try {
      const formData = new FormData()

      // Use compressed buffer if available (for size constraints), otherwise use original
      const buffer = input.compressedBuffer ?? input.buffer

      // Create a Blob from the buffer with the correct MIME type
      const blob = new Blob([buffer], { type: input.mimeType })
      formData.append('filename', input.filename)
      formData.append('filetype', input.mimeType)
      formData.append('apikey', this.apiKey)
      formData.append('isOverlayRequired', 'false')
      formData.append('language', 'eng')
      formData.append('file', blob, input.filename)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

      let response: Response
      try {
        response = await fetch(this.baseUrl, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        throw new AppError(
          'OCR_PROVIDER_ERROR',
          `OCR.Space API returned ${response.status}: ${response.statusText}`,
          { statusCode: 502 },
        )
      }

      interface OcrSpaceResponse {
        IsErroredOnProcessing?: boolean
        ErrorMessage?: string[]
        ParsedText?: string
      }

      const data = (await response.json()) as OcrSpaceResponse

      if (data.IsErroredOnProcessing) {
        const errorMsg = data.ErrorMessage?.join('; ') ?? 'Unknown OCR processing error'
        throw new AppError(
          'OCR_PROVIDER_ERROR',
          `OCR.Space processing failed: ${errorMsg}`,
          { statusCode: 502 },
        )
      }

      const text = data.ParsedText ?? ''
      if (!text.trim()) {
        throw new AppError(
          'OCR_NO_TEXT',
          'OCR.Space returned empty text. The image may not contain recognizable text.',
          { statusCode: 400 },
        )
      }

      return {
        text,
        provider: 'ocr-space',
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new AppError(
            'OCR_PROVIDER_TIMEOUT',
            'OCR.Space request timed out',
            { statusCode: 504 },
          )
        }

        throw new AppError(
          'OCR_PROVIDER_ERROR',
          `Failed to call OCR.Space: ${error.message}`,
          { statusCode: 502 },
        )
      }

      throw new AppError(
        'OCR_PROVIDER_ERROR',
        'Unknown error calling OCR.Space',
        { statusCode: 502 },
      )
    }
  }
}
