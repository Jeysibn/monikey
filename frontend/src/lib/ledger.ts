import type { AccountType, Centavos, EntryKind, EntryTarget, EntryValues, MockData } from '../types.ts'
import { parseAmount } from './entryForm.ts'
import { amountText } from './money.ts'
import { isCardType, parseAccountMoney, type AccountValues } from './accountForm.ts'

/*
 * The in-memory ledger for the mock (Milestone 4.5). `ledgerReducer` stands in for the API's writes:
 * a pure function from the current data and an action to the next data, so every screen shows the same
 * numbers after a save. The real client will send these actions to FastAPI and re-fetch instead.
 * New ids are max + 1; `createdAt` is passed in so the reducer stays pure (and testable).
 */
export type LedgerAction =
  | {
      type: 'add-account'
      name: string
      accountType: AccountType
      openingBalance: Centavos
      openingDebt: Centavos
      creditLimit: Centavos | null
    }
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
  | {
      type: 'add-transfer'
      sourceAccountId: number
      destinationAccountId: number
      amount: Centavos
      date: string
      note: string | null
      createdAt: string
    }

export type { EntryTarget } from '../types.ts'

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
  | {
      type: 'update-transfer'
      id: number
      sourceAccountId: number
      destinationAccountId: number
      amount: Centavos
      date: string
      note: string | null
    }
  | { type: 'delete-transaction'; id: number }
  | { type: 'delete-payment'; id: number }
  | { type: 'delete-transfer'; id: number }

const nextId = (rows: { id: number }[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1

export function ledgerReducer(data: MockData, action: LedgerAction | LedgerEdit): MockData {
  switch (action.type) {
    case 'add-account':
      return {
        ...data,
        accounts: [
          ...data.accounts,
          {
            id: nextId(data.accounts),
            name: action.name,
            type: action.accountType,
            openingBalance: action.openingBalance,
            openingDebt: action.openingDebt,
            creditLimit: action.creditLimit,
          },
        ],
      }
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
    case 'add-transfer':
      return {
        ...data,
        transfers: [...data.transfers, {
          id: nextId(data.transfers), sourceAccountId: action.sourceAccountId,
          destinationAccountId: action.destinationAccountId, amount: action.amount,
          date: action.date, note: action.note, createdAt: action.createdAt,
        }],
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
    case 'update-transfer': {
      if (!data.transfers.some((t) => t.id === action.id)) return data
      const { type: _type, ...fields } = action
      return { ...data, transfers: data.transfers.map((t) => (t.id === action.id ? { ...t, ...fields } : t)) }
    }
    case 'delete-transaction':
      if (!data.transactions.some((t) => t.id === action.id)) return data
      return { ...data, transactions: data.transactions.filter((t) => t.id !== action.id) }
    case 'delete-payment':
      if (!data.payments.some((p) => p.id === action.id)) return data
      return { ...data, payments: data.payments.filter((p) => p.id !== action.id) }
    case 'delete-transfer':
      if (!data.transfers.some((t) => t.id === action.id)) return data
      return { ...data, transfers: data.transfers.filter((t) => t.id !== action.id) }
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
  if (v.kind === 'transfer') {
    if (v.destinationAccountId === null) throw new Error('toAction needs a destination account for a transfer')
    return { type: 'add-transfer', sourceAccountId: v.accountId, destinationAccountId: v.destinationAccountId, amount: amount.centavos, date: v.date, note, createdAt }
  }
  if (v.categoryId === null) throw new Error('toAction needs a category')
  return { type: 'add-transaction', accountId: v.accountId, categoryId: v.categoryId, amount: amount.centavos, date: v.date, note, createdAt }
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
  if (target.table === 'transfer') {
    if (v.destinationAccountId === null) throw new Error('toUpdateAction needs a destination account for a transfer')
    return { type: 'update-transfer', id: target.id, sourceAccountId: v.accountId, destinationAccountId: v.destinationAccountId, amount: amount.centavos, date: v.date, note }
  }
  if (v.categoryId === null) throw new Error('toUpdateAction needs a category')
  return { type: 'update-transaction', id: target.id, accountId: v.accountId, categoryId: v.categoryId, amount: amount.centavos, date: v.date, note }
}

export const toDeleteAction = (target: EntryTarget): LedgerEdit =>
  target.table === 'payment' ? { type: 'delete-payment', id: target.id } : target.table === 'transfer' ? { type: 'delete-transfer', id: target.id } : { type: 'delete-transaction', id: target.id }

/** False when the entry is gone (for example deleted in another tab). */
export const entryExists = (data: MockData, t: EntryTarget): boolean =>
  (t.table === 'payment' ? data.payments : t.table === 'transfer' ? data.transfers : data.transactions).some((row) => row.id === t.id)

/** The form values for editing an entry, or null if it no longer exists. The kind comes from the category. */
export function entryValues(data: MockData, t: EntryTarget): EntryValues | null {
  if (t.table === 'payment') {
    const p = data.payments.find((row) => row.id === t.id)
    if (!p) return null
    return { kind: 'payment', amount: amountText(p.amount), accountId: p.sourceAccountId, cardId: p.cardAccountId, destinationAccountId: null, categoryId: null, date: p.date, note: p.note ?? '' }
  }
  if (t.table === 'transfer') {
    const transfer = data.transfers.find((row) => row.id === t.id)
    if (!transfer) return null
    return { kind: 'transfer', amount: amountText(transfer.amount), accountId: transfer.sourceAccountId, cardId: null, destinationAccountId: transfer.destinationAccountId, categoryId: null, date: transfer.date, note: transfer.note ?? '' }
  }
  const row = data.transactions.find((x) => x.id === t.id)
  const category = row && data.categories.find((c) => c.id === row.categoryId)
  if (!row || !category) return null
  return { kind: category.type as EntryKind, amount: amountText(row.amount), accountId: row.accountId, cardId: null, destinationAccountId: null, categoryId: row.categoryId, date: row.date, note: row.note ?? '' }
}

/** Turns validated Add account values into a ledger action (the mock's write; the API gets the same fields). */
export function toAccountAction(v: AccountValues): LedgerAction {
  const name = v.name.trim()
  if (isCardType(v.type)) {
    const limit = parseAccountMoney(v.limit, 'limit')
    const owed = parseAccountMoney(v.owed, 'owed')
    if (!limit.ok || !owed.ok) throw new Error('toAccountAction needs valid values')
    return { type: 'add-account', name, accountType: v.type, openingBalance: 0, openingDebt: owed.centavos, creditLimit: limit.centavos }
  }
  const balance = parseAccountMoney(v.balance, 'balance')
  if (!balance.ok) throw new Error('toAccountAction needs valid values')
  return { type: 'add-account', name, accountType: v.type, openingBalance: balance.centavos, openingDebt: 0, creditLimit: null }
}
