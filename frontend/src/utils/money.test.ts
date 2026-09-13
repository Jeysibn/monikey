import { describe, expect, it } from 'vitest'
import { boundedDecimalToNumber, majorNumberToMinorUnits, minorUnitsToMajorNumber, parseMinorUnitInput } from './money'
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

describe('minorUnitsToMajorNumber', () => {
  it('converts API decimal strings only inside the exact integer range', () => {
    expect(minorUnitsToMajorNumber('125050')).toBe(1250.5)
    expect(minorUnitsToMajorNumber('-640')).toBe(-6.4)
    expect(minorUnitsToMajorNumber(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER / 100)
  })

  it('fails closed instead of silently rounding unsafe or malformed values', () => {
    expect(() => minorUnitsToMajorNumber('9007199254740992')).toThrow(RangeError)
    expect(() => minorUnitsToMajorNumber('12.34')).toThrow(TypeError)
    expect(() => minorUnitsToMajorNumber('not-money')).toThrow(TypeError)
  })
})

describe('majorNumberToMinorUnits', () => {
  it('serializes finite numeric domain values as exact decimal strings', () => {
    expect(majorNumberToMinorUnits(1250.5)).toBe('125050')
    expect(majorNumberToMinorUnits(19.99)).toBe('1999')
  })

  it('rejects non-finite and unsafe transport values', () => {
    expect(() => majorNumberToMinorUnits(Number.NaN)).toThrow(TypeError)
    expect(() => majorNumberToMinorUnits(Number.MAX_SAFE_INTEGER)).toThrow(RangeError)
  })
})

describe('boundedDecimalToNumber', () => {
  it('allows explicitly bounded visual calculations', () => {
    expect(boundedDecimalToNumber('18.5', { min: -100, max: 100 })).toBe(18.5)
  })

  it('rejects non-decimal and out-of-range visual values', () => {
    expect(() => boundedDecimalToNumber('Infinity', { min: 0, max: 100 })).toThrow(TypeError)
    expect(() => boundedDecimalToNumber('101', { min: 0, max: 100 })).toThrow(RangeError)
  })
})
