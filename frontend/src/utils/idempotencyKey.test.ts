import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIdempotencyKey } from './idempotencyKey'

afterEach(() => vi.unstubAllGlobals())

describe('createIdempotencyKey', () => {
  it('uses randomUUID when the browser supports it', () => {
    const randomUUID = vi.fn(() => 'native-key')
    vi.stubGlobal('crypto', { randomUUID })

    expect(createIdempotencyKey()).toBe('native-key')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('uses Web Crypto random bytes when randomUUID is absent', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xab)
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    expect(createIdempotencyKey()).toMatch(/^fallback-[a-z0-9]+-(ab){12}$/)
    expect(getRandomValues).toHaveBeenCalledOnce()
  })

  it('still returns a non-empty fallback key when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined)

    expect(createIdempotencyKey()).toMatch(/^fallback-[a-z0-9]+-.+-.+$/)
  })
})
