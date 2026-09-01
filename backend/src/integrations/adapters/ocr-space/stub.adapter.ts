/**
 * Stub OCR adapter for testing and CI.
 * Returns deterministic, fixture-based OCR text without making any network calls.
 * Never consumes real OCR.Space quota.
 */

import type { OcrInput, OcrProvider, OcrResult } from '../../interfaces/ocrProvider.js'

/**
 * Stub provider that returns a deterministic receipt-like text.
 * Used in tests and CI when INTEGRATIONS_MODE=stub or OCR_PROVIDER=stub.
 */
export class StubOcrAdapter implements OcrProvider {
  async extract(_input: OcrInput): Promise<OcrResult> {
    // Simulate a reasonable receipt OCR output with merchant, date, and total.
    const stubText = `MERCHANT NAME COFFEE SHOP
    123 Main Street
    City, State 12345

    Date: 2026-09-01
    Time: 10:30 AM

    Black Coffee         PHP 150.00
    Croissant            PHP 80.00
    ----
    Subtotal             PHP 230.00
    Tax                  PHP 10.00
    TOTAL                PHP 240.00

    Cash Payment         PHP 240.00
    Change               PHP 0.00

    Thank you for your purchase!`

    return {
      text: stubText,
      provider: 'stub',
      confidence: 0.95,
    }
  }
}
