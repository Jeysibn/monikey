import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/common/auth/password.js'

describe('password hashing (Argon2id)', () => {
  it('produces an argon2id-tagged hash distinct from the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toContain('correct horse battery staple')
  })

  it('verifies a matching password', async () => {
    const hash = await hashPassword('s3cret-P@ssw0rd')
    await expect(verifyPassword(hash, 's3cret-P@ssw0rd')).resolves.toBe(true)
  })

  it('rejects a non-matching password', async () => {
    const hash = await hashPassword('s3cret-P@ssw0rd')
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false)
  })

  it('produces a different hash for the same password on each call (random salt)', async () => {
    const a = await hashPassword('same-input')
    const b = await hashPassword('same-input')
    expect(a).not.toBe(b)
  })

  it('does not throw on a malformed/foreign hash — treats it as a mismatch', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false)
  })
})
