import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { buildLoggerOptions, deepRedact } from '../../src/config/logger.ts'

// Regression coverage for QA Attempt 1, Finding 3: every leak vector QA
// proved was logged in plaintext must now come back censored.

describe('deepRedact', () => {
  it('redacts a top-level password field', () => {
    const out = deepRedact({ password: 'TOPLEVEL_PASSWORD' }) as Record<string, unknown>
    expect(out.password).toBe('[REDACTED]')
  })

  it('redacts a depth-3+ nested password field', () => {
    const out = deepRedact({ deep: { a: { password: 'DEEP_PASSWORD' } } }) as any
    expect(out.deep.a.password).toBe('[REDACTED]')
  })

  it('redacts the x-api-key header regardless of hyphenation', () => {
    const out = deepRedact({ req: { headers: { 'x-api-key': 'SECRET_XAPIKEY' } } }) as any
    expect(out.req.headers['x-api-key']).toBe('[REDACTED]')
  })

  it('redacts authorization and cookie headers', () => {
    const out = deepRedact({
      req: { headers: { authorization: 'Bearer SECRET_TOKEN_1', cookie: 'sid=abc' } },
    }) as any
    expect(out.req.headers.authorization).toBe('[REDACTED]')
    expect(out.req.headers.cookie).toBe('[REDACTED]')
  })

  it('redacts SCREAMING_SNAKE_CASE provider key names', () => {
    const out = deepRedact({
      config: { RESEND_API_KEY: 'SECRET_RESEND', PLAID_SECRET: 'SECRET_PLAID' },
      env: { GEMINI_API_KEY: 'SECRET_GEMINI' },
    }) as any
    expect(out.config.RESEND_API_KEY).toBe('[REDACTED]')
    expect(out.config.PLAID_SECRET).toBe('[REDACTED]')
    expect(out.env.GEMINI_API_KEY).toBe('[REDACTED]')
  })

  it('redacts the password portion of a DATABASE_URL-shaped connection string at any depth or key name', () => {
    const topLevel = deepRedact({ DATABASE_URL: 'postgresql://u:TOPLEVELPASSWORD@h/db' }) as any
    expect(topLevel.DATABASE_URL).toBe('postgresql://u:[REDACTED]@h/db')

    const nested = deepRedact({
      env: { DATABASE_URL: 'postgresql://monikey:REALPASSWORD@db:5432/monikey' },
    }) as any
    expect(nested.env.DATABASE_URL).toBe('postgresql://monikey:[REDACTED]@db:5432/monikey')

    // Same connection string under an unrelated key name — still caught because
    // the *value* shape is scrubbed, not just the key name.
    const underOtherKey = deepRedact({ connectionInfo: 'postgres://a:b_SECRET@host:5432/db' }) as any
    expect(underOtherKey.connectionInfo).toBe('postgres://a:[REDACTED]@host:5432/db')
  })

  it('leaves non-secret fields untouched', () => {
    const out = deepRedact({ requestId: 'abc-123', statusCode: 200, nested: { ok: true } }) as any
    expect(out).toEqual({ requestId: 'abc-123', statusCode: 200, nested: { ok: true } })
  })

  it('redacts secret-named properties on Error instances without dropping message/stack', () => {
    const err = new Error('boom') as Error & { apiKey: string }
    err.apiKey = 'SECRET_ON_ERROR'
    const out = deepRedact(err) as any
    expect(out.message).toBe('boom')
    expect(out.apiKey).toBe('[REDACTED]')
    expect(typeof out.stack).toBe('string')
  })
})

describe('buildLoggerOptions end-to-end via a real Pino instance', () => {
  it('produces no plaintext secrets for the full QA Attempt 1 reproduction payload', () => {
    const lines: string[] = []
    const stream = { write: (line: string) => void lines.push(line) }
    const log = pino(buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }), stream)

    log.info(
      {
        req: { headers: { authorization: 'Bearer SECRET_TOKEN_1', 'x-api-key': 'SECRET_XAPIKEY' } },
        env: { DATABASE_URL: 'postgresql://monikey:REALPASSWORD@db:5432/monikey', GEMINI_API_KEY: 'SECRET_GEMINI' },
        DATABASE_URL: 'postgresql://u:TOPLEVELPASSWORD@h/db',
        password: 'TOPLEVEL_PASSWORD',
        deep: { a: { password: 'DEEP_PASSWORD' } },
        config: { RESEND_API_KEY: 'SECRET_RESEND', PLAID_SECRET: 'SECRET_PLAID' },
      },
      'redaction probe',
    )

    const output = lines.join('\n')
    for (const secret of [
      'SECRET_TOKEN_1',
      'SECRET_XAPIKEY',
      'REALPASSWORD',
      'SECRET_GEMINI',
      'TOPLEVELPASSWORD',
      'TOPLEVEL_PASSWORD',
      'DEEP_PASSWORD',
      'SECRET_RESEND',
      'SECRET_PLAID',
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('redaction probe')
  })
})
