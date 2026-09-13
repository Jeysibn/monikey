import { describe, expect, it } from 'vitest'
import { detectMonthlyCandidates } from '../../src/modules/recurring/detection.js'

describe('recurring detection', () => {
  it('suggests exact monthly repeats with an explanation', () => {
    const rows = [1, 31, 61].map((day) => ({ title: 'Spotify', amountMinor: 14900n, occurredOn: new Date(`2026-01-${String(day).padStart(2, '0')}`) }))
    // Use valid calendar dates with the same month spacing.
    const valid = ['2026-01-14', '2026-02-14', '2026-03-14'].map((date) => ({ title: 'Spotify', amountMinor: 14900n, occurredOn: new Date(date) }))
    expect(detectMonthlyCandidates(valid)[0]).toMatchObject({ merchant: 'Spotify', amountMinor: '14900', occurrences: 3 })
    expect(detectMonthlyCandidates(rows)).toEqual([])
  })
})
