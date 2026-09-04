import type { LoggerOptions } from 'pino'
import type { Env } from './env.ts'

// --- Secret redaction ------------------------------------------------------
//
// QA Attempt 1 (Finding 3) proved that Pino's built-in `redact.paths` (fixed
// dot-paths + single-level `*` wildcards) cannot cover secrets at arbitrary
// depth, under arbitrary key casing (`GEMINI_API_KEY`, `x-api-key`), or
// embedded inside a value rather than named by a key (a `DATABASE_URL`
// connection string's password). We use `formatters.log` to redact ordinary
// application-logged fields, and dedicated `serializers.{req,res,err}` for
// request/response logging specifically — see the next comment block for
// why those need separate handling.
//
// QA Attempt 2 (Finding D1) proved a real regression the first version of
// this file introduced: `formatters.log` runs BEFORE Pino applies
// `serializers`, so at the point our old single deep-walker saw `req`/`res`,
// they were still Fastify's *live* request/reply objects — not yet
// converted to plain data. Fastify's `method`/`url`/`statusCode` etc. are
// defined as non-enumerable getters, invisible to both `Object.entries()`
// (own-enumerable only) and a `for...in` walk (own+inherited enumerable,
// but still enumerable-only) — so the old walker saw no data on them and
// silently turned every request log line into `"req":{}` / `"res":{}"`.
// Worse, `for...in` on a live request DOES enumerate its real own property
// `raw` (the underlying Node `http.IncomingMessage` — huge, circular,
// full of sockets/buffers), so naively walking it deeper would have been
// its own hazard.
//
// The fix: `req`/`res`/`err` are excluded from the generic `formatters.log`
// walk and handled instead by dedicated `serializers` functions that (a)
// explicitly read the well-known fields by direct property access (which
// *does* invoke a non-enumerable getter, unlike enumeration) for a genuine
// live Fastify request/reply — recognized by the presence of its `raw`
// property — normalizing to the same small, safe shape Fastify's own
// default serializers produce (`method`/`url`/`host`/`remoteAddress`/
// `remotePort` for requests, `statusCode` for responses), then (b) run
// `deepRedact` over that normalized shape. A manually-logged plain object
// under a `req`/`res`/`err` key (no `raw` property — e.g. a test
// reproducing a leak with a bare `{ headers: {...} } }` literal) skips the
// normalization step and goes straight to the ordinary recursive
// `deepRedact` walk, unchanged from before.
//
// Verified against a REAL Fastify app emitting REAL request log lines in
// `backend/test/integration/logger.pipeline.test.ts` — not just by calling
// `deepRedact()` on plain object literals (QA Attempt 2, Findings D1/D3/D7:
// testing the helper in isolation had proven nothing about the real
// pipeline, which is exactly how the D1 regression shipped unnoticed).
//
// Coverage this provides (all case-insensitive, at any nesting depth, for
// both ordinary application-logged fields and normalized req/res/err data):
// - any key whose name contains: password, pwd, secret, token, bearer,
//   api[-_]?key, private[-_]?key, authorization, cookie, credential —
//   including SCREAMING_SNAKE_CASE env var names (GEMINI_API_KEY,
//   RESEND_API_KEY, PLAID_SECRET, DATABASE_URL — see below) and
//   header-cased names (x-api-key, Authorization, Cookie).
// - any *value* (regardless of its key name) that is a connection-string
//   shaped like `scheme://[user][:password]@host` — including an empty
//   username, e.g. `postgres://:password@host/db` (QA Attempt 2, Finding
//   D5) — the password segment is redacted in place so a `DATABASE_URL`
//   leaking through an unexpected key, or through a wrapping object, is
//   still caught.
// - secret-shaped query-string parameters embedded in a URL/path value
//   (e.g. `req.url` = `/api/v1/foo?token=abc`), per plan §16.6's explicit
//   requirement to redact query keys (QA Attempt 2, Finding D5).
//
// Do not log secrets and rely on redaction as a first line of defense —
// this exists as a safety net, not a license to pass raw credentials into
// `log.info(...)`.

const SECRET_KEY_PATTERN =
  /(pass(word)?|pwd|secret|token|bearer|api[_-]?key|private[_-]?key|auth(orization)?|cookie|credential)/i

// Matches `scheme://[user][:password]@host...` and captures the password
// segment so only it is replaced, keeping the rest of the string (host,
// scheme, and an optionally-empty username) visible for debugging.
const CONNECTION_STRING_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]*:)([^@/\s]+)(@.+)$/

const REDACTED = '[REDACTED]'
const MAX_DEPTH = 12

function scrubQueryString(value: string): string {
  return value.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, sep: string, key: string) => {
    let decodedKey = key
    try {
      decodedKey = decodeURIComponent(key)
    } catch {
      // malformed percent-encoding — fall back to the raw key for matching
    }
    return SECRET_KEY_PATTERN.test(decodedKey) ? `${sep}${key}=${REDACTED}` : match
  })
}

function scrubString(value: string): string {
  const connectionMatch = CONNECTION_STRING_PATTERN.exec(value)
  if (connectionMatch) {
    return `${connectionMatch[1]}${REDACTED}${connectionMatch[3]}`
  }
  if (value.includes('?') && value.includes('=')) {
    return scrubQueryString(value)
  }
  return value
}

/**
 * Recursively redacts secret-shaped keys/values in a plain object/array.
 * Exported for unit testing independent of a live Pino instance, but the
 * authoritative coverage is `logger.pipeline.test.ts`'s real Fastify+Pino
 * tests — see the file header comment.
 *
 * Walks own AND inherited enumerable properties (`for...in`), not just
 * `Object.entries()`'s own-enumerable-only set. Never called directly on a
 * live Fastify request/reply — see `normalizeRequestLike`/
 * `normalizeResponseLike` below, which convert those to a plain shape
 * first specifically so this function never has to walk `raw`/`socket`.
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
    // properties attached to it (e.g. err.config.password) — `message` and
    // `stack` are own but non-enumerable, so they're pulled out explicitly
    // rather than relying on enumeration.
    const err = input as Error & Record<string, unknown>
    const clone: Record<string, unknown> = { message: err.message, stack: err.stack, name: err.name }
    for (const key in err) {
      clone[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : deepRedact(err[key], depth + 1, seen)
    }
    return clone
  }

  const output: Record<string, unknown> = {}
  for (const key in input as Record<string, unknown>) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === 'function') {
      continue
    }
    output[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : deepRedact(value, depth + 1, seen)
  }
  return output
}

interface SocketLike {
  remotePort?: unknown
  remoteAddress?: unknown
}

/**
 * Converts a value into the small, safe shape `deepRedact` can walk. A
 * genuine live Fastify request always carries a `raw` property (the
 * underlying Node `IncomingMessage`) — recognized here so we know to pull
 * fields out by direct property access (invoking any getter) rather than
 * enumerate, and so we never walk into `raw`/`socket`/`log`. A manually
 * constructed plain object (no `raw`) is returned unchanged and handled by
 * `deepRedact`'s ordinary walk, exactly as before this fix.
 */
function normalizeRequestLike(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || !('raw' in value)) {
    return value
  }
  const v = value as Record<string, unknown> & { socket?: SocketLike }
  return {
    method: v.method,
    url: v.url,
    host: v.host ?? v.hostname,
    remoteAddress: v.ip ?? v.socket?.remoteAddress,
    remotePort: v.socket?.remotePort,
  }
}

/** Same idea as `normalizeRequestLike`, for Fastify's reply object. */
function normalizeResponseLike(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || !('raw' in value)) {
    return value
  }
  const v = value as Record<string, unknown>
  return { statusCode: v.statusCode }
}

export function buildLoggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    formatters: {
      log(object) {
        if (object === null || typeof object !== 'object') {
          return object as Record<string, unknown>
        }
        // `req`/`res`/`err` are deliberately pulled out and reattached
        // untouched — Pino applies `serializers` (below) to these specific
        // keys AFTER `formatters.log` runs, so redacting them at this stage
        // would see stale pre-serialization data (the D1 bug).
        //
        // The remainder is redacted as ONE object via `deepRedact`, not
        // field-by-field: `deepRedact` decides whether to censor a value
        // based on ITS KEY, so calling it on an already-unwrapped value
        // (`deepRedact(value)` inside a `for key in object` loop) throws
        // away the very key name it needs — that exact mistake let a
        // top-level `password` field straight through unredacted during
        // this fix's own development, caught by re-running the test suite
        // rather than assuming the refactor was correct.
        const input = object as Record<string, unknown>
        const { req, res, err, ...rest } = input
        const output = deepRedact(rest) as Record<string, unknown>
        if ('req' in input) output.req = req
        if ('res' in input) output.res = res
        if ('err' in input) output.err = err
        return output
      },
    },
    serializers: {
      req: (req: unknown) => deepRedact(normalizeRequestLike(req)),
      res: (res: unknown) => deepRedact(normalizeResponseLike(res)),
      err: (err: unknown) => deepRedact(err),
    },
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  }
}
