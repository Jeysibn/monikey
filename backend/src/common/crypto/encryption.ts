/**
 * Encryption utilities for protecting sensitive data at rest (e.g., third-party API credentials).
 * Uses AES-256-GCM with keys derived via PBKDF2 from user-specific input.
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 16
const TAG_BYTES = 16
const KEY_LENGTH = 32
const PBKDF2_ITERATIONS = 100000
const PBKDF2_DIGEST = 'sha256'

/**
 * Derive a 256-bit key from a user-specific input and a server secret.
 * Uses PBKDF2 with SHA-256 to stretch the input into a cryptographically strong key.
 * @param userId - User ID (part of the key material)
 * @param encryptionSecret - Server-side secret (must be at least 32 chars)
 * @returns 32-byte buffer suitable for AES-256
 */
export function deriveKey(userId: string, encryptionSecret: string): Buffer {
  // Combine userId and secret as the input material
  const combined = `${userId}:${encryptionSecret}`

  // PBKDF2 with 100,000 iterations (standard for credential protection)
  return pbkdf2Sync(combined, 'monikey-import-tokens', PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST)
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param plaintext - The data to encrypt
 * @param key - 32-byte encryption key
 * @returns Base64-encoded string containing IV:tag:ciphertext
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = cipher.update(plaintext, 'utf8')
  cipher.final()

  const tag = cipher.getAuthTag()

  // Pack IV, tag, and ciphertext; encode as base64 for storage/transmission
  const packed = Buffer.concat([iv, tag, encrypted])
  return packed.toString('base64')
}

/**
 * Decrypt a ciphertext encrypted via encrypt().
 * @param ciphertext - Base64-encoded string from encrypt()
 * @param key - Same 32-byte key used to encrypt
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (e.g., wrong key, corrupted data, tampered with)
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  const packed = Buffer.from(ciphertext, 'base64')

  if (packed.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Invalid ciphertext: too short')
  }

  const iv = packed.slice(0, IV_BYTES)
  const tag = packed.slice(IV_BYTES, IV_BYTES + TAG_BYTES)
  const encrypted = packed.slice(IV_BYTES + TAG_BYTES)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}

/**
 * Convenience: encrypt a plaintext with user + secret (derives key internally).
 */
export function encryptForUser(plaintext: string, userId: string, encryptionSecret: string): string {
  const key = deriveKey(userId, encryptionSecret)
  return encrypt(plaintext, key)
}

/**
 * Convenience: decrypt a ciphertext with user + secret (derives key internally).
 */
export function decryptForUser(ciphertext: string, userId: string, encryptionSecret: string): string {
  const key = deriveKey(userId, encryptionSecret)
  return decrypt(ciphertext, key)
}
