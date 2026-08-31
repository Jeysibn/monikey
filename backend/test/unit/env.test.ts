import { describe, expect, it } from 'vitest'
import { loadEnv } from '../../src/config/env.js'

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/monikey',
}

describe('loadEnv', () => {
  it('applies defaults when only required vars are supplied', () => {
    const env = loadEnv(baseEnv)
    expect(env.NODE_ENV).toBe('development')
    expect(env.API_PORT).toBe(3000)
    expect(env.APP_ORIGIN).toBe('http://localhost:8080')
    expect(env.SESSION_SECURE).toBe(false)
    expect(env.SESSION_TTL_DAYS).toBe(30)
    expect(env.INTEGRATIONS_MODE).toBe('stub')
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL/)
  })

  it('throws when DATABASE_URL is not a postgres(ql):// connection string (QA Attempt 1, Finding 5)', () => {
    expect(() => loadEnv({ DATABASE_URL: 'not-a-url-at-all' })).toThrowError(/DATABASE_URL/)
    expect(() => loadEnv({ DATABASE_URL: 'mysql://user:pass@host:3306/db' })).toThrowError(/DATABASE_URL/)
  })

  it('accepts both postgres:// and postgresql:// schemes', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://user:pass@localhost:5432/monikey' })).not.toThrow()
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/monikey' })).not.toThrow()
  })

  it('throws when NODE_ENV has an invalid value', () => {
    expect(() => loadEnv({ ...baseEnv, NODE_ENV: 'staging' })).toThrow()
  })

  it('throws when API_PORT is not a positive integer', () => {
    expect(() => loadEnv({ ...baseEnv, API_PORT: '-5' })).toThrow()
    expect(() => loadEnv({ ...baseEnv, API_PORT: 'not-a-number' })).toThrow()
  })

  it('coerces boolean-like strings for SESSION_SECURE and ALLOW_TEST_CLOCK', () => {
    const env = loadEnv({ ...baseEnv, SESSION_SECURE: 'true', ALLOW_TEST_CLOCK: 'TRUE' })
    expect(env.SESSION_SECURE).toBe(true)
    expect(env.ALLOW_TEST_CLOCK).toBe(true)
  })

  it('rejects a non-boolean-like SESSION_SECURE value', () => {
    expect(() => loadEnv({ ...baseEnv, SESSION_SECURE: 'yes' })).toThrow()
  })

  it('accepts an explicit production NODE_ENV with a valid APP_ORIGIN', () => {
    const env = loadEnv({ ...baseEnv, NODE_ENV: 'production', APP_ORIGIN: 'https://monikey.example.com' })
    expect(env.NODE_ENV).toBe('production')
    expect(env.APP_ORIGIN).toBe('https://monikey.example.com')
  })
})
