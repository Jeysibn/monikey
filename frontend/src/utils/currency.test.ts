import { describe, expect, it } from 'vitest'
import { formatMinorUnits, formatMoney } from './currency'

describe('formatMinorUnits', () => {
  it('formats positive, zero and exact large values without float loss', () => {
    expect(formatMinorUnits('812045')).toBe('₱8,120.45')
    expect(formatMinorUnits(0n)).toBe('₱0.00')
    expect(formatMinorUnits('9007199254740993')).toBe('₱90,071,992,547,409.93')
  })
  it('puts the minus sign before the currency symbol', () => {
    expect(formatMinorUnits('-820')).toBe('-₱8.20')
    expect(formatMinorUnits(-5n)).toBe('-₱0.05')
    expect(formatMinorUnits('-820', { withCents: false })).toBe('-₱8')
  })
  it('agrees with formatMoney on sign placement', () => {
    expect(formatMinorUnits('-820')).toBe(formatMoney(-8.2))
  })
})
