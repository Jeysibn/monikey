import { describe, expect, it } from 'vitest'
import { AppError, toErrorEnvelope } from '../../src/common/errors/appError.js'

describe('AppError', () => {
  it('assigns a sensible default status code per business error code', () => {
    expect(new AppError('ASSET_OVERDRAFT', 'nope').statusCode).toBe(422)
    expect(new AppError('UNKNOWN_ACCOUNT', 'nope').statusCode).toBe(404)
    expect(new AppError('UNAUTHORIZED', 'nope').statusCode).toBe(401)
    expect(new AppError('IDEMPOTENCY_CONFLICT', 'nope').statusCode).toBe(409)
    expect(new AppError('EXTERNAL_PROVIDER_UNAVAILABLE', 'nope').statusCode).toBe(502)
    expect(new AppError('INTERNAL_ERROR', 'nope').statusCode).toBe(500)
  })

  it('allows an explicit statusCode override', () => {
    expect(new AppError('VALIDATION_ERROR', 'nope', { statusCode: 400 }).statusCode).toBe(400)
  })

  it('carries an optional field for form-level error mapping', () => {
    const err = new AppError('ASSET_OVERDRAFT', 'Would overdraw.', { field: 'amount' })
    expect(err.field).toBe('amount')
  })
})

describe('toErrorEnvelope', () => {
  it('produces the stable error envelope shape from the plan', () => {
    const envelope = toErrorEnvelope('ASSET_OVERDRAFT', 'This transaction would overdraw the selected account.', 'req-1', 'amount')
    expect(envelope).toEqual({
      error: {
        code: 'ASSET_OVERDRAFT',
        message: 'This transaction would overdraw the selected account.',
        field: 'amount',
        requestId: 'req-1',
      },
    })
  })

  it('omits `field` entirely when not supplied', () => {
    const envelope = toErrorEnvelope('NOT_FOUND', 'Resource not found.', 'req-2')
    expect(envelope.error).not.toHaveProperty('field')
    expect(Object.keys(envelope.error).sort()).toEqual(['code', 'message', 'requestId'])
  })
})
