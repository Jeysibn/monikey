import { describe, expect, it } from 'vitest'
import {
  generateSessionToken,
  hashSessionToken,
  safeCompareHashes,
} from '../../src/common/auth/sessionToken.js'

describe('session token generation/hashing', () => {
  it('generates high-entropy, URL-safe, unique tokens', () => {
    const a = generateSessionToken()
    const b = generateSessionToken()
    expect(a).not.toBe(b)
    // 32 raw bytes -> 43 base64url characters (no padding).
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('hashes deterministically so the same raw token always looks up the same row', () => {
    const token = generateSessionToken()
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
  })

  it('produces a hash that never contains the raw token', () => {
    const token = generateSessionToken()
    const hash = hashSessionToken(token)
    expect(hash).not.toContain(token)
    expect(hash).toMatch(/^[a-f0-9]{64}$/) // sha256 hex
  })

  it('a single-character tamper to the raw token yields a completely different hash', () => {
    const token = generateSessionToken()
    const tampered = token[0] === 'A' ? 'B' + token.slice(1) : 'A' + token.slice(1)
    expect(hashSessionToken(tampered)).not.toBe(hashSessionToken(token))
  })

  describe('safeCompareHashes', () => {
    it('returns true for identical hashes', () => {
      const h = hashSessionToken(generateSessionToken())
      expect(safeCompareHashes(h, h)).toBe(true)
    })

    it('returns false for different hashes', () => {
      const h1 = hashSessionToken(generateSessionToken())
      const h2 = hashSessionToken(generateSessionToken())
      expect(safeCompareHashes(h1, h2)).toBe(false)
    })

    it('returns false (not throws) for mismatched lengths', () => {
      expect(safeCompareHashes('ab', 'abcd')).toBe(false)
    })
  })
})
