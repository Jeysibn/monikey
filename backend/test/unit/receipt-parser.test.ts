import { describe, expect, it } from 'vitest'
import { parseReceiptOcr } from '../../src/modules/receipts/receipt-parser.js'

describe('parseReceiptOcr', () => {
  it('normalizes dates and skips receipt headers when finding merchant', () => {
    const draft = parseReceiptOcr(`TAX INVOICE\n0917 123 4567\nBean & Brew Coffee\nDate: 09/01/2026\nTOTAL PHP 1,234.50`)
    expect(draft.merchant).toBe('Bean & Brew Coffee')
    expect(draft.date).toBe('2026-01-09')
    expect(draft.totalMinor).toBe(123450)
  })

  it('handles peso symbols and total due labels', () => {
    expect(parseReceiptOcr('SM Store\nTOTAL DUE ₱850.00')).toMatchObject({ totalMinor: 85000 })
  })
})
