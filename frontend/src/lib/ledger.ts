import type { Centavos, MockData } from '../types.ts'
import { cardStatus, isCard } from './finance.ts'
import { parseAmount, type EntryValues } from './entryForm.ts'
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

const nextId = (rows: { id: number }[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1

export function ledgerReducer(data: MockData, action: LedgerAction): MockData {
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
