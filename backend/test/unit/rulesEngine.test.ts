import { describe, expect, it } from 'vitest'
import { applyRuleActions, matchesRule } from '../../src/modules/rules/rules.engine.js'

const tx = { title: 'Jollibee BGC', merchantName: 'Jollibee BGC', amountMinor: 45000n, accountId: '00000000-0000-4000-8000-000000000001', type: 'expense', source: 'import', currencyCode: 'PHP' }
describe('transaction rules engine', () => {
  it('matches deterministic merchant and amount conditions', () => {
    expect(matchesRule(tx, { merchantContains: 'jollibee', minAmountMinor: '10000', maxAmountMinor: '50000' })).toBe(true)
    expect(matchesRule(tx, { merchantEquals: 'Jollibee' })).toBe(false)
  })
  it('applies explicit actions without changing unrelated fields', () => {
    const result = applyRuleActions(tx, { normalizedMerchant: 'Jollibee', addTags: ['fast-food'], note: 'Rule applied' })
    expect(result.normalizedMerchant).toBe('Jollibee')
    expect(result.tags).toEqual(['fast-food'])
    expect(result.amountMinor).toBe(45000n)
  })
})
