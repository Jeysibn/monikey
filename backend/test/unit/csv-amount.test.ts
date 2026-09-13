import { describe, expect, it } from 'vitest'
import { parseAmount } from '../../src/modules/imports/imports.routes.js'

describe('parseAmount', () => {
  it('parses common currency and grouping formats exactly', () => {
    expect(parseAmount('₱1,234.56')).toBe(123456n)
    expect(parseAmount('1.234,50')).toBe(123450n)
    expect(parseAmount('1,234')).toBe(123400n)
  })

  it('preserves amounts beyond Number safe integer range', () => {
    expect(parseAmount('9007199254740991.23')).toBe(900719925474099123n)
  })

  it('rejects malformed, zero, and negative values', () => {
    expect(parseAmount('')).toBe(0n)
    expect(parseAmount('0.00')).toBe(0n)
    expect(parseAmount('-10.00')).toBe(0n)
    expect(parseAmount('12.345')).toBe(0n)
  })
})
