import { describe, expect, it } from 'vitest'
import type { FinanceState, Transaction } from '../domain/finance'
import { accountOptions, buildQuickAddInput, defaultAccounts, draftFromTransaction, emptyDraft, fieldForServer, isDirty, quickPicks, switchType, validateDraft } from './quickAddModel'

const acct = (id: string, name: string, balanceMinor: string, extra = {}) => ({ id, name, type: 'checking' as const, classification: 'asset' as const, balance: Number(balanceMinor) / 100, balanceMinor, syncStatus: 'manual' as const, ...extra })
const card = (id: string, name: string, owed: string, extra = {}) => ({ id, name, lastFour: '4242', network: 'visa' as const, balance: Number(owed) / 100, balanceMinor: owed, limit: 1000, limitMinor: '100000', dueDate: '2026-10-20', minPayment: 10, minPaymentMinor: '1000', ...extra })
const base: FinanceState = {
  accounts: [acct('a1', 'Alpha', '100000'), acct('a2', 'Beta', '50000', { favoriteRank: 1 }), acct('a3', 'Beta', '1000', { institution: 'Other Bank', lastFour: '9999' })],
  creditCards: [card('c1', 'Visa', '25000', { favoriteRank: 2 }), card('c2', 'Paid Off', '0')],
  categories: [{ id: 'food', name: 'Food', color: '#000', budgetable: true, transactionKinds: ['expense'] }, { id: 'pay', name: 'Salary', color: '#000', budgetable: false, transactionKinds: ['income'] }],
  transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [], favoritesConfigured: true,
}
const tx = (o: Partial<Transaction>): Transaction => ({ id: 't', type: 'expense', title: 'x', date: '2026-10-01', amount: 10, amountMinor: '1000', source: 'manual', status: 'cleared', ...o })

describe('accountOptions', () => {
  it('lists favorites first in favorite order, then the rest', () => {
    expect(accountOptions(base, 'expense').map((o) => o.id)).toEqual(['a2', 'c1', 'a1', 'a3', 'c2'])
  })
  it('never offers a credit card for income, from or transfer destination', () => {
    for (const role of ['income', 'from', 'transferTo'] as const) expect(accountOptions(base, role).some((o) => o.isCard)).toBe(false)
  })
  it('offers only cards with a balance owed as card-payment targets', () => {
    expect(accountOptions(base, 'cardTo').map((o) => o.id)).toEqual(['c1'])
  })
  it('works with zero favorites and distinguishes same-named accounts', () => {
    const none = { ...base, accounts: base.accounts.map((a) => ({ ...a, favoriteRank: null })), creditCards: base.creditCards.map((c) => ({ ...c, favoriteRank: null })), favoritesConfigured: false }
    const options = accountOptions(none, 'income')
    expect(options.map((o) => o.id)).toEqual(['a1', 'a3', 'a2'].sort((x, y) => options.findIndex((o) => o.id === x) - options.findIndex((o) => o.id === y)))
    const betas = options.filter((o) => o.id !== 'a1')
    expect(new Set(betas.map((o) => `${o.label}|${o.detail}`)).size).toBe(2)
  })
})

describe('defaults and type switching', () => {
  it('defaults to the top favorite and never a card for income', () => {
    expect(emptyDraft(base, '2026-10-14', 'income').accountId).toBe('a2')
    expect(emptyDraft(base, '2026-10-14', 'expense').accountId).toBe('a2')
  })
  it('keeps amount/date/title and a still-valid account when switching, drops invalid category', () => {
    let d = { ...emptyDraft(base, '2026-10-14'), amount: '12.50', title: 'Lunch', categoryId: 'food', accountId: 'c1' }
    d = switchType(base, d, 'income')
    expect(d).toMatchObject({ type: 'income', amount: '12.50', title: 'Lunch', categoryId: '' })
    expect(d.accountId).not.toBe('c1')
    d = switchType(base, { ...d, accountId: 'a1' }, 'transfer')
    expect(d.fromAccountId).toBe('a1')
    expect(d.toAccountId).not.toBe('a1')
    d = switchType(base, d, 'card_payment')
    expect(d.toAccountId).toBe('c1')
  })
  it('defaultAccounts leaves the card target empty when no card owes money', () => {
    const paid = { ...base, creditCards: [card('c2', 'Paid Off', '0')] }
    expect(defaultAccounts(paid, 'card_payment').toAccountId).toBe('')
  })
  it('isDirty ignores an untouched draft', () => {
    const d = emptyDraft(base, '2026-10-14')
    expect(isDirty(d, d)).toBe(false)
    expect(isDirty({ ...d, amount: '1' }, d)).toBe(true)
  })
})

describe('validateDraft', () => {
  const ok = { ...emptyDraft(base, '2026-10-14'), amount: '10', categoryId: 'food' }
  it('accepts a valid expense, including a card charge', () => {
    expect(validateDraft(base, ok)).toEqual({})
    expect(validateDraft(base, { ...ok, accountId: 'c1' })).toEqual({})
  })
  it('requires a positive amount', () => {
    expect(validateDraft(base, { ...ok, amount: '' }).amount).toBeTruthy()
    expect(validateDraft(base, { ...ok, amount: '0' }).amount).toBeTruthy()
    expect(validateDraft(base, { ...ok, amount: '-5' }).amount).toBeTruthy()
    expect(validateDraft(base, { ...ok, amount: '1.234' }).amount).toBeTruthy()
  })
  it('requires an eligible category for the type', () => {
    expect(validateDraft(base, { ...ok, categoryId: '' }).categoryId).toBeTruthy()
    expect(validateDraft(base, { ...ok, categoryId: 'pay' }).categoryId).toMatch(/can't be used for expenses/)
  })
  it('rejects income into a card', () => {
    expect(validateDraft(base, { ...ok, type: 'income', categoryId: 'pay', accountId: 'c1' }).accountId).toMatch(/never|only/i)
  })
  it('rejects same-account transfers and card targets in plain transfers', () => {
    const t = { ...ok, type: 'transfer' as const, categoryId: '', accountId: '', fromAccountId: 'a1', toAccountId: 'a1' }
    expect(validateDraft(base, t).toAccountId).toMatch(/same/)
    expect(validateDraft(base, { ...t, toAccountId: 'c1' }).toAccountId).toBeTruthy()
    expect(validateDraft(base, { ...t, toAccountId: 'a2', fee: 'abc' }).fee).toBeTruthy()
    expect(validateDraft(base, { ...t, toAccountId: 'a2', fee: '1.50' })).toEqual({})
  })
  it('blocks card overpayment and cards with nothing owed', () => {
    const p = { ...ok, type: 'card_payment' as const, categoryId: '', accountId: '', fromAccountId: 'a1', toAccountId: 'c1', amount: '250.01' }
    expect(validateDraft(base, p).amount).toMatch(/exceed/)
    expect(validateDraft(base, { ...p, amount: '250.00' })).toEqual({})
    expect(validateDraft(base, { ...p, toAccountId: 'c2' }).toAccountId).toBeTruthy()
  })
  it('validates date and time', () => {
    expect(validateDraft(base, { ...ok, date: '2026-02-30' }).date).toBeTruthy()
    expect(validateDraft(base, { ...ok, time: '25:00' }).time).toBeTruthy()
  })
})

describe('buildQuickAddInput', () => {
  it('builds exact minor units and an expense input', () => {
    const i = buildQuickAddInput(base, { ...emptyDraft(base, '2026-10-14'), amount: '1,234.5', categoryId: 'food' }, 'k1')
    expect(i).toMatchObject({ type: 'expense', accountId: 'a2', categoryId: 'food', amountMinor: '123450', idempotencyKey: 'k1', title: 'Food', date: '2026-10-14' })
  })
  it('maps income to the account field with a category title default', () => {
    const i = buildQuickAddInput(base, { ...emptyDraft(base, '2026-10-14', 'income'), amount: '5', categoryId: 'pay', title: ' Pay day ' }, 'k')
    expect(i).toMatchObject({ type: 'income', accountId: 'a2', title: 'Pay day', amountMinor: '500' })
  })
  it('submits a card payment as a transfer to the card with no category', () => {
    const d = { ...emptyDraft(base, '2026-10-14', 'card_payment'), amount: '100' }
    const i = buildQuickAddInput(base, d, 'k')
    expect(i).toMatchObject({ type: 'transfer', fromAccountId: 'a2', toAccountId: 'c1', categoryId: undefined, accountId: undefined })
    expect(i.title).toMatch(/^Card payment/)
  })
  it('carries the transfer fee only for transfers', () => {
    const t = { ...emptyDraft(base, '2026-10-14', 'transfer'), amount: '10', fee: '1.5' }
    expect(buildQuickAddInput(base, t, 'k')).toMatchObject({ feeMinor: '150' })
    expect(buildQuickAddInput(base, { ...t, type: 'card_payment' }, 'k').feeMinor).toBeUndefined()
  })
})

describe('quick picks and field mapping', () => {
  const s: FinanceState = { ...base, transactions: [
    tx({ id: '1', categoryId: 'food', accountId: 'a1', date: '2026-10-02' }),
    tx({ id: '2', categoryId: 'food', accountId: 'a3', date: '2026-10-03' }),
    tx({ id: '3', type: 'income', categoryId: 'pay', accountId: 'a1' }),
    tx({ id: '4', type: 'transfer', fromAccountId: 'a1', toAccountId: 'c1', amountMinor: '5000', amount: 50 }),
  ] }
  it('derives recent categories, accounts and reusable entries per type', () => {
    const p = quickPicks(s, 'expense')
    expect(p.categoryIds).toEqual(['food'])
    expect(p.accountIds).toEqual(['a3', 'a1'])
    expect(p.reusable.map((t) => t.id)).toEqual(['2', '1'])
    expect(quickPicks(s, 'card_payment').reusable.map((t) => t.id)).toEqual(['4'])
    expect(quickPicks(s, 'transfer').reusable).toEqual([])
  })
  it('a reused draft is dated today and keeps exact amount', () => {
    const d = draftFromTransaction(s, tx({ categoryId: 'food', accountId: 'a1', amountMinor: '123456', amount: 1234.56 }), 'expense', '2026-10-14')
    expect(d).toMatchObject({ amount: '1234.56', date: '2026-10-14', accountId: 'a1', categoryId: 'food' })
  })
  it('maps server fields to visible fields', () => {
    expect(fieldForServer('expense', 'fromAccountId')).toBe('accountId')
    expect(fieldForServer('income', 'toAccountId')).toBe('accountId')
    expect(fieldForServer('card_payment', 'toAccountId')).toBe('toAccountId')
    expect(fieldForServer('transfer', 'feeMinor')).toBe('fee')
    expect(fieldForServer('expense', undefined)).toBe('amount')
  })
})
