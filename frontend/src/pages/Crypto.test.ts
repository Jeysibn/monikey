import { describe, expect, it } from 'vitest'
import { formatMoney } from './Crypto'

describe('crypto money formatting', () => {
  it('preserves large decimal strings without Number conversion', () => {
    expect(formatMoney('9007199254740993.37', 'PHP')).toContain('9,007,199,254,740,993.37')
  })

  it('preserves negative values and cents', () => {
    expect(formatMoney('-1250.5', 'PHP')).toContain('-₱1,250.50')
  })
})
