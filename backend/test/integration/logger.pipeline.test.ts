// Real Fastify + Pino request-logging pipeline coverage.
//
// QA Attempt 2 (Findings D1/D3/D7): the previous redaction test suite only
// ever called `deepRedact()` directly on plain object literals, or fed a
// hand-built `{ headers: {...} }` literal into a real Pino instance. Neither
// exercised the actual bug: Fastify's own request-lifecycle logging passes
// its *live* request/response objects (prototype-backed, not own-enumerable
// plain data) into the log call, and `deepRedact`'s original `Object.entries`
// walk silently turned both into `{}` — deleting method/url/statusCode from
// every real request log line. That regression was invisible to a test that
// never constructed a real Fastify app.
//
// Every test below drives a real `fastify()` instance through `app.inject()`
// and inspects the actual JSON log lines Pino wrote — not a call to
// `deepRedact()` in isolation.
import Fastify from 'fastify'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { buildLoggerOptions } from '../../src/config/logger.ts'

function capturingStream() {
  const lines: string[] = []
  return {
    stream: {
      write(chunk: string) {
        lines.push(chunk)
        return true
      },
    },
    lines,
    parsed(): Array<Record<string, any>> {
      return lines
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    },
  }
}

describe('request logging survives redaction (QA Attempt 2, Finding D1)', () => {
  it('preserves req.method/req.url and res.statusCode on real Fastify request logs', async () => {
    const { stream, parsed } = capturingStream()
    const logger = pino(buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }), stream)
    const app = Fastify({ loggerInstance: logger })
    app.get('/probe', async () => ({ ok: true }))
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/probe' })
    expect(res.statusCode).toBe(200)
    await app.close()

    const entries = parsed()
    const requestLog = entries.find((e) => e.msg === 'incoming request')
    const completedLog = entries.find((e) => e.msg === 'request completed')

    // This is the exact regression QA caught: before the fix, both of these
    // came back as `{}` — every field below would be `undefined`.
    expect(requestLog?.req).toBeDefined()
    expect(requestLog?.req?.method).toBe('GET')
    expect(requestLog?.req?.url).toBe('/probe')

    expect(completedLog?.res).toBeDefined()
    expect(completedLog?.res?.statusCode).toBe(200)
  })

  it('redacts secret-named headers manually logged under a req key from inside a real route handler', async () => {
    // Fastify's own default req serializer does not include headers at all
    // (method/url/host/remoteAddress/remotePort only), so this exercises
    // the other realistic path: a route handler explicitly logging
    // `request.headers` (e.g. for tracing/debugging) via `request.log.info`.
    // Because this is a plain object literal (no `raw` property), it skips
    // `normalizeRequestLike`'s live-request shortcut and goes through
    // `deepRedact`'s ordinary walk — the same path QA Attempt 1's original
    // reproduction exercised, but now driven through a real Fastify route
    // handler and a real Pino instance instead of a hand-built log call.
    const { stream, parsed } = capturingStream()
    const logger = pino(buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }), stream)
    const app = Fastify({ loggerInstance: logger })
    app.get('/probe', async (request) => {
      request.log.info({ req: { headers: request.headers } }, 'manual header log')
      return { ok: true }
    })
    await app.ready()

    await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: 'Bearer SECRET_HEADER_TOKEN', 'x-api-key': 'SECRET_XAPIKEY_HEADER' },
    })
    await app.close()

    const manualLog = parsed().find((e) => e.msg === 'manual header log')
    expect(manualLog?.req?.headers?.authorization).toBe('[REDACTED]')
    expect(manualLog?.req?.headers?.['x-api-key']).toBe('[REDACTED]')

    // The real Fastify request-lifecycle logs alongside it must still show
    // genuine method/url/statusCode — proving this fix didn't trade the D5
    // header case for a D1 regression on the very same request.
    const requestLog = parsed().find((e) => e.msg === 'incoming request')
    const completedLog = parsed().find((e) => e.msg === 'request completed')
    expect(requestLog?.req?.method).toBe('GET')
    expect(completedLog?.res?.statusCode).toBe(200)

    const fullOutput = JSON.stringify(parsed())
    expect(fullOutput).not.toContain('SECRET_HEADER_TOKEN')
    expect(fullOutput).not.toContain('SECRET_XAPIKEY_HEADER')
  })
})

describe('query-string secret redaction on real request logs (QA Attempt 2, Finding D5)', () => {
  it('redacts secret-shaped query parameters in req.url while preserving non-secret ones', async () => {
    const { stream, parsed } = capturingStream()
    const logger = pino(buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }), stream)
    const app = Fastify({ loggerInstance: logger })
    app.get('/probe', async () => ({ ok: true }))
    await app.ready()

    await app.inject({ method: 'GET', url: '/probe?token=SECRET_QUERY_TOKEN&keep=visible&pwd=SECRET_PWD_VALUE' })
    await app.close()

    const requestLog = parsed().find((e) => e.msg === 'incoming request')
    expect(requestLog?.req?.url).toContain('keep=visible')
    expect(requestLog?.req?.url).toContain('token=[REDACTED]')
    expect(requestLog?.req?.url).toContain('pwd=[REDACTED]')
    expect(requestLog?.req?.url).not.toContain('SECRET_QUERY_TOKEN')
    expect(requestLog?.req?.url).not.toContain('SECRET_PWD_VALUE')
  })
})

describe('additional secret-shaped values through a real Pino pipeline (QA Attempt 2, Finding D5)', () => {
  it('redacts pwd, bearer, and privateKey-named fields', () => {
    const { stream, parsed } = capturingStream()
    const log = pino(buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }), stream)

    log.info({ pwd: 'SECRET_PWD', bearer: 'SECRET_BEARER', privateKey: 'SECRET_PRIVATE_KEY' }, 'probe')

    const entry = parsed()[0]
    expect(entry.pwd).toBe('[REDACTED]')
    expect(entry.bearer).toBe('[REDACTED]')
    expect(entry.privateKey).toBe('[REDACTED]')
  })

  it('redacts the password segment of a connection string with an empty username', () => {
    const { stream, parsed } = capturingStream()
    const log = pino(buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' }), stream)

    log.info({ url: 'postgres://:SECRET_EMPTY_USER_PASSWORD@host:5432/db' }, 'probe')

    const entry = parsed()[0]
    expect(entry.url).toBe('postgres://:[REDACTED]@host:5432/db')
    expect(JSON.stringify(entry)).not.toContain('SECRET_EMPTY_USER_PASSWORD')
  })
})
