import { describe, expect, it } from 'vitest'
import { detectCsvPreset, normalizeCsvHeader } from '../../src/modules/imports/imports.routes.js'

function headers(...values: string[]) {
  return new Map(values.map((value, index) => [normalizeCsvHeader(value), index]))
}

describe('CSV import presets', () => {
  it('keeps the generic date/amount/description contract', () => {
    const preset = detectCsvPreset(headers('date', 'amount', 'description', 'merchant'))
    expect(preset.name).toBe('generic')
    expect(preset.columns).toEqual({ date: 0, amount: 1, description: 2, merchant: 3 })
    expect(preset.amountColumns).toBeUndefined()
  })

  it('maps bank debit and credit columns without floating-point parsing', () => {
    const preset = detectCsvPreset(headers('Transaction Date', 'Particulars', 'Debit', 'Credit'))
    expect(preset.name).toBe('bank debit/credit')
    expect(preset.columns.date).toBe(0)
    expect(preset.columns.description).toBe(1)
    expect(preset.amountColumns).toEqual({ debit: 2, credit: 3 })
  })

  it('recognizes provider-labelled Philippine exports as templates', () => {
    for (const provider of ['BPI', 'BDO', 'UnionBank', 'GCash', 'Maya']) {
      const preset = detectCsvPreset(headers('Date', 'Description', 'Amount', provider))
      expect(preset.name).toBe(provider)
    }
  })
})
