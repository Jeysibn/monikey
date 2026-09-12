import { describe, expect, it } from 'vitest'
import { decryptForUser, encryptForUser } from '../../src/common/crypto/encryption.js'

describe('versioned credential encryption', () => {
  it('writes a versioned envelope and round-trips', () => {
    const encrypted = encryptForUser('plaid-token', 'user-1', 'a'.repeat(32))
    expect(encrypted.startsWith('v1.')).toBe(true)
    expect(decryptForUser(encrypted, 'user-1', 'a'.repeat(32))).toBe('plaid-token')
  })

  it('rejects unknown envelope versions', () => {
    expect(() => decryptForUser('v99.invalid', 'user-1', 'a'.repeat(32))).toThrow(/version/)
  })

  it('supports decrypting a credential and re-encrypting it with a rotated secret', () => {
    const previous = 'a'.repeat(32)
    const next = 'b'.repeat(32)
    const legacyCiphertext = encryptForUser('plaid-token', 'user-1', previous)
    const plaintext = decryptForUser(legacyCiphertext, 'user-1', previous)
    const rotatedCiphertext = encryptForUser(plaintext, 'user-1', next)

    expect(decryptForUser(rotatedCiphertext, 'user-1', next)).toBe('plaid-token')
    expect(() => decryptForUser(rotatedCiphertext, 'user-1', previous)).toThrow()
  })
})
