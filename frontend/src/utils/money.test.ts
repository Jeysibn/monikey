import { describe, expect, it } from 'vitest'
import { parseMoneyInput } from './money'

describe('parseMoneyInput', () => {
  it('rejects blank input', () => {
    expect(parseMoneyInput('')).toEqual({ ok: false, error: 'Enter an amount.' })
    expect(parseMoneyInput('   ')).toEqual({ ok: false, error: 'Enter an amount.' })
  })

  it('rejects a signed-negative value by default', () => {
    const result = parseMoneyInput('-5')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('Amount can’t be negative.')
  })

  it('allows a negative value when explicitly opted in', () => {
    expect(parseMoneyInput('-5', { allowNegative: true })).toEqual({ ok: true, value: -5 })
  })

  it('rejects scientific notation', () => {
    const result = parseMoneyInput('1e6')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/scientific notation/i)
  })

  it('rejects non-finite values', () => {
    expect(parseMoneyInput('Infinity').ok).toBe(false)
    expect(parseMoneyInput('NaN').ok).toBe(false)
  })

  it('rejects multiple decimal separators', () => {
    const result = parseMoneyInput('1.2.3')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/single decimal point/i)
  })

  it('rejects more than two decimal places', () => {
    const result = parseMoneyInput('1.234')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/decimal places/i)
  })

  it('rejects malformed comma grouping', () => {
    expect(parseMoneyInput('1,25.75').ok).toBe(false)
    expect(parseMoneyInput('12,3').ok).toBe(false)
  })

  it('rejects stray characters', () => {
    expect(parseMoneyInput('$50').ok).toBe(false)
    expect(parseMoneyInput('50abc').ok).toBe(false)
    expect(parseMoneyInput('- -5').ok).toBe(false)
  })

  it('accepts whole numbers', () => {
    expect(parseMoneyInput('500')).toEqual({ ok: true, value: 500 })
  })

  it('accepts a single decimal place, normalized to a number', () => {
    expect(parseMoneyInput('0.5')).toEqual({ ok: true, value: 0.5 })
  })

  it('accepts exactly two decimal places', () => {
    expect(parseMoneyInput('0.50')).toEqual({ ok: true, value: 0.5 })
  })

  it('accepts comma thousands separators', () => {
    expect(parseMoneyInput('1,250.75')).toEqual({ ok: true, value: 1250.75 })
    expect(parseMoneyInput('1,000,000')).toEqual({ ok: true, value: 1000000 })
  })

  it('accepts large finite values', () => {
    expect(parseMoneyInput('9999999.99')).toEqual({ ok: true, value: 9999999.99 })
  })

  it('accepts a leading decimal point with no leading zero', () => {
    expect(parseMoneyInput('.5')).toEqual({ ok: true, value: 0.5 })
  })
})
