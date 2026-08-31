import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

// Opaque, high-entropy session tokens. The raw token is sent to the browser
// only inside the HttpOnly cookie value; only its SHA-256 hash is ever
// persisted (`user_sessions.token_hash`). Never log either the raw token or
// its hash — both are secret-shaped and would defeat rotation if leaked.

const TOKEN_BYTES = 32 // 256 bits of entropy, well above the 32-byte minimum called for in the plan.

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

/** Constant-time comparison of two hash strings, to avoid timing side-channels on lookup mismatches. */
export function safeCompareHashes(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
