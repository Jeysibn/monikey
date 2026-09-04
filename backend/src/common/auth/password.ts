import argon2 from 'argon2'

// Argon2id wrapper. argon2.verify() is constant-time-safe by design — never
// roll a manual string comparison against a stored hash.
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

/**
 * Returns true only for a matching plain/hash pair. Never throws for a
 * malformed/foreign hash — argon2.verify() rejects those, which we treat
 * as "does not match" rather than a 500.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}
