/**
 * Deterministic OCR text parser for receipt extraction.
 * Extracts candidate merchant name, date, total amount, and category.
 * Returns structured draft with confidence indicators for user review.
 */

export interface ReceiptDraft {
  merchant?: string
  date?: string
  totalMinor?: number
  category?: string
  confidence?: number
}

/**
 * Parses OCR text and extracts likely merchant, date, total, and category.
 * Uses simple heuristics: line position, currency patterns, date formats.
 * Confidence score is a rough estimate; user review is mandatory before posting.
 */
export function parseReceiptOcr(ocrText: string): ReceiptDraft {
  const draft: ReceiptDraft = {}
  let totalConfidence = 0
  let confidenceCount = 0

  const lines = ocrText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)

  // Extract merchant (usually first non-empty line)
  if (lines.length > 0) {
    const merchantCandidate = lines[0] ?? ''
    if (merchantCandidate && merchantCandidate.length < 100 && !merchantCandidate.match(/^\d+/)) {
      draft.merchant = merchantCandidate
      totalConfidence += 70
      confidenceCount += 1
    }
  }

  // Extract date using common patterns
  const datePatterns = [
    /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})/i,
  ]

  for (const pattern of datePatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      draft.date = match[1]
      totalConfidence += 50
      confidenceCount += 1
      break
    }
  }

  // Extract total amount (PHP currency marker)
  const totalPatterns = [
    /(?:TOTAL|Total|GRAND TOTAL|Grand Total|Amount Due)[\s:]*PHP\s*([\d,]+(?:\.\d{2})?)/i,
    /PHP\s*([\d,]+(?:\.\d{2})?)(?:\s|$)/,
  ]

  for (const pattern of totalPatterns) {
    const match = ocrText.match(pattern)
    if (match && match[1]) {
      const amountStr = match[1].replace(/,/g, '')
      const amountMajor = parseFloat(amountStr)
      if (!Number.isNaN(amountMajor) && amountMajor > 0) {
        // Convert to minor units (centavos, assuming PHP with 2 decimal places)
        draft.totalMinor = Math.round(amountMajor * 100)
        totalConfidence += 85
        confidenceCount += 1
        break
      }
    }
  }

  // Guess category based on merchant keywords (very heuristic)
  const categoryKeywords: Record<string, string> = {
    'restaurant|cafe|coffee|food|dining|pizza|burger|chicken': 'Food & Dining',
    'gas|fuel|petroleum|petrol': 'Transportation',
    'pharmacy|medicine|health': 'Health & Medical',
    'grocery|supermarket|market|walmart|store': 'Groceries',
    'hotel|motel|resort|accommodation': 'Travel & Lodging',
  }

  if (draft.merchant) {
    const merchantLower = draft.merchant.toLowerCase()
    for (const [keywords, category] of Object.entries(categoryKeywords)) {
      if (new RegExp(keywords).test(merchantLower)) {
        draft.category = category
        totalConfidence += 40
        confidenceCount += 1
        break
      }
    }
  }

  // Compute average confidence (0-100 scale)
  draft.confidence = confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 0

  return draft
}
