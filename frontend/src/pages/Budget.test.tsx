import { describe, expect, it } from 'vitest'
import { projectPeriodEndSpend } from './Budget'

describe('projectPeriodEndSpend', () => {
  it('annualizes current period spend using elapsed calendar days', () => {
    expect(projectPeriodEndSpend(1200, '2026-09-01', '2026-10-01', '2026-09-12')).toBe(3000)
  })

  it('does not project beyond the period when viewing a future date', () => {
    expect(projectPeriodEndSpend(1200, '2026-09-01', '2026-10-01', '2026-10-05')).toBe(1200)
  })
})
