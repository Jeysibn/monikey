import type { LoggerOptions } from 'pino'
import type { Env } from './env.ts'

// --- Secret redaction ------------------------------------------------------
//
// QA Attempt 1 (Finding 3) proved that Pino's built-in `redact.paths` (fixed
// dot-paths + single-level `*` wildcards) cannot cover secrets at arbitrary
// depth, under arbitrary key casing (`GEMINI_API_KEY`, `x-api-key`), or
// embedded inside a value rather than named by a key (a `DATABASE_URL`
// connection string's password). We use `formatters.log` instead: Pino
// calls this for every log call with the full merged log object, and
// whatever it returns is what actually gets serialized — so a full
// recursive walk of the entire object (not just declared paths) is exactly
// the right seam.
//
// Coverage this provides (all case-insensitive, at any nesting depth):
// - any key whose name contains: password, secret, token, api[-_]?key,
//   authorization, cookie, credential — including SCREAMING_SNAKE_CASE env
//   var names (GEMINI_API_KEY, RESEND_API_KEY, PLAID_SECRET, DATABASE_URL —
//   see below) and header-cased names (x-api-key, Authorization, Cookie).
// - any *value* (regardless of its key name) that is a connection-string
//   shaped like `scheme://user:password@host` — the password segment is
//   redacted in place so a `DATABASE_URL` leaking through an unexpected key,
//   or through a wrapping object, is still caught.
//
// Do not log secrets and rely on redaction as a first line of defense —
// this exists as a safety net, not a license to pass raw credentials into
// `log.info(...)`.

const SECRET_KEY_PATTERN = /(pass(word)?|secret|token|api[_-]?key|auth(orization)?|cookie|credential)/i

// Matches `scheme://user:password@host...` and captures the password
// segment so only it is replaced, keeping the rest of the string (host,
// scheme) visible for debugging.
const CONNECTION_STRING_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+:)([^@/\s]+)(@.+)$/

const REDACTED = '[REDACTED]'
const MAX_DEPTH = 12

function scrubString(value: string): string {
  const match = CONNECTION_STRING_PATTERN.exec(value)
  if (match) {
    return `${match[1]}${REDACTED}${match[3]}`
  }
  return value
}

/**
 * Recursively redacts secret-shaped keys/values in a log object. Exported
 * for unit testing independent of a live Pino instance.
 */
export function deepRedact(input: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (depth > MAX_DEPTH || input === null || input === undefined) {
    return input
  }

  if (typeof input === 'string') {
    return scrubString(input)
  }

  if (typeof input !== 'object') {
    return input
  }

  if (seen.has(input as object)) {
    return '[CIRCULAR]'
  }
  seen.add(input as object)

  if (Array.isArray(input)) {
    return input.map((item) => deepRedact(item, depth + 1, seen))
  }

  if (input instanceof Error) {
    // Preserve Error shape (message/stack) but still scrub any secret-named
    // own-enumerable properties attached to it (e.g. err.config.password).
    const err = input as Error & Record<string, unknown>
    const clone: Record<string, unknown> = { message: err.message, stack: err.stack, name: err.name }
    for (const key of Object.keys(err)) {
      clone[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : deepRedact(err[key], depth + 1, seen)
    }
    return clone
  }

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = REDACTED
    } else {
      output[key] = deepRedact(value, depth + 1, seen)
    }
  }
  return output
}

export function buildLoggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    formatters: {
      log(object) {
        return deepRedact(object) as Record<string, unknown>
      },
    },
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  }
}
