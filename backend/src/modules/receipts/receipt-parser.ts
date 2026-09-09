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

function normalizeDate(value: string): string | undefined {
  const cleaned = value.replace(/[.]/g, '/').trim()
  let match = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (match) return `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`

  match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (match) {
    const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!
    return `${year}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
  }

  const month = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/)
  if (month) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const monthIndex = months.findIndex((name) => name.startsWith(month[2]!.toLowerCase()))
    if (monthIndex >= 0) {
      const year = month[3]!.length === 2 ? `20${month[3]}` : month[3]!
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${month[1]!.padStart(2, '0')}`
    }
  }
  return undefined
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

  // Tesseract frequently returns a phone/address/header before the merchant.
  const merchantCandidate = lines.slice(0, 8).find((line) => {
    const lower = line.toLowerCase()
    return line.length >= 2 && line.length < 100 &&
      !/^\d[\d\s()+./-]*$/.test(line) &&
      !/(receipt|invoice|tax invoice|date|time|cashier|tel|phone|address|thank you)/i.test(lower) &&
      !/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(line)
  })
  if (merchantCandidate) {
      draft.merchant = merchantCandidate.replace(/\s{2,}/g, ' ')
      totalConfidence += 70
      confidenceCount += 1
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
      const normalized = normalizeDate(match[1]!)
      if (normalized) {
        draft.date = normalized
        totalConfidence += 50
        confidenceCount += 1
        break
      }
    }
  }

  // Extract total amount (PHP currency marker)
  const totalPatterns = [
    /(?:GRAND\s+TOTAL|TOTAL\s+DUE|AMOUNT\s+DUE|NET\s+TOTAL|TOTAL)[^\d]{0,20}(?:PHP|₱|P)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:PHP|₱|P)\s*([\d,]+(?:\.\d{1,2})?)(?:\s|$)/i,
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
