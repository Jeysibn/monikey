/*
 * Unit tests for money formatting and the mock accounting rules (Milestone 4.2).
 * Run with:  npm test      (Node's built-in test runner; no extra dependency)
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ACTIVITY_MAX_ROWS,
  ACTIVITY_PAGE_SIZE,
  activityPage,
  availableCredit,
  buildActivity,
  cardStatus,
  cardStatuses,
  dayHeading,
  groupByDate,
  liquidAccounts,
  liquidBalance,
  monthLabel,
  monthOf,
  monthOptions,
  nextPageSize,
  signedCardDebt,
  summarize,
} from '../src/lib/finance.ts'
import { formatPeso, formatSigned, isMoney, MAX_MONEY_CENTAVOS } from '../src/lib/money.ts'
import { getMockData } from '../src/mockData.ts'
import type { Account, CreditCardPayment, MockData, Transaction } from '../src/types.ts'

const OCT = '2026-10'
const BLUE = 4
const EVERYDAY = 5
const MAIN = 2
const GCASH = 3
const CASH = 1

const account = (data: MockData, id: number): Account => data.accounts.find((a) => a.id === id)!
const addTx = (data: MockData, t: Partial<Transaction> & Pick<Transaction, 'accountId' | 'categoryId' | 'amount'>): MockData => ({
  ...data,
  transactions: [...data.transactions, { id: 900 + data.transactions.length, date: '2026-10-25', note: null, createdAt: '2026-10-25T12:00:00.000Z', ...t }],
})
const addPayment = (data: MockData, source: number, card: number, amount: number, date = '2026-10-25'): MockData => ({
  ...data,
  payments: [...data.payments, { id: 900 + data.payments.length, sourceAccountId: source, cardAccountId: card, amount, date, note: null, createdAt: `${date}T12:00:00.000Z` } satisfies CreditCardPayment],
})
const EXPENSE_SHOPPING = 8
const EXPENSE_FOOD = 4
const INCOME_SALARY = 1

describe('formatPeso / formatSigned', () => {
  it('formats pesos with separators and two decimals', () => {
    assert.equal(formatPeso(3_314_625), '₱33,146.25')
    assert.equal(formatPeso(100), '₱1.00')
    assert.equal(formatPeso(5), '₱0.05')
    assert.equal(formatPeso(0), '₱0.00')
    assert.equal(formatPeso(999_999_999_999), '₱9,999,999,999.99') // NUMERIC(12,2) maximum
    assert.equal(formatPeso(100_000_000), '₱1,000,000.00')
  })
  it('uses the true minus sign before the peso sign for negatives and never prints -0', () => {
    assert.equal(formatPeso(-120_000), '−₱1,200.00')
    assert.equal(formatPeso(-1), '−₱0.01')
    assert.equal(formatPeso(-0), '₱0.00')
  })
  it('signs income "+", expenses "−", and leaves payments, debt and plain figures unsigned', () => {
    assert.equal(formatSigned(3_200_000, 'income'), '+₱32,000.00')
    assert.equal(formatSigned(38_500, 'expense'), '−₱385.00')
    assert.equal(formatSigned(500_000, 'payment'), '₱5,000.00')
    assert.equal(formatSigned(1_425_000, 'debt'), '₱14,250.00')
    assert.equal(formatSigned(0, 'plain'), '₱0.00')
  })
  it('never signs a zero', () => {
    assert.equal(formatSigned(0, 'income'), '₱0.00')
    assert.equal(formatSigned(0, 'expense'), '₱0.00')
    assert.equal(formatSigned(-0, 'income'), '₱0.00')
  })
  it('signs by kind, not by the sign of the number', () => {
    assert.equal(formatSigned(-38_500, 'expense'), '−₱385.00')
    assert.equal(formatSigned(-100, 'income'), '+₱1.00')
  })
  it('rejects fractional centavos instead of silently rounding', () => {
    assert.throws(() => formatPeso(10.5), RangeError)
    assert.throws(() => formatPeso(Number.NaN), RangeError)
    assert.throws(() => formatPeso(Number.POSITIVE_INFINITY), RangeError)
    assert.throws(() => formatPeso(Number.MAX_SAFE_INTEGER + 1), RangeError)
  })
})

describe('the approved fictional ledger (UI_UX_SPEC section 2)', () => {
  const data = getMockData()
  const s = summarize(data, OCT)

  it('has the approved account balances', () => {
    assert.equal(liquidBalance(account(data, CASH), data), 235_000)
    assert.equal(liquidBalance(account(data, MAIN), data), 4_872_550)
    assert.equal(liquidBalance(account(data, GCASH), data), 312_075)
  })
  it('has the approved totals', () => {
    assert.equal(s.liquidBalance, 5_419_625) // ₱54,196.25
    assert.equal(s.outstandingDebt, 2_105_000) // ₱21,050.00
    assert.equal(s.cardCredit, 0)
    assert.equal(s.netPosition, 3_314_625) // ₱33,146.25
    assert.equal(s.monthIncome, 3_650_000) // ₱36,500.00
    assert.equal(s.monthExpenses, 2_712_740) // ₱27,127.40
  })
  it('net position = money you have − card debt', () => {
    assert.equal(s.netPosition, s.liquidBalance - s.outstandingDebt + s.cardCredit)
  })
  it('has the approved card debt, available credit and limits', () => {
    const [blue, everyday] = cardStatuses(data)
    assert.equal(blue.account.name, 'Blue Card')
    assert.equal(blue.owed, 1_425_000)
    assert.equal(blue.availableCredit, 3_575_000)
    assert.equal(everyday.owed, 680_000)
    assert.equal(everyday.availableCredit, 2_320_000)
    assert.equal(blue.creditLimit, 5_000_000)
  })
  it('every figure is a whole number of centavos', () => {
    for (const v of Object.values(s)) assert.ok(Number.isSafeInteger(v))
  })
})

describe('credit card purchases', () => {
  const before = getMockData()
  const after = addTx(before, { accountId: BLUE, categoryId: EXPENSE_SHOPPING, amount: 250_000 })
  const s0 = summarize(before, OCT)
  const s1 = summarize(after, OCT)

  it('raise the card debt', () => assert.equal(signedCardDebt(account(after, BLUE), after) - signedCardDebt(account(before, BLUE), before), 250_000))
  it('count as a monthly expense', () => assert.equal(s1.monthExpenses - s0.monthExpenses, 250_000))
  it('lower net position by the purchase and leave money you have alone', () => {
    assert.equal(s1.netPosition - s0.netPosition, -250_000)
    assert.equal(s1.liquidBalance, s0.liquidBalance)
  })
  it('use up available credit', () => {
    assert.equal(cardStatus(account(after, BLUE), after).availableCredit, cardStatus(account(before, BLUE), before).availableCredit - 250_000)
  })
  it('a cash purchase lowers the account, not any card', () => {
    const cash = addTx(before, { accountId: CASH, categoryId: EXPENSE_FOOD, amount: 12_000 })
    assert.equal(liquidBalance(account(cash, CASH), cash), 235_000 - 12_000)
    assert.equal(summarize(cash, OCT).outstandingDebt, s0.outstandingDebt)
  })
})

describe('credit card payments', () => {
  const before = getMockData()
  const s0 = summarize(before, OCT)

  it('reduce the paying account and the card debt by the same amount', () => {
    const after = addPayment(before, MAIN, BLUE, 500_000)
    assert.equal(liquidBalance(account(after, MAIN), after), liquidBalance(account(before, MAIN), before) - 500_000)
    assert.equal(signedCardDebt(account(after, BLUE), after), signedCardDebt(account(before, BLUE), before) - 500_000)
  })
  it('do NOT increase monthly expenses or income', () => {
    const after = addPayment(before, MAIN, BLUE, 500_000)
    const s1 = summarize(after, OCT)
    assert.equal(s1.monthExpenses, s0.monthExpenses)
    assert.equal(s1.monthIncome, s0.monthIncome)
  })
  it('leave net position unchanged', () => {
    for (const amount of [1, 100, 500_000, 1_425_000]) {
      const after = addPayment(before, MAIN, BLUE, amount)
      assert.equal(summarize(after, OCT).netPosition, s0.netPosition, `payment of ${amount}`)
    }
  })
  it('paying a card in full leaves nothing owed and frees the whole limit', () => {
    const after = addPayment(before, MAIN, BLUE, 1_425_000)
    const blue = cardStatus(account(after, BLUE), after)
    assert.equal(blue.owed, 0)
    assert.equal(blue.credit, 0)
    assert.equal(blue.availableCredit, blue.creditLimit)
  })
  it('an overpaid card holds credit, not negative debt, and net position still does not change', () => {
    const after = addPayment(before, MAIN, EVERYDAY, 2_000_000) // owes 680,000
    const status = cardStatus(account(after, EVERYDAY), after)
    assert.equal(status.signedDebt, -1_320_000)
    assert.equal(status.owed, 0)
    assert.equal(status.credit, 1_320_000)
    const s1 = summarize(after, OCT)
    assert.equal(s1.cardCredit, 1_320_000)
    assert.equal(s1.outstandingDebt, 1_425_000) // only Blue Card still owes
    assert.equal(s1.netPosition, s0.netPosition)
    assert.equal(s1.netPosition, s1.liquidBalance - s1.outstandingDebt + s1.cardCredit)
  })
  it('a payment that empties the paying account shows a negative balance, not zero', () => {
    const after = addPayment(before, GCASH, BLUE, 400_000)
    assert.equal(liquidBalance(account(after, GCASH), after), -87_925)
    assert.equal(formatPeso(liquidBalance(account(after, GCASH), after)), '−₱879.25')
    assert.equal(summarize(after, OCT).netPosition, s0.netPosition)
  })
  it('a payment dated in another month moves balances but never that month\'s expenses', () => {
    const after = addPayment(before, MAIN, BLUE, 500_000, '2026-09-30')
    assert.equal(summarize(after, OCT).monthExpenses, s0.monthExpenses)
    assert.equal(summarize(after, '2026-09').monthExpenses, 0)
    assert.equal(summarize(after, OCT).liquidBalance, s0.liquidBalance - 500_000)
  })
})

describe('accounts list (Accounts screen)', () => {
  it('lists cash, bank and e-wallet accounts in that order, never cards, with calculated balances', () => {
    const rows = liquidAccounts(getMockData())
    assert.deepEqual(rows.map((r) => [r.account.name, r.account.type, r.balance]), [
      ['Cash on hand', 'cash', 235_000],
      ['Main Savings', 'bank', 4_872_550],
      ['GCash', 'ewallet', 312_075],
    ])
  })
  it('the rows add up to money you have', () => {
    const data = getMockData()
    assert.equal(liquidAccounts(data).reduce((a, r) => a + r.balance, 0), summarize(data, OCT).liquidBalance)
  })
  it('orders by type first, then by id, whatever order the accounts were created in', () => {
    const d = getMockData()
    const shuffled: MockData = { ...d, accounts: [d.accounts[2], d.accounts[4], d.accounts[1], d.accounts[3], d.accounts[0]] }
    assert.deepEqual(liquidAccounts(shuffled).map((r) => r.account.name), ['Cash on hand', 'Main Savings', 'GCash'])
  })
  it('shows a negative balance as negative', () => {
    const rows = liquidAccounts(getMockData('negative'))
    assert.equal(rows.find((r) => r.account.name === 'GCash')?.balance, -87_925)
  })
  it('is empty on first run', () => assert.deepEqual(liquidAccounts(getMockData('no-accounts')), []))
  it('does not change when entries are added to a card', () => {
    const d = getMockData()
    const after = addTx(d, { accountId: BLUE, categoryId: EXPENSE_SHOPPING, amount: 100_000 })
    assert.deepEqual(liquidAccounts(after), liquidAccounts(d))
  })
})

describe('demo scenarios used to show rare card states', () => {
  it('over-limit: owed exceeds the limit, so available credit is negative', () => {
    const d = getMockData('over-limit')
    const everyday = cardStatus(account(d, EVERYDAY), d)
    assert.equal(everyday.owed, 3_680_000)
    assert.equal(everyday.availableCredit, -680_000)
    assert.equal(everyday.credit, 0)
  })
  it('paid-off: the card owes nothing, has no credit, and its whole limit is available; net position unchanged', () => {
    const d = getMockData('paid-off')
    const blue = cardStatus(account(d, BLUE), d)
    assert.equal(blue.owed, 0)
    assert.equal(blue.credit, 0)
    assert.equal(blue.availableCredit, blue.creditLimit)
    assert.equal(summarize(d, OCT).netPosition, summarize(getMockData(), OCT).netPosition)
  })
})

describe('available credit is not cash', () => {
  it('is limit − signed debt', () => {
    assert.equal(availableCredit(5_000_000, 1_425_000), 3_575_000)
    assert.equal(availableCredit(5_000_000, -300_000), 5_300_000) // overpaid card
    assert.equal(availableCredit(5_000_000, 5_200_000), -200_000) // over the limit
  })
  it('never changes money you have or net position', () => {
    const data = getMockData()
    const s = summarize(data, OCT)
    const richer = { ...data, accounts: data.accounts.map((a) => (a.id === BLUE ? { ...a, creditLimit: 9_000_000 } : a)) }
    const s2 = summarize(richer, OCT)
    assert.equal(s2.liquidBalance, s.liquidBalance)
    assert.equal(s2.netPosition, s.netPosition)
  })
})

describe('months', () => {
  it('only entries dated in the month count, including the first and last day', () => {
    let data = getMockData()
    data = addTx(data, { accountId: CASH, categoryId: EXPENSE_FOOD, amount: 1_000, date: '2026-09-30' })
    data = addTx(data, { accountId: CASH, categoryId: EXPENSE_FOOD, amount: 2_000, date: '2026-10-01' })
    data = addTx(data, { accountId: CASH, categoryId: EXPENSE_FOOD, amount: 4_000, date: '2026-10-31' })
    data = addTx(data, { accountId: CASH, categoryId: EXPENSE_FOOD, amount: 8_000, date: '2026-11-01' })
    assert.equal(summarize(data, OCT).monthExpenses, 2_712_740 + 2_000 + 4_000)
    assert.equal(summarize(data, '2026-09').monthExpenses, 1_000)
    assert.equal(summarize(data, '2026-11').monthExpenses, 8_000)
  })
  it('a month with no entries is all zeros, but balances still show', () => {
    const s = summarize(getMockData(), '2026-03')
    assert.equal(s.monthIncome, 0)
    assert.equal(s.monthExpenses, 0)
    assert.equal(s.netPosition, 3_314_625) // balances are "as of today"
  })
  it('monthOf / monthLabel / monthOptions', () => {
    assert.equal(monthOf('2026-10-24'), '2026-10')
    assert.equal(monthLabel('2026-10'), 'October 2026')
    assert.equal(monthLabel('2026-01'), 'January 2026')
    const options = monthOptions('2026-10-25')
    assert.equal(options.length, 12)
    assert.deepEqual(options[0], { value: '2026-10', label: 'October 2026' })
    assert.deepEqual(options[11], { value: '2025-11', label: 'November 2025' }) // wraps over the year
    assert.deepEqual(monthOptions('2026-02-10', 3).map((o) => o.value), ['2026-02', '2026-01', '2025-12'])
  })
})

describe('zero history and first run', () => {
  it('no accounts: everything is zero', () => {
    const s = summarize(getMockData('no-accounts'), OCT)
    assert.deepEqual(s, { liquidBalance: 0, outstandingDebt: 0, cardCredit: 0, netPosition: 0, monthIncome: 0, monthExpenses: 0 })
  })
  it('accounts with no entries show their opening values', () => {
    const base = getMockData()
    const empty: MockData = { ...base, transactions: [], payments: [] }
    assert.equal(liquidBalance(account(empty, CASH), empty), 481_175)
    assert.equal(signedCardDebt(account(empty, BLUE), empty), 1_197_275)
    assert.equal(buildActivity(empty, OCT).length, 0)
  })
  it('a card with zero opening debt and no entries owes nothing', () => {
    const base = getMockData()
    const fresh: MockData = { ...base, accounts: [{ id: 7, name: 'New Card', type: 'credit_card', openingBalance: 0, openingDebt: 0, creditLimit: 1_000_000 }], transactions: [], payments: [] }
    const status = cardStatus(fresh.accounts[0], fresh)
    assert.equal(status.owed, 0)
    assert.equal(status.availableCredit, 1_000_000)
  })
})

describe('money bound (aggregate totals)', () => {
  it('accepts amounts up to ±(2^52 − 1) centavos (₱45,035,996,273,704.95) and nothing beyond', () => {
    assert.equal(MAX_MONEY_CENTAVOS, 4_503_599_627_370_495)
    assert.equal(formatPeso(MAX_MONEY_CENTAVOS), '₱45,035,996,273,704.95')
    assert.equal(formatPeso(-MAX_MONEY_CENTAVOS), '−₱45,035,996,273,704.95')
    assert.equal(isMoney(MAX_MONEY_CENTAVOS), true)
    assert.equal(isMoney(MAX_MONEY_CENTAVOS + 1), false)
    assert.equal(isMoney(10.5), false)
    assert.equal(isMoney(Number.NaN), false)
  })
  it('formats an intermediate result beyond the bound exactly: only values that ENTER the client are bounded', () => {
    assert.equal(isMoney(MAX_MONEY_CENTAVOS + 100_000), false) // a server value this large is a contract error
    assert.equal(formatPeso(MAX_MONEY_CENTAVOS + 100_000), '₱45,035,996,274,704.95') // but a computed estimate of it prints
    assert.equal(formatPeso(-MAX_MONEY_CENTAVOS - 100_000), '−₱45,035,996,274,704.95')
    assert.equal(formatPeso(2 * MAX_MONEY_CENTAVOS), '₱90,071,992,547,409.90') // the largest sum of two accepted values
    assert.equal(formatPeso(Number.MAX_SAFE_INTEGER), '₱90,071,992,547,409.91')
    assert.throws(() => formatPeso(2 ** 53), RangeError) // no longer exact: refused
  })
  it('any sum or difference of two accepted amounts is still an exact integer', () => {
    const edge = [MAX_MONEY_CENTAVOS, -MAX_MONEY_CENTAVOS, MAX_MONEY_CENTAVOS - 1, 1, 0] // sums reach at most 2^53 - 2
    for (const a of edge) for (const b of edge) {
      assert.equal(Number.isSafeInteger(a + b), true, `${a} + ${b}`)
      assert.equal(Number.isSafeInteger(a - b), true, `${a} - ${b}`)
    }
  })
  it('one maximum entry (₱9,999,999,999.99) is far inside the bound; about 4,503 of them reach it', () => {
    const entry = 999_999_999_999
    assert.equal(Math.floor(MAX_MONEY_CENTAVOS / entry), 4503)
    assert.equal(isMoney(entry * 4503), true)
    assert.equal(isMoney(entry * 4504), false)
  })
})

describe('activity paging cap', () => {
  it('"Load more" grows by a page and never beyond 1000 rows', () => {
    assert.equal(ACTIVITY_PAGE_SIZE, 50)
    assert.equal(ACTIVITY_MAX_ROWS, 1000)
    assert.equal(nextPageSize(50), 100)
    assert.equal(nextPageSize(950), 1000)
    assert.equal(nextPageSize(1000), 1000)
    assert.equal(nextPageSize(980), 1000)
  })
  it('a ledger beyond the cap still pages exactly: 1,000 rows shown, more reported', () => {
    const huge = getMockData('huge')
    const page = activityPage(huge, OCT, null, ACTIVITY_MAX_ROWS)
    assert.equal(page.items.length, 1000)
    assert.equal(page.hasMore, true)
    assert.equal(activityPage(huge, OCT, null, 2000).items.length, 1218)
  })
})

describe('activity list', () => {
  const data = getMockData()
  it('contains expenses, income and the card payment for the month, newest first', () => {
    const items = buildActivity(data, OCT)
    assert.equal(items.length, 18) // 15 expenses + 2 income + 1 payment
    assert.deepEqual(items.slice(0, 5).map((i) => i.title), ['Lunch with team', 'Supermarket', 'Pharmacy', 'Card payment', 'Movie night'])
    const dates = items.map((i) => i.date)
    assert.deepEqual(dates, [...dates].sort().reverse())
  })
  it('labels kinds from the category, and shows the card payment as a payment', () => {
    const items = buildActivity(data, OCT)
    assert.equal(items.find((i) => i.title === 'October salary')?.kind, 'income')
    assert.equal(items.find((i) => i.title === 'Supermarket')?.kind, 'expense')
    const payment = items.find((i) => i.kind === 'payment')!
    assert.equal(payment.accountName, 'Main Savings')
    assert.equal(payment.cardName, 'Blue Card')
    assert.equal(payment.amount, 500_000)
    assert.equal(payment.categoryName, null)
  })
  it('the sum of expense rows equals the monthly expenses (payments excluded)', () => {
    const items = buildActivity(data, OCT)
    const expenses = items.filter((i) => i.kind === 'expense').reduce((a, i) => a + i.amount, 0)
    assert.equal(expenses, summarize(data, OCT).monthExpenses)
  })
  it('respects the limit and the month', () => {
    assert.equal(buildActivity(data, OCT, 6).length, 6)
    assert.equal(buildActivity(data, '2026-09').length, 0)
  })
  it('orders same-day entries by creation time, with a stable tie-break', () => {
    let d = getMockData()
    d = addTx(d, { id: 501, accountId: CASH, categoryId: EXPENSE_FOOD, amount: 100, date: '2026-10-26', note: 'early', createdAt: '2026-10-26T08:00:00.000Z' })
    d = addTx(d, { id: 502, accountId: CASH, categoryId: EXPENSE_FOOD, amount: 100, date: '2026-10-26', note: 'late', createdAt: '2026-10-26T18:00:00.000Z' })
    d = addTx(d, { id: 503, accountId: CASH, categoryId: EXPENSE_FOOD, amount: 100, date: '2026-10-26', note: 'late-tie', createdAt: '2026-10-26T18:00:00.000Z' })
    assert.deepEqual(buildActivity(d, OCT, 3).map((i) => i.title), ['late-tie', 'late', 'early'])
    assert.deepEqual(buildActivity(d, OCT, 3), buildActivity(d, OCT, 3))
  })
  it('uses the note as the title, or the category name when there is no note', () => {
    const d = addTx(getMockData(), { accountId: CASH, categoryId: EXPENSE_FOOD, amount: 100, note: null, date: '2026-10-27' })
    assert.equal(buildActivity(d, OCT, 1)[0].title, 'Food')
  })
})

describe('activity filters and paging', () => {
  const data = getMockData()
  it('an account filter keeps only that account, and a card payment matches either side', () => {
    const gcash = buildActivity(data, OCT, undefined, GCASH)
    assert.deepEqual([...new Set(gcash.map((i) => i.accountName))], ['GCash'])
    const viaSource = buildActivity(data, OCT, undefined, MAIN).filter((i) => i.kind === 'payment')
    const viaCard = buildActivity(data, OCT, undefined, BLUE).filter((i) => i.kind === 'payment')
    assert.equal(viaSource.length, 1)
    assert.equal(viaCard.length, 1)
    assert.equal(buildActivity(data, OCT, undefined, EVERYDAY).filter((i) => i.kind === 'payment').length, 0)
  })
  it('filters before the limit, so a capped list never hides a match', () => {
    const many = getMockData('many')
    const all = buildActivity(many, OCT, undefined, GCASH)
    assert.ok(all.length > 5)
    assert.deepEqual(buildActivity(many, OCT, 5, GCASH), all.slice(0, 5)) // the first five GCash entries, not GCash entries among the first five
  })
  it('activityPage shows `limit` entries and says whether there are more', () => {
    const many = getMockData('many')
    const first = activityPage(many, OCT, null, 50)
    assert.equal(first.items.length, 50)
    assert.equal(first.hasMore, true)
    const second = activityPage(many, OCT, null, 100)
    assert.equal(second.items.length, 58) // 17 + 1 payment + 40 extra
    assert.equal(second.hasMore, false)
    assert.equal(activityPage(data, OCT, null, 18).hasMore, false) // exactly one full page is not "more"
    assert.equal(activityPage(data, OCT, null, 17).hasMore, true)
    assert.deepEqual(second.items.slice(0, 50), first.items) // loading more never reorders what was already shown
  })
  it('an empty month and an unmatched filter both return nothing', () => {
    assert.deepEqual(activityPage(data, '2026-09', null, 50), { items: [], hasMore: false })
    assert.equal(activityPage(data, OCT, EVERYDAY, 50).items.length, 2) // Everyday Card has two October purchases
    assert.equal(activityPage(data, OCT, 999, 50).items.length, 0)
  })
  it('day headings are calendar-exact and groups keep the newest-first order', () => {
    assert.equal(dayHeading('2026-10-24'), 'Sat, Oct 24')
    assert.equal(dayHeading('2026-10-01'), 'Thu, Oct 1')
    assert.equal(dayHeading('2024-02-29'), 'Thu, Feb 29')
    const groups = groupByDate(buildActivity(data, OCT))
    assert.equal(groups.reduce((n, g) => n + g.items.length, 0), 18)
    const dates = groups.map((g) => g.date)
    assert.deepEqual(dates, [...dates].sort().reverse())
    assert.equal(new Set(dates).size, dates.length) // one group per day
  })
})

describe('invariants over many random operations (seeded, repeatable)', () => {
  // Small deterministic pseudo-random generator so a failure can always be reproduced.
  let seed = 20261025
  const next = (max: number) => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return seed % max
  }
  const sources = [CASH, MAIN, GCASH]
  const cards = [BLUE, EVERYDAY]

  it('any card payment leaves net position, monthly expenses and income unchanged', () => {
    let data = getMockData()
    for (let i = 0; i < 200; i++) {
      const s0 = summarize(data, OCT)
      data = addPayment(data, sources[next(3)], cards[next(2)], 1 + next(3_000_000))
      const s1 = summarize(data, OCT)
      assert.equal(s1.netPosition, s0.netPosition, `payment #${i}`)
      assert.equal(s1.monthExpenses, s0.monthExpenses, `payment #${i}`)
      assert.equal(s1.monthIncome, s0.monthIncome, `payment #${i}`)
    }
  })
  it('any card purchase lowers net position by exactly its amount and raises expenses by it', () => {
    let data = getMockData()
    for (let i = 0; i < 200; i++) {
      const s0 = summarize(data, OCT)
      const amount = 1 + next(500_000)
      data = addTx(data, { accountId: cards[next(2)], categoryId: EXPENSE_SHOPPING, amount })
      const s1 = summarize(data, OCT)
      assert.equal(s1.netPosition, s0.netPosition - amount, `purchase #${i}`)
      assert.equal(s1.monthExpenses, s0.monthExpenses + amount, `purchase #${i}`)
      assert.equal(s1.liquidBalance, s0.liquidBalance, `purchase #${i}`)
    }
  })
  it('net position always equals money you have − card debt + card credit, in whole centavos', () => {
    let data = getMockData()
    for (let i = 0; i < 200; i++) {
      const roll = next(4)
      if (roll === 0) data = addPayment(data, sources[next(3)], cards[next(2)], 1 + next(4_000_000))
      else if (roll === 1) data = addTx(data, { accountId: cards[next(2)], categoryId: EXPENSE_SHOPPING, amount: 1 + next(600_000) })
      else if (roll === 2) data = addTx(data, { accountId: sources[next(3)], categoryId: EXPENSE_FOOD, amount: 1 + next(300_000) })
      else data = addTx(data, { accountId: sources[next(3)], categoryId: INCOME_SALARY, amount: 1 + next(900_000) })
      const s = summarize(data, OCT)
      assert.equal(s.netPosition, s.liquidBalance - s.outstandingDebt + s.cardCredit, `step #${i}`)
      for (const v of Object.values(s)) assert.ok(Number.isSafeInteger(v), `step #${i}`)
    }
  })
})
