/**
 * Local OCR provider backed by Tesseract.js.
 * Recognition runs in-process and does not call a hosted OCR service.
 */

import { createWorker } from 'tesseract.js'
import { AppError } from '../../../common/errors/appError.js'
import type { OcrInput, OcrProvider, OcrResult } from '../../interfaces/ocrProvider.js'

export class TesseractOcrAdapter implements OcrProvider {
  async extract(input: OcrInput): Promise<OcrResult> {
    const worker = await createWorker('eng')

    try {
      const result = await worker.recognize(input.compressedBuffer ?? input.buffer)
      const text = result.data.text.trim()

      if (!text) {
        throw new AppError(
          'OCR_NO_TEXT',
          'Local OCR returned empty text. The image may not contain recognizable text.',
          { statusCode: 400 },
        )
      }

      return {
        text,
        provider: 'tesseract',
        confidence: result.data.confidence / 100,
      }
    } catch (error) {
      if (error instanceof AppError) throw error

      throw new AppError(
        'OCR_PROCESSING_FAILED',
        `Local OCR failed: ${error instanceof Error ? error.message : String(error)}`,
        { statusCode: 422 },
      )
    } finally {
      await worker.terminate()
    }
  }
}
