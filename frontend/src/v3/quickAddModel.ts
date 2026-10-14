import type { AddTransactionInput, FinanceState, Transaction } from '../domain/finance'
import { favoriteIds } from '../domain/favorites'
import { accountLabel, categoriesForTransactionType } from '../state/financeSelectors'
import { formatMinorUnits } from '../utils/currency'
import { isValidIsoDate, isValidTime24 } from '../utils/date'
import { exactMinor, parseMinorUnitInput } from '../utils/money'

/**
 * Pure rules for V3 Quick Add. Nothing here posts anything: `buildQuickAddInput`
 * produces the same `AddTransactionInput` the legacy composer produces, and the
 * existing gateway / ledger / outbox path posts it. "Card Payment" is only a
 * presentation of a transfer whose destination is a credit card.
 */
export type QuickAddType = 'expense' | 'income' | 'transfer' | 'card_payment'
export const QUICK_ADD_TYPES: { id: QuickAddType; label: string }[] = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'card_payment', label: 'Card Payment' },
]

export interface QuickAddDraft {
  type: QuickAddType
  amount: string
  /** expense / income account */
  accountId: string
  /** transfer / card payment source */
  fromAccountId: string
  /** transfer destination, or the card being paid */
  toAccountId: string
  categoryId: string
  title: string
  date: string
  time: string
  note: string
  fee: string
}

export type QuickAddField = 'amount' | 'accountId' | 'fromAccountId' | 'toAccountId' | 'categoryId' | 'title' | 'date' | 'time' | 'note' | 'fee'
export const QUICK_ADD_FIELD_ORDER: readonly QuickAddField[] = ['amount', 'accountId', 'fromAccountId', 'toAccountId', 'categoryId', 'fee', 'title', 'date', 'time', 'note']
export type QuickAddErrors = Partial<Record<QuickAddField, string>>

export interface AccountOption {
  id: string
  /** Name with institution / last four so similarly named accounts are distinguishable. */
  label: string
  detail: string
  favorite: boolean
  isCard: boolean
  /** Outstanding card debt, minor units (cards only). */
  owedMinor?: bigint
}

export type AccountRole = 'expense' | 'income' | 'from' | 'transferTo' | 'cardTo'

function optionFor(state: FinanceState, id: string, favorites: string[]): AccountOption | undefined {
  const account = state.accounts.find((a) => a.id === id)
  if (account) {
    const bal = formatMinorUnits(exactMinor(account.balanceMinor, account.balance), { withCents: true })
    return { id, label: accountLabel(state, id), detail: `${account.institution ? `${account.institution} · ` : ''}${bal}`, favorite: favorites.includes(id), isCard: false }
  }
  const card = state.creditCards.find((c) => c.id === id)
  if (card) {
    const owed = exactMinor(card.balanceMinor, card.balance)
    return { id, label: accountLabel(state, id), detail: `owes ${formatMinorUnits(owed, { withCents: true })}`, favorite: favorites.includes(id), isCard: true, owedMinor: owed }
  }
  return undefined
}

/** Eligible accounts for a role: favorites first (in favorite order), then the rest by name. Archived accounts never reach `state`. */
export function accountOptions(state: FinanceState, role: AccountRole): AccountOption[] {
  const favorites = favoriteIds(state)
  const ids: string[] = []
  if (role === 'expense') ids.push(...state.accounts.map((a) => a.id), ...state.creditCards.map((c) => c.id))
  else if (role === 'income' || role === 'from' || role === 'transferTo') ids.push(...state.accounts.map((a) => a.id))
  else ids.push(...state.creditCards.filter((c) => exactMinor(c.balanceMinor, c.balance) > 0n).map((c) => c.id))
  const options = ids.map((id) => optionFor(state, id, favorites)).filter((o): o is AccountOption => !!o)
  return options.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    if (a.favorite && b.favorite) return favorites.indexOf(a.id) - favorites.indexOf(b.id)
    return a.label.localeCompare(b.label)
  })
}

export function categoryOptions(state: FinanceState, type: QuickAddType) {
  return type === 'expense' || type === 'income' ? categoriesForTransactionType(state.categories, type) : []
}

function firstId(options: AccountOption[], exclude?: string): string {
  return options.find((o) => o.id !== exclude)?.id ?? ''
}

/** Default selection for the type's account fields: top favorite (or first eligible). Never a card for income. */
export function defaultAccounts(state: FinanceState, type: QuickAddType, keep: Partial<QuickAddDraft> = {}): Pick<QuickAddDraft, 'accountId' | 'fromAccountId' | 'toAccountId'> {
  const valid = (id: string | undefined, role: AccountRole) => (id && accountOptions(state, role).some((o) => o.id === id) ? id : '')
  if (type === 'expense' || type === 'income') {
    const role = type
    const accountId = valid(keep.accountId, role) || valid(keep.fromAccountId, role) || firstId(accountOptions(state, role))
    return { accountId, fromAccountId: '', toAccountId: '' }
  }
  const from = valid(keep.fromAccountId, 'from') || valid(keep.accountId, 'from') || firstId(accountOptions(state, 'from'))
  if (type === 'transfer') {
    const to = valid(keep.toAccountId, 'transferTo')
    return { accountId: '', fromAccountId: from, toAccountId: to && to !== from ? to : firstId(accountOptions(state, 'transferTo'), from) }
  }
  return { accountId: '', fromAccountId: from, toAccountId: valid(keep.toAccountId, 'cardTo') || firstId(accountOptions(state, 'cardTo')) }
}

export function emptyDraft(state: FinanceState, todayIso: string, type: QuickAddType = 'expense'): QuickAddDraft {
  return { type, amount: '', categoryId: '', title: '', date: todayIso, time: '', note: '', fee: '', ...defaultAccounts(state, type) }
}

/** Switch type keeping amount, text fields, date and any account / category that is still valid. */
export function switchType(state: FinanceState, draft: QuickAddDraft, type: QuickAddType): QuickAddDraft {
  if (type === draft.type) return draft
  const validCategory = categoryOptions(state, type).some((c) => c.id === draft.categoryId)
  const next: QuickAddDraft = { ...draft, type, categoryId: validCategory ? draft.categoryId : '', fee: type === 'transfer' ? draft.fee : '', ...defaultAccounts(state, type, draft) }
  return next
}

export function isDirty(draft: QuickAddDraft, initial: QuickAddDraft): boolean {
  return (['amount', 'title', 'note', 'fee', 'time', 'categoryId'] as const).some((k) => draft[k] !== initial[k]) || draft.date !== initial.date || draft.type !== initial.type
    || draft.accountId !== initial.accountId || draft.fromAccountId !== initial.fromAccountId || draft.toAccountId !== initial.toAccountId
}

export function validateDraft(state: FinanceState, d: QuickAddDraft): QuickAddErrors {
  const errors: QuickAddErrors = {}
  const amount = parseMinorUnitInput(d.amount)
  if (!d.amount.trim()) errors.amount = 'Enter an amount greater than zero.'
  else if (!amount.ok) errors.amount = amount.error
  else if (amount.value <= 0n) errors.amount = 'Enter an amount greater than zero.'

  if (d.type === 'expense' || d.type === 'income') {
    if (!d.accountId) errors.accountId = d.type === 'income' ? 'Choose the account that receives the income.' : 'Choose the account or card that paid.'
    else if (!accountOptions(state, d.type).some((o) => o.id === d.accountId)) errors.accountId = d.type === 'income' ? 'Income can only go into a cash, bank or e-wallet account.' : 'That account is not available.'
    if (!d.categoryId) errors.categoryId = 'Choose a category.'
    else if (!categoryOptions(state, d.type).some((c) => c.id === d.categoryId)) errors.categoryId = `That category can't be used for ${d.type === 'income' ? 'income' : 'expenses'}.`
  } else {
    if (!d.fromAccountId) errors.fromAccountId = d.type === 'card_payment' ? 'Choose the account you pay from.' : 'Choose the source account.'
    if (!d.toAccountId) errors.toAccountId = d.type === 'card_payment' ? (accountOptions(state, 'cardTo').length === 0 ? 'No credit card has an outstanding balance.' : 'Choose the card to pay.') : 'Choose the destination account.'
    else if (d.type === 'transfer' && d.toAccountId === d.fromAccountId) errors.toAccountId = "Source and destination can't be the same account."
    else if (!accountOptions(state, d.type === 'transfer' ? 'transferTo' : 'cardTo').some((o) => o.id === d.toAccountId)) errors.toAccountId = d.type === 'card_payment' ? 'Choose a card with an outstanding balance.' : 'That account is not available.'
    if (d.type === 'card_payment' && !errors.amount && !errors.toAccountId && amount.ok) {
      const owed = state.creditCards.find((c) => c.id === d.toAccountId)
      if (owed && amount.value > exactMinor(owed.balanceMinor, owed.balance)) errors.amount = `Payment can't exceed the ${formatMinorUnits(exactMinor(owed.balanceMinor, owed.balance), { withCents: true })} owed on this card.`
    }
    if (d.type === 'transfer' && d.fee.trim()) {
      const fee = parseMinorUnitInput(d.fee)
      if (!fee.ok) errors.fee = fee.error
    }
  }
  if (!d.date) errors.date = 'Date is required.'
  else if (!isValidIsoDate(d.date)) errors.date = 'Enter a real calendar date.'
  if (d.time && !isValidTime24(d.time)) errors.time = 'Enter a time between 00:00 and 23:59.'
  return errors
}

/** Builds the existing `AddTransactionInput`. Card Payment is a transfer to the card. Call only after `validateDraft` is clean. */
export function buildQuickAddInput(state: FinanceState, d: QuickAddDraft, idempotencyKey: string): AddTransactionInput {
  const amountMinor = parseMinorUnitInput(d.amount)
  const feeMinor = d.type === 'transfer' && d.fee.trim() ? parseMinorUnitInput(d.fee) : undefined
  if (!amountMinor.ok) throw new Error(amountMinor.error)
  const transfer = d.type === 'transfer' || d.type === 'card_payment'
  const categoryName = state.categories.find((c) => c.id === d.categoryId)?.name
  let title = d.title.trim()
  if (!title) {
    if (d.type === 'card_payment') title = `Card payment · ${accountLabel(state, d.fromAccountId)} → ${accountLabel(state, d.toAccountId)}`
    else if (d.type === 'transfer') title = `${accountLabel(state, d.fromAccountId)} → ${accountLabel(state, d.toAccountId)}`
    else title = categoryName ?? (d.type === 'income' ? 'Income' : 'Expense')
  }
  return {
    type: d.type === 'card_payment' ? 'transfer' : d.type,
    title,
    categoryId: transfer ? undefined : d.categoryId,
    accountId: transfer ? undefined : d.accountId,
    fromAccountId: transfer ? d.fromAccountId : undefined,
    toAccountId: transfer ? d.toAccountId : undefined,
    date: d.date,
    time: d.time || undefined,
    amount: Number(amountMinor.value) / 100,
    amountMinor: amountMinor.value.toString(),
    fee: feeMinor?.ok ? Number(feeMinor.value) / 100 : undefined,
    feeMinor: feeMinor?.ok ? feeMinor.value.toString() : undefined,
    note: d.note.trim() || undefined,
    idempotencyKey,
  }
}

/** Maps a server/ledger field name onto the field the user sees for this type. */
export function fieldForServer(type: QuickAddType, field: string | undefined): QuickAddField {
  switch (field) {
    case 'amountMinor': case 'amount': return 'amount'
    case 'feeMinor': case 'fee': return 'fee'
    case 'categoryId': return 'categoryId'
    case 'occurredOn': case 'date': return 'date'
    case 'occurredTime': case 'time': return 'time'
    case 'fromAccountId': return type === 'expense' ? 'accountId' : type === 'income' ? 'accountId' : 'fromAccountId'
    case 'toAccountId': return type === 'income' ? 'accountId' : 'toAccountId'
    case 'accountId': return 'accountId'
    default: return 'amount'
  }
}

/** A short list of the user's recent values for a type (no new storage: derived from loaded transactions). */
export interface QuickPicks { categoryIds: string[]; accountIds: string[]; reusable: Transaction[] }
export function quickPicks(state: FinanceState, type: QuickAddType): QuickPicks {
  const matches = (t: Transaction) => (type === 'card_payment' ? t.type === 'transfer' && state.creditCards.some((c) => c.id === t.toAccountId) && !t.goalId : type === 'transfer' ? t.type === 'transfer' && !t.goalId && !state.creditCards.some((c) => c.id === t.toAccountId) : t.type === type)
  const recent = [...state.transactions].filter((t) => matches(t)).sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`))
  const distinct = <T,>(values: (T | undefined)[], n: number) => [...new Set(values.filter((v): v is T => v !== undefined && v !== ''))].slice(0, n)
  const eligibleIds = new Set(accountOptions(state, type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'from').map((o) => o.id))
  const eligibleCats = new Set(categoryOptions(state, type).map((c) => c.id))
  return {
    categoryIds: distinct(recent.map((t) => t.categoryId).filter((id) => id && eligibleCats.has(id)), 4),
    accountIds: distinct(recent.map((t) => (type === 'expense' || type === 'income' ? t.accountId : t.fromAccountId)).filter((id) => id && eligibleIds.has(id)), 3),
    reusable: recent.slice(0, 5),
  }
}

/** A prefilled draft from an earlier transaction. Never copies the date: the new entry is dated today. */
export function draftFromTransaction(state: FinanceState, t: Transaction, type: QuickAddType, todayIso: string): QuickAddDraft {
  const base = emptyDraft(state, todayIso, type)
  const amountMinor = exactMinor(t.amountMinor, t.amount)
  const amount = `${amountMinor / 100n}.${(amountMinor % 100n).toString().padStart(2, '0')}`
  const merged: QuickAddDraft = { ...base, amount, title: type === 'transfer' || type === 'card_payment' ? '' : t.title, note: '', categoryId: t.categoryId && categoryOptions(state, type).some((c) => c.id === t.categoryId) ? t.categoryId : '' }
  return { ...merged, ...defaultAccounts(state, type, { accountId: t.accountId, fromAccountId: t.fromAccountId, toAccountId: t.toAccountId }) }
}
