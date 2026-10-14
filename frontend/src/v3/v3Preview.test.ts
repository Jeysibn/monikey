import { afterEach, describe, expect, it } from 'vitest'
import { isV3PreviewEnabled, setV3PreviewEnabled, v3QueryOverride, V3_PREVIEW_STORAGE_KEY } from './v3Preview'

afterEach(() => localStorage.clear())

describe('V3 preview flag', () => {
  it('is off by default', () => {
    expect(isV3PreviewEnabled()).toBe(false)
  })
  it('persists opt-in and opt-out', () => {
    setV3PreviewEnabled(true)
    expect(localStorage.getItem(V3_PREVIEW_STORAGE_KEY)).toBe('1')
    expect(isV3PreviewEnabled()).toBe(true)
    setV3PreviewEnabled(false)
    expect(isV3PreviewEnabled()).toBe(false)
  })
  it('parses only ?v3=1 and ?v3=0', () => {
    expect(v3QueryOverride('?v3=1')).toBe(true)
    expect(v3QueryOverride('?x=2&v3=0')).toBe(false)
    expect(v3QueryOverride('?v3=yes')).toBeNull()
    expect(v3QueryOverride('')).toBeNull()
  })
})
