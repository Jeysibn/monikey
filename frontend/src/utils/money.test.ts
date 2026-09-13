import { describe, expect, it } from 'vitest'
import { parseMinorUnitInput } from './money'
import { formatMinorUnits } from './currency'

describe('parseMinorUnitInput', () => {
  it('preserves values beyond the safe JavaScript integer range', () => {
    expect(parseMinorUnitInput('9007199254740991.23')).toEqual({ ok: true, value: 900719925474099123n })
  })

  it('accepts grouped input and rejects excess precision', () => {
    expect(parseMinorUnitInput('1,250.50')).toEqual({ ok: true, value: 125050n })
    expect(parseMinorUnitInput('1.234').ok).toBe(false)
  })

  it('formats large API minor-unit values without narrowing them to Number', () => {
    expect(formatMinorUnits('900719925474099123')).toContain('₱9,007,199,254,740,991.23')
  })
})
