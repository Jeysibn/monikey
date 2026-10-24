import type { ActivityItem, Centavos, MockData } from '../types.ts'
import { amountText, parseAmount, type EntryKind, type EntryValues } from './entryForm.ts'
import { cardStatus, formatDate, isCard, monthOf } from './finance.ts'
import { formatPeso } from './money.ts'

/*
 * The in-memory ledger for the mock (Milestone 4.5). `ledgerReducer` stands in for the API's writes:
 * a pure function from the current data and an action to the next data, so every screen shows the same
 * numbers after a save. The real client will send these actions to FastAPI and re-fetch instead.
 * New ids are max + 1; `createdAt` is passed in so the reducer stays pure (and testable).
 */
export type LedgerAction =
  | {
      type: 'add-transaction'
      accountId: number
      categoryId: number
      amount: Centavos
      date: string
      note: string | null
      createdAt: string
    }
  | {
      type: 'add-payment'
      sourceAccountId: number
      cardAccountId: number
      amount: Centavos
      date: string
      note: string | null
      createdAt: string
    }

/** One stored entry: a row of the transactions table or of the credit-card payments table. */
export interface EntryTarget {
  table: 'transaction' | 'payment'
  id: number
}

export type LedgerEdit =
  | {
      type: 'update-transaction'
      id: number
      accountId: number
      categoryId: number
      amount: Centavos
      date: string
      note: string | null
    }
  | {
      type: 'update-payment'
      id: number
      sourceAccountId: number
      cardAccountId: number
      amount: Centavos
      date: string
      note: string | null
    }
  | { type: 'delete-transaction'; id: number }
  | { type: 'delete-payment'; id: number }

const nextId = (rows: { id: number }[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1

export function ledgerReducer(data: MockData, action: LedgerAction | LedgerEdit): MockData {
  switch (action.type) {
    case 'add-transaction':
      return {
        ...data,
        transactions: [
          ...data.transactions,
          {
            id: nextId(data.transactions),
            accountId: action.accountId,
            categoryId: action.categoryId,
            amount: action.amount,
            date: action.date,
            note: action.note,
            createdAt: action.createdAt,
          },
        ],
      }
    case 'add-payment':
      return {
        ...data,
        payments: [
          ...data.payments,
          {
            id: nextId(data.payments),
            sourceAccountId: action.sourceAccountId,
            cardAccountId: action.cardAccountId,
            amount: action.amount,
            date: action.date,
            note: action.note,
            createdAt: action.createdAt,
          },
        ],
      }
    case 'update-transaction': {
      if (!data.transactions.some((t) => t.id === action.id)) return data
      const { type: _type, ...fields } = action
      return { ...data, transactions: data.transactions.map((t) => (t.id === action.id ? { ...t, ...fields } : t)) }
    }
    case 'update-payment': {
      if (!data.payments.some((p) => p.id === action.id)) return data
      const { type: _type, ...fields } = action
      return { ...data, payments: data.payments.map((p) => (p.id === action.id ? { ...p, ...fields } : p)) }
    }
    case 'delete-transaction':
      if (!data.transactions.some((t) => t.id === action.id)) return data
      return { ...data, transactions: data.transactions.filter((t) => t.id !== action.id) }
    case 'delete-payment':
      if (!data.payments.some((p) => p.id === action.id)) return data
      return { ...data, payments: data.payments.filter((p) => p.id !== action.id) }
  }
}

/** Turns validated form values into a ledger action. Call only when `validate()` found no errors. */
export function toAction(v: EntryValues, createdAt: string): LedgerAction {
  const amount = parseAmount(v.amount)
  if (!amount.ok || v.accountId === null) throw new Error('toAction needs valid values')
  const note = v.note.trim() === '' ? null : v.note.trim()
  if (v.kind === 'payment') {
    if (v.cardId === null) throw new Error('toAction needs a card for a payment')
    return { type: 'add-payment', sourceAccountId: v.accountId, cardAccountId: v.cardId, amount: amount.centavos, date: v.date, note, createdAt }
  }
  if (v.categoryId === null) throw new Error('toAction needs a category')
  return { type: 'add-transaction', accountId: v.accountId, categoryId: v.categoryId, amount: amount.centavos, date: v.date, note, createdAt }
}

/** What the card owes now, in words, from the data AFTER the save (the API's re-fetched figures later). */
function cardClause(name: string, cardId: number, data: MockData): string {
  const card = data.accounts.find((a) => a.id === cardId)
  if (!card) return ''
  const status = cardStatus(card, data)
  if (status.owed > 0) return ` ${name} now owes ${formatPeso(status.owed)}.`
  if (status.credit > 0) return ` ${name} now has ${formatPeso(status.credit)} card credit.`
  return ` ${name} now owes nothing.`
}

/** The one confirmation message (spec section 7, Success). `after` is the data after the save. */
export function saveMessage(v: EntryValues, after: MockData): string {
  const amount = parseAmount(v.amount)
  const from = after.accounts.find((a) => a.id === v.accountId)
  if (!amount.ok || !from) return 'Saved.'
  const money = formatPeso(amount.centavos)

  if (v.kind === 'payment') {
    const card = after.accounts.find((a) => a.id === v.cardId)
    if (!card) return 'Card payment saved.'
    return `Card payment saved: ${money} from ${from.name} to ${card.name}.${cardClause(card.name, card.id, after)} Card payments don't count as expenses and don't change your net position.`
  }
  if (v.kind === 'income') return `Income saved: +${money} to ${from.name}.`
  return `Expense saved: −${money} from ${from.name}.${isCard(from) ? cardClause(from.name, from.id, after) : ''}`
}

/** Turns validated form values into an update of an existing entry (same id and creation time). */
export function toUpdateAction(v: EntryValues, target: EntryTarget): LedgerEdit {
  const amount = parseAmount(v.amount)
  if (!amount.ok || v.accountId === null) throw new Error('toUpdateAction needs valid values')
  const note = v.note.trim() === '' ? null : v.note.trim()
  if (target.table === 'payment') {
    if (v.cardId === null) throw new Error('toUpdateAction needs a card for a payment')
    return { type: 'update-payment', id: target.id, sourceAccountId: v.accountId, cardAccountId: v.cardId, amount: amount.centavos, date: v.date, note }
  }
  if (v.categoryId === null) throw new Error('toUpdateAction needs a category')
  return { type: 'update-transaction', id: target.id, accountId: v.accountId, categoryId: v.categoryId, amount: amount.centavos, date: v.date, note }
}

export const toDeleteAction = (target: EntryTarget): LedgerEdit =>
  target.table === 'payment' ? { type: 'delete-payment', id: target.id } : { type: 'delete-transaction', id: target.id }

export const targetOf = (item: ActivityItem): EntryTarget => ({ table: item.kind === 'payment' ? 'payment' : 'transaction', id: item.id })

/** False when the entry is gone (for example deleted in another tab). */
export const entryExists = (data: MockData, t: EntryTarget): boolean =>
  (t.table === 'payment' ? data.payments : data.transactions).some((row) => row.id === t.id)

/** The form values for editing an entry, or null if it no longer exists. The kind comes from the category. */
export function entryValues(data: MockData, t: EntryTarget): EntryValues | null {
  if (t.table === 'payment') {
    const p = data.payments.find((row) => row.id === t.id)
    if (!p) return null
    return { kind: 'payment', amount: amountText(p.amount), accountId: p.sourceAccountId, cardId: p.cardAccountId, categoryId: null, date: p.date, note: p.note ?? '' }
  }
  const row = data.transactions.find((x) => x.id === t.id)
  const category = row && data.categories.find((c) => c.id === row.categoryId)
  if (!row || !category) return null
  return { kind: category.type as EntryKind, amount: amountText(row.amount), accountId: row.accountId, cardId: null, categoryId: row.categoryId, date: row.date, note: row.note ?? '' }
}

/** A card's position in words: "₱9,250.00 owed", "₱500.00 card credit" or "nothing owed". */
const cardWords = (signedDebt: Centavos): string =>
  signedDebt > 0 ? `${formatPeso(signedDebt)} owed` : signedDebt < 0 ? `${formatPeso(-signedDebt)} card credit` : 'nothing owed'

/**
 * What a delete does to a card. When the card stays on one side of zero, "owed goes up/down by the amount"
 * is exact; when the card is in credit before or after, the amount does not map onto "owed" one for one,
 * so the actual before and after are stated instead.
 */
function cardEffect(card: string, before: Centavos, after: Centavos, amount: string, direction: 'up' | 'down'): string {
  if (before >= 0 && after >= 0) return `${card} owed goes ${direction} by ${amount}`
  return `${card} goes from ${cardWords(before)} to ${cardWords(after)}`
}

export interface DeleteSummary {
  title: string // "Delete this expense?"
  entry: string // "Lunch with team · −₱385.00 · Oct 24, 2026 · GCash"
  effect: string // what deleting changes, in words (spec section 10)
  button: string // "Delete expense"
  done: string // "Expense deleted."
}

/** The words of the delete confirmation. The monthly clause is left out when the entry is not in the month being viewed. */
export function deleteSummary(data: MockData, t: EntryTarget, viewedMonth: string): DeleteSummary | null {
  const v = entryValues(data, t)
  const amount = v && parseAmount(v.amount)
  const from = data.accounts.find((a) => a.id === v?.accountId)
  if (!v || !amount || !amount.ok || !from) return null
  const money = formatPeso(amount.centavos)
  const date = formatDate(v.date)
  const afterDelete = ledgerReducer(data, toDeleteAction(t))
  const debtBefore = (card: { id: number }) => cardStatus(data.accounts.find((a) => a.id === card.id)!, data).signedDebt
  const debtAfter = (card: { id: number }) => cardStatus(data.accounts.find((a) => a.id === card.id)!, afterDelete).signedDebt
  const monthly = monthOf(v.date) === viewedMonth
  const cant = " This can't be undone."

  if (v.kind === 'payment') {
    const card = data.accounts.find((a) => a.id === v.cardId)
    if (!card) return null
    return {
      title: 'Delete this card payment?',
      entry: `${v.note || 'Card payment'} · ${money} · ${date} · ${from.name} → ${card.name}`,
      effect: `${from.name} goes up by ${money} and ${cardEffect(card.name, debtBefore(card), debtAfter(card), money, 'up')}. Your expenses don't change.${cant}`,
      button: 'Delete payment',
      done: 'Card payment deleted.',
    }
  }
  const category = data.categories.find((c) => c.id === v.categoryId)
  const name = v.note || category?.name || (v.kind === 'income' ? 'Income' : 'Expense')
  if (v.kind === 'income') {
    return {
      title: 'Delete this income?',
      entry: `${name} · +${money} · ${date} · ${from.name}`,
      effect: `${from.name} goes down by ${money}${monthly ? ` and this month's income drops by ${money}` : ''}.${cant}`,
      button: 'Delete income',
      done: 'Income deleted.',
    }
  }
  return {
    title: 'Delete this expense?',
    entry: `${name} · −${money} · ${date} · ${from.name}`,
    effect: `${isCard(from) ? cardEffect(from.name, debtBefore(from), debtAfter(from), money, 'down') : `${from.name} goes up by ${money}`}${monthly ? ` and this month's expenses drop by ${money}` : ''}.${cant}`,
    button: 'Delete expense',
    done: 'Expense deleted.',
  }
}

