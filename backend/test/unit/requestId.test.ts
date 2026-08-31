import { describe, expect, it } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { generateRequestId } from '../../src/common/http/requestId.js'

function fakeRequest(headers: Record<string, string | string[] | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}

describe('generateRequestId', () => {
  it('honors a plausible incoming X-Request-Id header', () => {
    const id = generateRequestId(fakeRequest({ 'x-request-id': 'abc123-client-supplied' }))
    expect(id).toBe('abc123-client-supplied')
  })

  it('generates a new id when the header is absent', () => {
    const id = generateRequestId(fakeRequest({}))
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('generates a new id when the header value looks unsafe/implausible', () => {
    const id = generateRequestId(fakeRequest({ 'x-request-id': '<script>alert(1)</script>' }))
    expect(id).not.toBe('<script>alert(1)</script>')
  })

  it('takes the first value when the header is duplicated', () => {
    const id = generateRequestId(fakeRequest({ 'x-request-id': ['first-value', 'second-value'] }))
    expect(id).toBe('first-value')
  })
})
