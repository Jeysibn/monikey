import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError } from '../src/dataSource.ts'
import { fromWireAnalytics, fromWireEditableAccount, toWireAccountUpdate, fromWireAccount, fromWireAccounts, fromWireCategories, fromWireField, fromWirePayment, fromWireSummary, fromWireTransaction, toCentavos, toWireAccountInput, toWireEntryInput } from '../src/wire.ts'
import type { AccountInfo, Category, EntryValues } from '../src/types.ts'

const accounts: AccountInfo[] = [
  { id: 1, name: 'Main Bank', type: 'bank' },
  { id: 2, name: 'Blue Card', type: 'credit_card' },
]
const categories: Category[] = [{ id: 4, name: 'Food', type: 'expense' }]

test('decimal strings map to integer centavos exactly, including negatives and the agreed maximum', () => {
  assert.equal(toCentavos('350.00'), 35_000)
  assert.equal(toCentavos('-0.05'), -5)
  assert.equal(toCentavos('45035996273704.95'), 2 ** 52 - 1)
  assert.throws(() => toCentavos('0.001'), ApiError)
  assert.throws(() => toCentavos(350), ApiError)
  assert.throws(() => toCentavos('45035996273704.96'), ApiError)
})

test('account rows are discriminated and preserve server-calculated card figures', () => {
  const liquid = fromWireAccount({ id: 1, name: 'Main Bank', type: 'bank', balance: '-20.25' })
  assert.equal(liquid.liquid?.balance, -2025)
  const card = fromWireAccount({
    id: 2, name: 'Blue Card', type: 'credit_card', credit_limit: '500.00',
    outstanding_signed_debt: '-25.00', available_credit: '525.00', owed: '0.00', credit: '25.00',
  })
  assert.equal(card.card?.credit, 2500)
  assert.throws(() => fromWireAccount({ id: 2, name: 'Blue Card', type: 'credit_card', credit_limit: '500.00', outstanding_signed_debt: '20.00', available_credit: '500.00', owed: '20.00', credit: '0.00' }), ApiError)
  const snapshot = fromWireAccounts([
    { id: 2, name: 'Blue Card', type: 'credit_card', credit_limit: '500.00', outstanding_signed_debt: '20.00', available_credit: '480.00', owed: '20.00', credit: '0.00' },
    { id: 1, name: 'Main Bank', type: 'bank', balance: '1.00' },
  ])
  assert.deepEqual(snapshot.accounts.map((account) => account.id), [1, 2])
  assert.deepEqual(snapshot.liquid.map((item) => item.account.id), [1])
  assert.equal(snapshot.cards[0].owed, 2000)
  assert.throws(() => fromWireAccounts([{ id: 1, name: 'A', type: 'cash', balance: '0.00' }, { id: 1, name: 'B', type: 'cash', balance: '0.00' }]), ApiError)
})

test('summary and categories are strictly mapped', () => {
  assert.deepEqual(fromWireSummary({ month: '2026-10', liquid_balance: '10.25', outstanding_debt: '2.00', card_credit: '1.00', net_position: '9.25', month_income: '20.00', month_expenses: '9.00' }, '2026-10'), {
    liquidBalance: 1025, outstandingDebt: 200, cardCredit: 100, netPosition: 925, monthIncome: 2000, monthExpenses: 900,
  })
  assert.throws(() => fromWireSummary({ month: '2026-09' }, '2026-10'), ApiError)
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense' }]), categories)
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', is_archived: true }]), [{ ...categories[0], archived: true }])
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', icon_key: 'shopping-basket' }]), [{ ...categories[0], iconKey: 'shopping-basket' }])
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', icon_key: 'unrecognized-old-key' }]), [{ ...categories[0], iconKey: null }])
  assert.throws(() => fromWireCategories([{ id: 4, name: 'Food', type: 'expense', icon_key: 12 }]), ApiError)
  // ADR-026: color is a curated key; unknown keys fall back, wrong types and bad counts are contract errors.
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', color_key: 'green', usage_count: 3 }]), [{ ...categories[0], colorKey: 'green', usageCount: 3 }])
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', color_key: '#ff0000' }]), [{ ...categories[0], colorKey: null }])
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense', color_key: null }]), [{ ...categories[0], colorKey: null }])
  assert.deepEqual(fromWireCategories([{ id: 4, name: 'Food', type: 'expense' }]), [categories[0]]) // an older server sends neither field
  assert.throws(() => fromWireCategories([{ id: 4, name: 'Food', type: 'expense', color_key: 5 }]), ApiError)
  for (const bad of [-1, 1.5, '3', null]) assert.throws(() => fromWireCategories([{ id: 4, name: 'Food', type: 'expense', usage_count: bad }]), ApiError)
  assert.throws(() => fromWireCategories([{ id: 4, name: 'Food', type: 'expense', is_archived: 'true' }]), ApiError)
  assert.throws(() => fromWireCategories([{ id: 4, name: 'Food', type: 'transfer' }]), ApiError)
})

test('analytics wire values stay exact and validate the requested filter', () => {
  const wire = {
    start_date: '2026-10-01', end_date: '2026-10-31', account_id: null,
    totals: { income: '36500.00', expenses: '26724.40', net_cash_flow: '9775.60' },
    previous_totals: null,
    months: [{ month: '2026-10', income: '36500.00', expenses: '26724.40' }],
    categories: [{ id: 4, name: 'Food', icon_key: 'utensils', archived: false, expenses: '250.00' }],
    kakeibo_totals: { needs: '19951.90', wants: '3864.00', culture: '1800.00', unexpected: '486.50', unclassified: '1025.00' },
    kakeibo: [{ month: '2026-10', plan_status: 'saved', limits: { needs: '18000.00', wants: '5000.00', culture: '2000.00', unexpected: '3000.00' }, actuals: { needs: '19951.90', wants: '3864.00', culture: '1800.00', unexpected: '486.50' }, unclassified: '1025.00' }],
  }
  const parsed = fromWireAnalytics(wire, { startDate: '2026-10-01', endDate: '2026-10-31', accountId: null })
  assert.equal(parsed.totals.netCashFlow, 977_560)
  assert.equal(parsed.categories[0].iconKey, 'utensils')
  assert.equal(parsed.kakeibo[0].limits?.needs, 1_800_000)
  assert.equal(parsed.kakeiboTotals.unclassified, 102_500)
  assert.throws(() => fromWireAnalytics(wire, { startDate: '2026-10-02', endDate: '2026-10-31', accountId: null }), ApiError)
})

test('transaction and payment rows map to editable activity entries', () => {
  const transaction = fromWireTransaction({ id: 7, account_id: 2, category_id: 4, amount: '350.00', transaction_date: '2026-10-24', note: 'Lunch', created_at: '2026-10-24T10:00:00.123456Z' }, accounts, categories)
  assert.equal(transaction.kind, 'expense')
  assert.equal(transaction.title, 'Lunch')
  assert.deepEqual(transaction.entry, { kind: 'expense', amount: '350.00', accountId: 2, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-24', note: 'Lunch' })
  assert.equal(transaction.createdAt, '2026-10-24T10:00:00.123456Z')

  const payment = fromWirePayment({ id: 8, source_account_id: 1, card_account_id: 2, amount: '100.00', payment_date: '2026-10-24', note: null, created_at: '2026-10-24T10:01:00Z' }, accounts)
  assert.equal(payment.kind, 'payment')
  assert.equal(payment.title, 'Card payment')
  assert.equal(payment.entry.kind, 'payment')
  assert.equal(payment.cardName, 'Blue Card')
  assert.throws(() => fromWireTransaction({ id: 7, account_id: 99, category_id: 4, amount: '1.00', transaction_date: '2026-10-24', note: null, created_at: '2026-10-24T10:00:00Z' }, accounts, categories), ApiError)
  assert.throws(() => fromWirePayment({ id: 8, source_account_id: 2, card_account_id: 1, amount: '1.00', payment_date: '2026-10-24', note: null, created_at: '2026-10-24T10:00:00Z' }, accounts), ApiError)
})

test('form values become decimal-string API inputs without browser floating-point conversion', () => {
  const expense: EntryValues = { kind: 'expense', amount: '1,250.50', accountId: 2, cardId: null, destinationAccountId: null, categoryId: 4, date: '2026-10-24', note: '  lunch  ' }
  assert.deepEqual(toWireEntryInput(expense), { account_id: 2, category_id: 4, amount: '1250.50', transaction_date: '2026-10-24', note: 'lunch' })
  assert.deepEqual(toWireEntryInput({ ...expense, kind: 'payment', accountId: 1, cardId: 2, categoryId: null }), { source_account_id: 1, card_account_id: 2, amount: '1250.50', payment_date: '2026-10-24', note: 'lunch' })
  assert.deepEqual(toWireAccountInput({ type: 'credit_card', name: '  Blue  ', balance: '', limit: '10.00', owed: '.5' }), { name: 'Blue', type: 'credit_card', opening_balance: '0.00', opening_debt: '0.50', credit_limit: '10.00' })
  assert.deepEqual(toWireAccountInput({ type: 'bank', name: 'Bank', balance: '1,000.00', limit: '', owed: '' }), { name: 'Bank', type: 'bank', opening_balance: '1000.00', opening_debt: '0.00', credit_limit: null })
  assert.throws(() => toWireEntryInput({ ...expense, amount: '1.001' }))
})

test('wire field names map to the existing form field names', () => {
  assert.equal(fromWireField('transaction_date'), 'date')
  assert.equal(fromWireField('source_account_id'), 'account')
  assert.equal(fromWireField('credit_limit'), 'limit')
  assert.equal(fromWireField('unknown_column'), undefined)
})


test('account editing maps current signed amounts independently of opening values', () => {
  const liquid = { id: 1, name: 'Main Bank', type: 'bank', current_balance: '-0.05', current_debt: '0.00', credit_limit: null }
  const values = fromWireEditableAccount(liquid, 1)
  assert.equal(values.balance, '-0.05')
  assert.deepEqual(toWireAccountUpdate(values), { name: 'Main Bank', type: 'bank', current_balance: '-0.05', current_debt: '0.00', credit_limit: null })
  const card = fromWireEditableAccount({ id: 2, name: 'Blue Card', type: 'credit_card', current_balance: '0.00', current_debt: '-12.34', credit_limit: '1000.00' }, 2)
  assert.equal(card.owed, '-12.34')
  assert.equal(toWireAccountUpdate(card).current_debt, '-12.34')
  assert.equal(fromWireField('current_balance'), 'balance')
  assert.equal(fromWireField('current_debt'), 'owed')
})

test('ADR-020: the account card choice is read when present and left out for an older server', () => {
  const card = { id: 4, name: 'Blue Card', type: 'credit_card', credit_limit: '50000.00', outstanding_signed_debt: '14250.00', available_credit: '35750.00', owed: '14250.00', credit: '0.00' }
  assert.equal(fromWireAccount({ ...card, card_product_id: 'bdo-visa-classic' }).account.cardProductId, 'bdo-visa-classic')
  assert.equal(fromWireAccount({ ...card, card_product_id: null }).account.cardProductId, null)
  assert.equal('cardProductId' in fromWireAccount(card).account, false)
  assert.equal(fromWireAccount({ id: 1, name: 'Cash', type: 'cash', balance: '0.00', card_product_id: null }).liquid!.account.cardProductId, null)
  for (const bad of ['BDO Visa', 'bdo--visa', 'x'.repeat(65), 7]) {
    assert.throws(() => fromWireAccount({ ...card, card_product_id: bad }), ApiError, String(bad))
  }
})

test('ADR-020: the card is sent only when given (an older API refuses unknown fields)', () => {
  const bank = { type: 'bank' as const, name: 'Main', balance: '10.00', limit: '', owed: '' }
  assert.equal('card_product_id' in toWireAccountInput(bank), false)
  assert.equal(toWireAccountInput(bank, 'maribank-debit').card_product_id, 'maribank-debit')
  assert.equal(toWireAccountInput(bank, null).card_product_id, null)
  assert.equal('card_product_id' in toWireAccountUpdate(bank), false)
  assert.equal(toWireAccountUpdate(bank, null).card_product_id, null)
})
