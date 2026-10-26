/*
 * Tests for the Quick Add rules (Milestone 4.5a): amount parsing, validation messages, type switching,
 * the display-only preview and notices, and the in-memory ledger reducer.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  accountOptionLabel,
  accountsFor,
  isValidDate,
  notices,
  parseAmount,
  previewFor,
  switchKind,
  validate,
  type EntryValues,
} from '../src/lib/entryForm.ts'
import { buildSnapshot, cardStatus, liquidBalance, summarize } from '../src/lib/finance.ts'
import { deleteSummary, saveMessage, targetOf } from '../src/lib/entryText.ts'
import {
  entryExists,
  entryValues,
  ledgerReducer,
  toAction,
  toDeleteAction,
  toUpdateAction,
  type EntryTarget,
} from '../src/lib/ledger.ts'
import { getMockData } from '../src/mockData.ts'
import { MAX_MONEY_CENTAVOS } from '../src/lib/money.ts'
import type { MockData } from '../src/types.ts'

const OCT = '2026-10'
const CASH = 1, MAIN = 2, GCASH = 3, BLUE = 4, EVERYDAY = 5
const FOOD = 4, SHOPPING = 8, SALARY = 1

const data = getMockData()
const snap = buildSnapshot(data)
const base: EntryValues = { kind: 'expense', amount: '385', accountId: GCASH, cardId: null, destinationAccountId: null, categoryId: FOOD, date: '2026-10-25', note: '' }
const pay: EntryValues = { kind: 'payment', amount: '5000', accountId: MAIN, cardId: BLUE, destinationAccountId: null, categoryId: null, date: '2026-10-25', note: '' }
const amountError = (text: string) => {
  const r = parseAmount(text)
  return r.ok ? null : r.error
}

describe('parseAmount', () => {
  it('reads whole and decimal pesos into exact centavos', () => {
    assert.deepEqual(parseAmount('385'), { ok: true, centavos: 38_500 })
    assert.deepEqual(parseAmount('1,250.50'), { ok: true, centavos: 125_050 })
    assert.deepEqual(parseAmount('₱ 350'), { ok: true, centavos: 35_000 })
    assert.deepEqual(parseAmount('.5'), { ok: true, centavos: 50 })
    assert.deepEqual(parseAmount('350.'), { ok: true, centavos: 35_000 })
    assert.deepEqual(parseAmount('0.07'), { ok: true, centavos: 7 })
    assert.deepEqual(parseAmount('9,999,999,999.99'), { ok: true, centavos: 999_999_999_999 })
  })
  it('is exact where floating point is not (0.1 + 0.2 style values)', () => {
    assert.deepEqual(parseAmount('1.15'), { ok: true, centavos: 115 })
    assert.deepEqual(parseAmount('19.99'), { ok: true, centavos: 1_999 })
    assert.deepEqual(parseAmount('4.35'), { ok: true, centavos: 435 })
  })
  it('gives the spec message for each problem', () => {
    assert.equal(amountError(''), 'Enter an amount.')
    assert.equal(amountError('   '), 'Enter an amount.')
    assert.equal(amountError('abc'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(amountError('12e3'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(amountError('1,23'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(amountError('1.2.3'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(amountError('-5'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(amountError('.'), 'Use numbers only, like 350 or 350.50.')
    assert.equal(amountError('1.234'), 'Use at most 2 decimal places.')
    assert.equal(amountError('0'), 'Amount must be more than ₱0.00.')
    assert.equal(amountError('0.00'), 'Amount must be more than ₱0.00.')
    assert.equal(amountError('10,000,000,000'), 'That amount is too large.')
    assert.equal(amountError('99999999999999999999'), 'That amount is too large.')
  })
})

describe('isValidDate', () => {
  it('accepts real calendar dates only', () => {
    assert.equal(isValidDate('2026-10-25'), true)
    assert.equal(isValidDate('2024-02-29'), true)
    assert.equal(isValidDate('2026-02-29'), false)
    assert.equal(isValidDate('2026-13-01'), false)
    assert.equal(isValidDate('2026-10-5'), false)
    assert.equal(isValidDate(''), false)
  })
})

describe('validate', () => {
  it('accepts a complete expense, income and payment', () => {
    assert.deepEqual(validate(base, snap), {})
    assert.deepEqual(validate({ ...base, kind: 'income', categoryId: SALARY, accountId: MAIN }, snap), {})
    assert.deepEqual(validate(pay, snap), {})
  })
  it('reports each missing field with the spec wording', () => {
    const empty: EntryValues = { ...base, amount: '', accountId: null, categoryId: null, date: '' }
    assert.deepEqual(validate(empty, snap), {
      amount: 'Enter an amount.',
      account: 'Choose an account.',
      category: 'Choose a category.',
      date: 'Enter a valid date.',
    })
    assert.deepEqual(validate({ ...pay, accountId: null, cardId: null }, snap), {
      account: "Choose the account you're paying from.",
      card: "Choose the card you're paying.",
    })
  })
  it('never lets a card pay a card, a card receive income, or a non-card be paid', () => {
    assert.equal(validate({ ...pay, accountId: BLUE }, snap).account, "Choose the account you're paying from.")
    assert.equal(validate({ ...pay, cardId: MAIN }, snap).card, "Choose the card you're paying.")
    assert.equal(validate({ ...base, kind: 'income', categoryId: SALARY, accountId: BLUE }, snap).account, 'Choose an account.')
    assert.deepEqual(validate({ ...base, accountId: BLUE }, snap), {}) // an expense may be charged to a card
  })
  it('requires a category of the matching type, and none for a payment', () => {
    assert.equal(validate({ ...base, categoryId: SALARY }, snap).category, 'Choose a category.') // income category on an expense
    assert.equal(validate({ ...base, kind: 'income', categoryId: FOOD }, snap).category, 'Choose a category.')
    assert.equal(validate({ ...pay, categoryId: FOOD }, snap).category, undefined) // ignored for payments
  })
  it('limits the note to 120 characters', () => {
    assert.equal(validate({ ...base, note: 'x'.repeat(120) }, snap).note, undefined)
    assert.equal(validate({ ...base, note: 'x'.repeat(121) }, snap).note, 'Keep the note under 120 characters.')
  })
})

describe('switchKind and account lists', () => {
  it('keeps amount, date and note, clears the category', () => {
    const v = switchKind({ ...base, note: 'Lunch' }, 'income', snap)
    assert.equal(v.amount, '385')
    assert.equal(v.date, '2026-10-25')
    assert.equal(v.note, 'Lunch')
    assert.equal(v.categoryId, null)
    assert.equal(v.accountId, GCASH) // still valid for income
  })
  it('clears an account that no longer fits (a card cannot be a deposit or a payer)', () => {
    assert.equal(switchKind({ ...base, accountId: BLUE }, 'income', snap).accountId, null)
    assert.equal(switchKind({ ...base, accountId: BLUE }, 'payment', snap).accountId, null)
    assert.equal(switchKind({ ...pay, accountId: MAIN }, 'expense', snap).accountId, MAIN)
  })
  it('offers the right accounts per field', () => {
    assert.deepEqual(accountsFor('expense', 'account', snap).map((a) => a.id), [1, 2, 3, 4, 5])
    assert.deepEqual(accountsFor('income', 'account', snap).map((a) => a.id), [1, 2, 3])
    assert.deepEqual(accountsFor('payment', 'account', snap).map((a) => a.id), [1, 2, 3])
    assert.deepEqual(accountsFor('payment', 'card', snap).map((a) => a.id), [4, 5])
  })
  it('option text shows the balance, or the available credit for a card', () => {
    assert.equal(accountOptionLabel(data.accounts[2], snap), 'GCash — ₱3,120.75')
    assert.equal(accountOptionLabel(data.accounts[3], snap), 'Blue Card — ₱35,750.00 available')
    assert.equal(accountOptionLabel(buildSnapshot(getMockData('over-limit')).accounts[4], buildSnapshot(getMockData('over-limit'))), 'Everyday Card — No credit available')
  })
})

describe('preview and notices (display only)', () => {
  it('previews a card payment: both balances move, expenses do not', () => {
    const p = previewFor(pay, snap)!
    assert.equal(p.title, 'After paying (estimate)')
    assert.deepEqual(p.lines, [
      'Main Savings: ₱48,725.50 → ₱43,725.50',
      'Blue Card owed: ₱14,250.00 → ₱9,250.00',
      'Expenses: no change',
    ])
  })
  it('previews a purchase on a card, and nothing for a purchase on cash or for income', () => {
    assert.deepEqual(previewFor({ ...base, amount: '2,500', accountId: BLUE }, snap)!.lines, ['Blue Card owed: ₱14,250.00 → ₱16,750.00'])
    assert.equal(previewFor(base, snap), null)
    assert.equal(previewFor({ ...base, kind: 'income', categoryId: SALARY }, snap), null)
    assert.equal(previewFor({ ...pay, amount: '' }, snap), null)
  })
  it('previews an overpayment as card credit, not negative debt', () => {
    const p = previewFor({ ...pay, amount: '20,000', cardId: EVERYDAY }, snap)!
    assert.equal(p.lines[1], 'Everyday Card owed: ₱6,800.00 → ₱0.00 (card credit ₱13,200.00)')
  })
  it('warns, without blocking, about overpaying, an empty source and a card over its limit', () => {
    assert.deepEqual(notices(pay, snap), [])
    assert.deepEqual(notices({ ...pay, amount: '20,000' }, snap), ["That's more than the ₱14,250.00 currently owed. The extra becomes credit on the card."])
    assert.deepEqual(notices({ ...pay, amount: '4,000', accountId: GCASH, cardId: BLUE }, snap), ['GCash has ₱3,120.75, less than this payment. Its balance will go below zero.'])
    assert.deepEqual(notices({ ...base, amount: '40,000', accountId: BLUE }, snap), ["That's more than the ₱35,750.00 credit available on Blue Card."])
    assert.deepEqual(notices({ ...base, accountId: BLUE }, snap), [])
    assert.equal(validate({ ...pay, amount: '20,000' }, snap).amount, undefined) // a warning never becomes an error
  })
})

describe('ledger: saving an entry', () => {
  const save = (v: EntryValues, d = data) => ledgerReducer(d, toAction(v, '2026-10-25T12:00:00.000Z'))

  it('an expense on cash lowers that account and raises the month\'s expenses by the same amount', () => {
    const after = save({ ...base, accountId: CASH, amount: '120.50' })
    assert.equal(liquidBalance(after.accounts[0], after), liquidBalance(data.accounts[0], data) - 12_050)
    assert.equal(summarize(after, OCT).monthExpenses, summarize(data, OCT).monthExpenses + 12_050)
    assert.equal(summarize(after, OCT).netPosition, summarize(data, OCT).netPosition - 12_050)
  })
  it('an expense on a card raises its debt, and is still an expense (journey U2)', () => {
    const after = save({ ...base, accountId: BLUE, amount: '2,500', categoryId: SHOPPING })
    assert.equal(cardStatus(after.accounts[3], after).owed, 1_425_000 + 250_000)
    assert.equal(summarize(after, OCT).monthExpenses, summarize(data, OCT).monthExpenses + 250_000)
    assert.equal(summarize(after, OCT).netPosition, summarize(data, OCT).netPosition - 250_000)
  })
  it('income raises the account and the month\'s income', () => {
    const after = save({ ...base, kind: 'income', accountId: MAIN, categoryId: SALARY, amount: '1,000' })
    assert.equal(liquidBalance(after.accounts[1], after), liquidBalance(data.accounts[1], data) + 100_000)
    assert.equal(summarize(after, OCT).monthIncome, summarize(data, OCT).monthIncome + 100_000)
  })
  it('a card payment lowers both the account and the debt and changes neither expenses nor net position (journey U3)', () => {
    const after = save(pay)
    assert.equal(liquidBalance(after.accounts[1], after), liquidBalance(data.accounts[1], data) - 500_000)
    assert.equal(cardStatus(after.accounts[3], after).owed, 1_425_000 - 500_000)
    assert.equal(summarize(after, OCT).monthExpenses, summarize(data, OCT).monthExpenses)
    assert.equal(summarize(after, OCT).netPosition, summarize(data, OCT).netPosition)
  })
  it('gives new ids, trims the note, stores an empty note as null, and leaves the old data untouched', () => {
    const after = save({ ...base, note: '  Lunch  ' })
    const added = after.transactions[after.transactions.length - 1]
    assert.equal(added.id, Math.max(...data.transactions.map((t) => t.id)) + 1)
    assert.equal(added.note, 'Lunch')
    assert.equal(save({ ...base, note: '   ' }).transactions.at(-1)!.note, null)
    assert.equal(data.transactions.length, 17)
    assert.equal(after.transactions.length, 18)
  })
  it('a saved payment appears in the Activity data as a payment, never as an expense', () => {
    const after = save(pay)
    assert.equal(after.payments.length, data.payments.length + 1)
    assert.equal(after.transactions.length, data.transactions.length)
  })
})

describe('ledger: confirmation messages (spec section 7)', () => {
  const run = (v: EntryValues) => saveMessage(v, buildSnapshot(ledgerReducer(data, toAction(v, '2026-10-25T12:00:00.000Z'))))
  it('expense on cash', () => assert.equal(run(base), 'Expense saved: −₱385.00 from GCash.'))
  it('expense on a card names what it now owes', () =>
    assert.equal(run({ ...base, amount: '2,500', accountId: BLUE }), 'Expense saved: −₱2,500.00 from Blue Card. Blue Card now owes ₱16,750.00.'))
  it('income', () => assert.equal(run({ ...base, kind: 'income', accountId: MAIN, categoryId: SALARY, amount: '1,000' }), 'Income saved: +₱1,000.00 to Main Savings.'))
  it('card payment says it is not an expense and leaves net position alone', () =>
    assert.equal(
      run(pay),
      "Card payment saved: ₱5,000.00 from Main Savings to Blue Card. Blue Card now owes ₱9,250.00. Card payments don't count as expenses and don't change your net position.",
    ))
  it('an overpayment says the card now has credit', () =>
    assert.match(run({ ...pay, amount: '20,000', cardId: EVERYDAY }), /Everyday Card now has ₱13,200\.00 card credit\./))
  it('a payment in full says the card owes nothing', () =>
    assert.match(run({ ...pay, amount: '14,250' }), /Blue Card now owes nothing\./))
})

/** The delete confirmation for a stored entry, as the screens build it: the entry as opened plus the accounts' figures. */
const del = (d: MockData, t: EntryTarget, month = OCT) => deleteSummary(buildSnapshot(d), entryValues(d, t)!, month)

describe('estimates at the edge of the bound', () => {
  it('a delete text whose before/after exceeds the bound still formats (it never throws during render)', () => {
    // A card holding the largest credit the client accepts; deleting a ₱1,000.00 purchase on it makes the credit larger.
    const s = buildSnapshot(data)
    const edge = {
      ...s,
      cards: s.cards.map((c) =>
        c.account.id === BLUE ? { ...c, signedDebt: -MAX_MONEY_CENTAVOS, owed: 0, credit: MAX_MONEY_CENTAVOS } : c,
      ),
    }
    const entry: EntryValues = { kind: 'expense', amount: '1,000', accountId: BLUE, cardId: null, destinationAccountId: null, categoryId: SHOPPING, date: '2026-10-20', note: 'Big one' }
    const text = deleteSummary(edge, entry, OCT)!.effect
    assert.match(text, /Blue Card goes from ₱45,035,996,273,704\.95 card credit to ₱45,035,996,274,704\.95 card credit \(estimate\)/)
    const pay = { ...entry, kind: 'payment' as const, accountId: MAIN, cardId: BLUE, categoryId: null }
    assert.doesNotThrow(() => deleteSummary(edge, pay, OCT))
  })
})

describe('ledger: editing and deleting (Milestone 4.5b)', () => {
  const tx = (id: number): EntryTarget => ({ table: 'transaction', id })
  const payment: EntryTarget = { table: 'payment', id: 1 }
  const edit = (d: typeof data, v: EntryValues, t: EntryTarget) => ledgerReducer(d, toUpdateAction(v, t))

  it('loads an entry into form values (kind from the category, amount as editable text)', () => {
    assert.deepEqual(entryValues(data, tx(17)), { kind: 'expense', amount: '385.00', accountId: GCASH, cardId: null, destinationAccountId: null, categoryId: FOOD, date: '2026-10-24', note: 'Lunch with team' })
    assert.equal(entryValues(data, tx(11))!.kind, 'income')
    assert.deepEqual(entryValues(data, payment), { kind: 'payment', amount: '5000.00', accountId: MAIN, cardId: BLUE, destinationAccountId: null, categoryId: null, date: '2026-10-20', note: '' })
    assert.equal(entryValues(data, tx(999)), null)
  })
  it('editing the amount re-derives every balance and total (journey U4)', () => {
    const v = { ...entryValues(data, tx(17))!, amount: '485' }
    const after = edit(data, v, tx(17))
    assert.equal(liquidBalance(after.accounts[2], after), liquidBalance(data.accounts[2], data) - 10_000)
    assert.equal(summarize(after, OCT).monthExpenses, summarize(data, OCT).monthExpenses + 10_000)
    assert.equal(after.transactions.length, data.transactions.length) // changed, not added
    assert.equal(after.transactions.find((t) => t.id === 17)!.createdAt, data.transactions.find((t) => t.id === 17)!.createdAt)
  })
  it('moving an expense to a card moves the amount from cash to debt, still one expense', () => {
    const after = edit(data, { ...entryValues(data, tx(17))!, accountId: BLUE }, tx(17))
    assert.equal(liquidBalance(after.accounts[2], after), liquidBalance(data.accounts[2], data) + 38_500)
    assert.equal(cardStatus(after.accounts[3], after).owed, 1_425_000 + 38_500)
    assert.equal(summarize(after, OCT).monthExpenses, summarize(data, OCT).monthExpenses)
  })
  it('editing a payment keeps it a payment: expenses and net position stay put', () => {
    const after = edit(data, { ...entryValues(data, payment)!, amount: '8,000' }, payment)
    assert.equal(cardStatus(after.accounts[3], after).owed, 1_425_000 - 300_000)
    assert.equal(summarize(after, OCT).monthExpenses, summarize(data, OCT).monthExpenses)
    assert.equal(summarize(after, OCT).netPosition, summarize(data, OCT).netPosition)
  })
  it('deleting reverses the entry exactly (add then delete returns to the starting figures)', () => {
    const added = ledgerReducer(data, toAction(pay, '2026-10-25T12:00:00.000Z'))
    const id = Math.max(...added.payments.map((p) => p.id))
    const back = ledgerReducer(added, toDeleteAction({ table: 'payment', id }))
    assert.deepEqual(back.payments, data.payments)
    assert.equal(cardStatus(back.accounts[3], back).owed, cardStatus(data.accounts[3], data).owed)
    const gone = ledgerReducer(data, toDeleteAction(tx(17)))
    assert.equal(gone.transactions.length, 16)
    assert.equal(liquidBalance(gone.accounts[2], gone), liquidBalance(data.accounts[2], data) + 38_500)
    assert.equal(summarize(gone, OCT).monthExpenses, summarize(data, OCT).monthExpenses - 38_500)
  })
  it('a missing entry is detected, and the reducer leaves the data untouched (the 404 cases)', () => {
    assert.equal(entryExists(data, tx(17)), true)
    assert.equal(entryExists(data, tx(999)), false)
    assert.equal(ledgerReducer(data, toDeleteAction(tx(999))), data) // same object: a no-op
    assert.equal(ledgerReducer(data, toDeleteAction({ table: 'payment', id: 999 })), data)
    assert.equal(ledgerReducer(data, { type: 'update-transaction', id: 999, accountId: 1, categoryId: 4, amount: 100, date: '2026-10-01', note: null }), data)
  })
  it('targetOf maps an Activity row to its table and id', () => {
    assert.deepEqual(targetOf({ key: 'p-1', kind: 'payment', id: 1 } as never), payment)
    assert.deepEqual(targetOf({ key: 't-5', kind: 'income', id: 5 } as never), tx(5))
  })
  it('the delete confirmation names the entry and its effect, per kind (spec section 10)', () => {
    assert.deepEqual(del(data, tx(17), OCT), {
      title: 'Delete this expense?',
      entry: 'Lunch with team · −₱385.00 · Oct 24, 2026 · GCash',
      effect: "GCash goes up by ₱385.00 and this month's expenses drop by ₱385.00. This can't be undone.",
      button: 'Delete expense',
      done: 'Expense deleted.',
    })
    assert.equal(del(data, tx(16), OCT)!.effect, "Blue Card owed goes down by ₱2,846.50 and this month's expenses drop by ₱2,846.50. This can't be undone.")
    assert.equal(del(data, tx(11), OCT)!.effect, "Main Savings goes down by ₱32,000.00 and this month's income drops by ₱32,000.00. This can't be undone.")
    const p = del(data, payment, OCT)!
    assert.equal(p.title, 'Delete this card payment?')
    assert.equal(p.effect, "Main Savings goes up by ₱5,000.00 and Blue Card owed goes up by ₱5,000.00. Your expenses don't change. This can't be undone.")
    assert.equal(p.entry, 'Card payment · ₱5,000.00 · Oct 20, 2026 · Main Savings → Blue Card')
    assert.equal(p.button, 'Delete payment')
  })
  it('a card in credit gets its real before and after, not "owed goes up by the full amount" (overpaid demo)', () => {
    const over = getMockData('overpaid') // a ₱20,000 payment on Everyday Card, which owed ₱6,800: now ₱13,200 credit
    const delOver = del(over, { table: 'payment', id: 2 })!
    assert.equal(delOver.effect, "Main Savings goes up by ₱20,000.00 and Everyday Card goes from ₱13,200.00 card credit to ₱6,800.00 owed (estimate). Your expenses don't change. This can't be undone.")
    // a purchase on a card that is in credit: deleting it moves the card back toward credit
    const credit = ledgerReducer(over, toAction({ ...base, accountId: EVERYDAY, amount: '5,000', categoryId: SHOPPING }, '2026-10-26T09:00:00.000Z'))
    const id = Math.max(...credit.transactions.map((t) => t.id))
    assert.equal(del(credit, { table: 'transaction', id }, OCT)!.effect, "Everyday Card goes from ₱8,200.00 card credit to ₱13,200.00 card credit (estimate) and this month's expenses drop by ₱5,000.00. This can't be undone.")
    // a payment that took the card exactly to zero never crosses it, so the plain wording is exact
    const zero = getMockData('paid-off') // Blue Card paid in full
    assert.equal(del(zero, { table: 'payment', id: 2 }, OCT)!.effect, "Main Savings goes up by ₱14,250.00 and Blue Card owed goes up by ₱14,250.00. Your expenses don't change. This can't be undone.")
  })
  it('the monthly clause is left out for an entry outside the month being viewed', () => {
    assert.equal(del(data, tx(17), '2026-09')!.effect, "GCash goes up by ₱385.00. This can't be undone.")
    assert.equal(del(data, tx(11), '2026-09')!.effect, "Main Savings goes down by ₱32,000.00. This can't be undone.")
  })
})
