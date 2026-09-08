/**
 * Generates an opaque key for retry-safe create requests.
 *
 * `crypto.randomUUID()` is preferred, but it is unavailable in some older or
 * non-secure browser contexts. Idempotency keys need uniqueness, not secrecy:
 * use cryptographic random bytes when available and retain a timestamp/random
 * fallback for environments that expose no Web Crypto implementation at all.
 */
export function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()

  const timestamp = Date.now().toString(36)
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(12))
    const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `fallback-${timestamp}-${suffix}`
  }

  return `fallback-${timestamp}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
