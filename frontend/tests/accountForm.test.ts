/*
 * Tests for the Add account rules (Milestone 4.6): money fields, the name rules, the ledger effect on
 * every total, and the first-run unlock.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { accountSavedMessage, parseAccountMoney, toAccountAction, validateAccount, type AccountValues } from '../src/lib/accountForm.ts'
import { validate, type EntryValues } from '../src/lib/entryForm.ts'
import { cardStatus, liquidBalance, summarize } from '../src/lib/finance.ts'
import { ledgerReducer } from '../src/lib/ledger.ts'
import { getMockData } from '../src/mockData.ts'

const OCT = '2026-10'
const data = getMockData()
const empty = getMockData('no-accounts')
const cash: AccountValues = { type: 'cash', name: 'Wallet', balance: '4,811.75', limit: '', owed: '' }
const card: AccountValues = { type: 'credit_card', name: 'Green Card', balance: '', limit: '50,000', owed: '11,972.75' }
const err = (text: string, field: 'balance' | 'limit' | 'owed') => {
  const r = parseAccountMoney(text, field)
  return r.ok ? null : r.error
}

describe('account money fields', () => {
  it('a balance or an amount owed may be zero; a credit limit may not', () => {
    assert.deepEqual(parseAccountMoney('0', 'balance'), { ok: true, centavos: 0 })
    assert.deepEqual(parseAccountMoney('0.00', 'owed'), { ok: true, centavos: 0 })
    assert.equal(err('0', 'limit'), 'Credit limit must be more than ₱0.00.')
    assert.equal(err('0.00', 'limit'), 'Credit limit must be more than ₱0.00.')
  })
  it('negative values are refused with the spec wording', () => {
    assert.equal(err('-5', 'balance'), 'Use 0.00 or more.')
    assert.equal(err('−5', 'owed'), 'Use 0.00 or more.')
    assert.equal(err('-5', 'limit'), 'Credit limit must be more than ₱0.00.')
  })
  it('reuses the Amount messages for everything else', () => {
    assert.equal(err('', 'balance'), 'Enter an amount.')
    assert.equal(err('abc', 'owed'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(err('1.234', 'limit'), 'Use at most 2 decimal places.')
    assert.equal(err('10,000,000,000', 'balance'), 'That amount is too large.')
    assert.deepEqual(parseAccountMoney('4,811.75', 'balance'), { ok: true, centavos: 481_175 })
  })
})

describe('validateAccount', () => {
  it('accepts a complete cash account and a complete card', () => {
    assert.deepEqual(validateAccount(cash, data), {})
    assert.deepEqual(validateAccount(card, data), {})
    assert.deepEqual(validateAccount({ ...cash, balance: '0' }, data), {})
  })
  it('checks only the fields of the chosen type', () => {
    assert.deepEqual(validateAccount({ ...cash, limit: 'junk', owed: 'junk' }, data), {})
    assert.deepEqual(validateAccount({ ...card, balance: 'junk' }, data), {})
    assert.deepEqual(Object.keys(validateAccount({ ...card, limit: '', owed: '' }, data)).sort(), ['limit', 'owed'])
  })
  it('names: required, at most 60 characters, unique ignoring case and spaces', () => {
    assert.equal(validateAccount({ ...cash, name: '   ' }, data).name, 'Give the account a name.')
    assert.equal(validateAccount({ ...cash, name: 'x'.repeat(60) }, data).name, undefined)
    assert.equal(validateAccount({ ...cash, name: 'x'.repeat(61) }, data).name, 'Keep the name under 60 characters.')
    assert.equal(validateAccount({ ...cash, name: 'gcash' }, data).name, 'You already have an account with that name.')
    assert.equal(validateAccount({ ...cash, name: '  Blue Card ' }, data).name, 'You already have an account with that name.')
    assert.equal(validateAccount(cash, empty).name, undefined)
  })
})

describe('ledger: adding an account', () => {
  it('a cash/bank/e-wallet account adds its balance to "money you have" and to net position', () => {
    const after = ledgerReducer(data, toAccountAction({ ...cash, type: 'bank', name: 'Second Bank' }))
    const added = after.accounts[after.accounts.length - 1]
    assert.equal(added.id, 6)
    assert.equal(added.type, 'bank')
    assert.equal(liquidBalance(added, after), 481_175)
    assert.equal(summarize(after, OCT).liquidBalance, summarize(data, OCT).liquidBalance + 481_175)
    assert.equal(summarize(after, OCT).netPosition, summarize(data, OCT).netPosition + 481_175)
    assert.equal(summarize(after, OCT).monthIncome, summarize(data, OCT).monthIncome) // an opening balance is not income
    assert.equal(data.accounts.length, 5) // the old data is untouched
  })
  it('a credit card adds its debt and limit; money you have is unchanged and net position falls by the debt', () => {
    const after = ledgerReducer(data, toAccountAction(card))
    const added = after.accounts[after.accounts.length - 1]
    const status = cardStatus(added, after)
    assert.equal(status.owed, 1_197_275)
    assert.equal(status.availableCredit, 5_000_000 - 1_197_275)
    assert.equal(summarize(after, OCT).liquidBalance, summarize(data, OCT).liquidBalance)
    assert.equal(summarize(after, OCT).outstandingDebt, summarize(data, OCT).outstandingDebt + 1_197_275)
    assert.equal(summarize(after, OCT).netPosition, summarize(data, OCT).netPosition - 1_197_275)
  })
  it('trims the name, and a card with nothing owed starts at zero debt', () => {
    const after = ledgerReducer(data, toAccountAction({ ...card, name: '  Zero Card  ', owed: '0' }))
    const added = after.accounts[after.accounts.length - 1]
    assert.equal(added.name, 'Zero Card')
    assert.equal(cardStatus(added, after).owed, 0)
    assert.equal(added.openingBalance, 0)
  })
  it('first run: adding the first account unlocks entries (journey U7)', () => {
    const first = ledgerReducer(empty, toAccountAction({ ...cash, name: 'Cash on hand' }))
    assert.equal(first.accounts.length, 1)
    const entry: EntryValues = { kind: 'expense', amount: '120', accountId: 1, cardId: null, categoryId: 4, date: '2026-10-25', note: '' }
    assert.deepEqual(validate(entry, first), {})
    assert.equal(validate(entry, empty).account, 'Choose an account.')
  })
  it('the confirmation names the account', () => assert.equal(accountSavedMessage({ ...cash, name: ' GCash 2 ' }), 'Account added: GCash 2.'))
})
