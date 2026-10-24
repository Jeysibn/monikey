import type { Account, Centavos, MockData } from '../types.ts'
import { cardStatus, isCard, liquidBalance } from './finance.ts'
import { formatPeso } from './money.ts'

/*
 * The rules of the Quick Add form (UI_UX_SPEC section 7), kept free of React so they can be tested.
 * Validation messages are the spec's, word for word. Amounts are parsed from text with string
 * arithmetic, never floating point, and end up as whole centavos.
 * The preview and the notices are DISPLAY-ONLY estimates (owner decision Q4): they compare whole
 * centavos in the browser and are never saved. The real API will own every saved figure.
 */
export type EntryKind = 'expense' | 'income' | 'payment'

export interface EntryValues {
  kind: EntryKind
  amount: string // exactly what the person typed
  accountId: number | null // expense: the account · income: deposit to · payment: pay from
  cardId: number | null // payment only
  categoryId: number | null // expense and income only
  date: string // "YYYY-MM-DD"
  note: string
}

export type EntryField = 'amount' | 'account' | 'card' | 'category' | 'date' | 'note'
export type EntryErrors = Partial<Record<EntryField, string>>

export const MAX_NOTE = 120
const MAX_CENTAVOS = 999_999_999_999 // NUMERIC(12,2): 9,999,999,999.99

export type AmountResult = { ok: true; centavos: Centavos } | { ok: false; error: string }

/** "385", "1,250.50", ".5" and a leading "₱" are accepted. Checks run in the order of the spec's table. */
export function parseAmount(text: string): AmountResult {
  const t = text.trim().replace(/^₱\s*/, '')
  if (t === '') return { ok: false, error: 'Enter an amount.' }
  if (!/\d/.test(t) || !/^(\d{1,3}(,\d{3})+|\d+)?(\.\d*)?$/.test(t)) {
    return { ok: false, error: 'Use numbers only, like 350 or 350.50.' }
  }
  const [whole = '', fraction = ''] = t.split('.')
  if (fraction.length > 2) return { ok: false, error: 'Use at most 2 decimal places.' }
  const digits = whole.replace(/,/g, '').replace(/^0+/, '')
  if (digits.length > 12) return { ok: false, error: 'That amount is too large.' }
  const centavos = Number(digits || '0') * 100 + Number(fraction.padEnd(2, '0'))
  if (centavos === 0) return { ok: false, error: 'Amount must be more than ₱0.00.' }
  if (centavos > MAX_CENTAVOS) return { ok: false, error: 'That amount is too large.' }
  return { ok: true, centavos }
}

/** Whole centavos as text a person can edit: 1425000 -> "14250.00". Used to fill the amount from "Pay full". */
export function amountText(centavos: Centavos): string {
  return `${Math.trunc(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`
}

/** A real calendar date written "YYYY-MM-DD" (a native date input gives "" when it is cleared or incomplete). */
export function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  return y >= 1900 && check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d
}

const account = (data: MockData, id: number | null): Account | undefined =>
  id === null ? undefined : data.accounts.find((a) => a.id === id)

/** Which accounts a field may offer: expenses take any account; income and "pay from" never a card; "pay card" only cards. */
export function accountsFor(kind: EntryKind, field: 'account' | 'card', data: MockData): Account[] {
  if (field === 'card') return data.accounts.filter(isCard)
  return kind === 'expense' ? data.accounts : data.accounts.filter((a) => !isCard(a))
}

const accountAllowed = (kind: EntryKind, field: 'account' | 'card', id: number | null, data: MockData) =>
  id !== null && accountsFor(kind, field, data).some((a) => a.id === id)

export function validate(v: EntryValues, data: MockData): EntryErrors {
  const errors: EntryErrors = {}
  const amount = parseAmount(v.amount)
  if (!amount.ok) errors.amount = amount.error

  if (!accountAllowed(v.kind, 'account', v.accountId, data)) {
    errors.account = v.kind === 'payment' ? "Choose the account you're paying from." : 'Choose an account.'
  }
  if (v.kind === 'payment') {
    if (!accountAllowed(v.kind, 'card', v.cardId, data)) errors.card = "Choose the card you're paying."
  } else {
    const category = data.categories.find((c) => c.id === v.categoryId)
    if (!category || category.type !== v.kind) errors.category = 'Choose a category.'
  }
  if (!isValidDate(v.date)) errors.date = 'Enter a valid date.'
  if (v.note.trim().length > MAX_NOTE) errors.note = 'Keep the note under 120 characters.'
  return errors
}

/** Changing the type keeps amount, date and note, clears the category, and clears an account that no longer fits. */
export function switchKind(v: EntryValues, kind: EntryKind, data: MockData): EntryValues {
  return {
    ...v,
    kind,
    categoryId: null,
    accountId: accountAllowed(kind, 'account', v.accountId, data) ? v.accountId : null,
  }
}

export interface Preview {
  title: string
  lines: string[]
}

const owedText = (signedDebt: Centavos) =>
  signedDebt >= 0 ? formatPeso(signedDebt) : `${formatPeso(0)} (card credit ${formatPeso(-signedDebt)})`

/** "After paying (estimate)" for a card payment, or the card's new debt for a purchase on a card. Nothing for other entries. */
export function previewFor(v: EntryValues, data: MockData): Preview | null {
  const amount = parseAmount(v.amount)
  const from = account(data, v.accountId)
  if (!amount.ok || !from) return null

  if (v.kind === 'payment') {
    const card = account(data, v.cardId)
    if (!card || !isCard(card) || isCard(from)) return null
    const balance = liquidBalance(from, data)
    const debt = cardStatus(card, data).signedDebt
    return {
      title: 'After paying (estimate)',
      lines: [
        `${from.name}: ${formatPeso(balance)} → ${formatPeso(balance - amount.centavos)}`,
        `${card.name} owed: ${formatPeso(Math.max(debt, 0))} → ${owedText(debt - amount.centavos)}`,
        'Expenses: no change',
      ],
    }
  }
  if (v.kind === 'expense' && isCard(from)) {
    const debt = cardStatus(from, data).signedDebt
    return {
      title: 'After saving (estimate)',
      lines: [`${from.name} owed: ${formatPeso(Math.max(debt, 0))} → ${owedText(debt + amount.centavos)}`],
    }
  }
  return null
}

/** Warnings that never stop a save. */
export function notices(v: EntryValues, data: MockData): string[] {
  const amount = parseAmount(v.amount)
  const from = account(data, v.accountId)
  if (!amount.ok || !from) return []
  const out: string[] = []

  if (v.kind === 'payment') {
    const card = account(data, v.cardId)
    if (card && isCard(card)) {
      const owed = cardStatus(card, data).owed
      if (amount.centavos > owed) {
        out.push(`That's more than the ${formatPeso(owed)} currently owed. The extra becomes credit on the card.`)
      }
    }
    if (!isCard(from)) {
      const balance = liquidBalance(from, data)
      if (balance < amount.centavos) {
        out.push(`${from.name} has ${formatPeso(balance)}, less than this payment. Its balance will go below zero.`)
      }
    }
  }
  if (v.kind === 'expense' && isCard(from)) {
    const available = Math.max(cardStatus(from, data).availableCredit, 0)
    if (amount.centavos > available) {
      out.push(`That's more than the ${formatPeso(available)} credit available on ${from.name}.`)
    }
  }
  return out
}

/** The text of the select option: balance for ordinary accounts, available credit for cards. */
export function accountOptionLabel(a: Account, data: MockData): string {
  if (isCard(a)) {
    const available = cardStatus(a, data).availableCredit
    return `${a.name} — ${available > 0 ? `${formatPeso(available)} available` : 'No credit available'}`
  }
  return `${a.name} — ${formatPeso(liquidBalance(a, data))}`
}
