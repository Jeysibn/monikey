import { describe, expect, it } from 'vitest'
import { postTransactionSchema } from '../../src/modules/ledger/ledger.schemas.js'

const base = { type: 'income', title: 'Salary', occurredOn: '2026-09-12', toAccountId: '00000000-0000-4000-8000-000000000001' }

describe('ledger money transport', () => {
  it('accepts decimal minor-unit strings and normalizes them to bigint', () => {
    const parsed = postTransactionSchema.parse({ ...base, amountMinor: '9007199254740993' })
    expect(parsed.amountMinor).toBe(9007199254740993n)
    expect(parsed.feeMinor).toBe(0n)
  })

  it('rejects fractional and negative string amounts', () => {
    expect(() => postTransactionSchema.parse({ ...base, amountMinor: '1.5' })).toThrow()
    expect(() => postTransactionSchema.parse({ ...base, amountMinor: '-1' })).toThrow()
  })

  it('rejects JavaScript numbers at the JSON boundary', () => {
    expect(() => postTransactionSchema.parse({ ...base, amountMinor: 100 })).toThrow()
  })
})
