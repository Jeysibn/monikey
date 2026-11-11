/*
 * Tests for the Quick Add account picker and date shortcut rules (lib/accountPicker.ts).
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { accountDetail, accountTypeLabel, groupAccounts, searchAccounts, shiftDate } from '../src/lib/accountPicker.ts'
import { accountsFor } from '../src/lib/entryForm.ts'
import { buildSnapshot } from '../src/lib/finance.ts'
import { getMockData } from '../src/mockData.ts'

const snap = buildSnapshot(getMockData())
const all = accountsFor('expense', 'account', snap)

describe('groupAccounts', () => {
  it('groups cash & bank, e-wallets and credit cards in that order', () => {
    const keys = groupAccounts(all).map((g) => g.key)
    assert.deepEqual(keys, ['cash-bank', 'ewallet', 'card'])
  })
  it('lists the last-used account first, and still in its own group', () => {
    const groups = groupAccounts(all, all[1]!.id)
    assert.equal(groups[0]!.key, 'recent')
    assert.equal(groups[0]!.accounts[0]!.id, all[1]!.id)
    assert.equal(groups.flatMap((g) => g.accounts).filter((a) => a.id === all[1]!.id).length, 2)
  })
  it('never lists a last-used account the field does not offer (income and transfers exclude cards)', () => {
    const card = all.find((a) => a.type === 'credit_card')!
    const liquid = accountsFor('income', 'account', snap)
    assert.equal(groupAccounts(liquid, card.id).some((g) => g.key === 'recent'), false)
    assert.equal(groupAccounts(liquid).some((g) => g.key === 'card'), false)
  })
})

describe('searchAccounts', () => {
  it('matches the name or the type, ignoring case and spaces around the query', () => {
    const first = all[0]!
    assert.ok(searchAccounts(all, `  ${first.name.toUpperCase()} `).some((a) => a.id === first.id))
    assert.ok(searchAccounts(all, 'credit').every((a) => a.type === 'credit_card'))
  })
  it('returns everything for an empty query and nothing for a miss', () => {
    assert.equal(searchAccounts(all, '').length, all.length)
    assert.equal(searchAccounts(all, 'zzzz-no-such-account').length, 0)
  })
})

describe('accountDetail', () => {
  it('shows the balance for liquid accounts and what is owed (never cash) for cards', () => {
    const cash = all.find((a) => a.type === 'cash')!
    assert.match(accountDetail(cash, snap), /^Cash · ₱/)
    const card = all.find((a) => a.type === 'credit_card')!
    assert.match(accountDetail(card, snap), /^Credit card · .*(owed|card credit)/)
  })
  it('shows only the type when editing, because the figures already include the entry', () => {
    const bank = all.find((a) => a.type === 'bank')!
    assert.equal(accountDetail(bank, snap, false), accountTypeLabel(bank))
  })
})

describe('shiftDate', () => {
  it('moves by calendar days across month, year and leap-year edges', () => {
    assert.equal(shiftDate('2026-11-01', -1), '2026-10-31')
    assert.equal(shiftDate('2026-01-01', -1), '2025-12-31')
    assert.equal(shiftDate('2028-03-01', -1), '2028-02-29')
    assert.equal(shiftDate('2026-12-31', 1), '2027-01-01')
  })
  it('leaves something that is not a date alone', () => {
    assert.equal(shiftDate('', -1), '')
  })
})
