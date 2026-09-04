/**
 * OCR provider interface for receipt text extraction.
 * Implementations must handle provider-specific rate limiting, timeouts, and failures.
 * External OCR is disabled by default; enabled only when user opts in via settings.
 */

export interface OcrInput {
  /** Original filename for logging/metadata purposes only. */
  filename: string
  /** MIME type of the file. */
  mimeType: string
  /** File buffer contents. */
  buffer: Buffer
  /** Optional compressed/resized derivative for provider upload constraints. */
  compressedBuffer?: Buffer
}

export interface OcrResult {
  /** Raw OCR text output from the provider. */
  text: string
  /** OCR provider name (e.g., 'ocr-space', 'stub'). */
  provider: string
  /** Optional confidence or quality score if provider supplies it. */
  confidence?: number
}

export interface OcrProvider {
  /**
   * Extracts text from an image using the OCR provider.
   * Must not be called for every request — quota must be enforced by the caller.
   * Failures should return a rejected promise; never silently return empty text.
   */
  extract(input: OcrInput): Promise<OcrResult>
}
