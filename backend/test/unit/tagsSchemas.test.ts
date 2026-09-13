import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const tagSchema = z.object({ name: z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N}_-]+$/u) })

describe('transaction tag names', () => {
  it('accepts concise labels and trims whitespace', () => expect(tagSchema.parse({ name: '  reimbursable  ' }).name).toBe('reimbursable'))
  it('rejects spaces and empty labels', () => {
    expect(() => tagSchema.parse({ name: 'family trip' })).toThrow()
    expect(() => tagSchema.parse({ name: ' ' })).toThrow()
  })
})
