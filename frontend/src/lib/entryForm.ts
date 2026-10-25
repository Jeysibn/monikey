import type { AccountInfo, Centavos, EntryKind, EntryValues, LedgerSnapshot } from '../types.ts'
import { isCard } from './finance.ts'
import { formatPeso } from './money.ts'
import { accountById, cardOf, liquidBalanceOf } from './snapshot.ts'

export type { EntryKind, EntryValues } from '../types.ts'

/*
 * The rules of the Quick Add form (UI_UX_SPEC section 7), kept free of React so they can be tested.
 * Validation messages are the spec's, word for word. Amounts are parsed from text with string
 * arithmetic, never floating point, and end up as whole centavos.
 * Everything that needs an account's figures reads a LedgerSnapshot (what the data source reports);
 * nothing here works out a balance or a debt.
 * The preview and the notices are DISPLAY-ONLY estimates (owner decision Q4): they compare whole
 * centavos in the browser and are never saved. The real API will own every saved figure.
 */

export type EntryField = 'amount' | 'account' | 'card' | 'category' | 'date' | 'note'
export type EntryErrors = Partial<Record<EntryField, string>>

export const MAX_NOTE = 120
const MAX_CENTAVOS = 999_999_999_999 // NUMERIC(12,2): 9,999,999,999.99

export type AmountResult = { ok: true; centavos: Centavos } | { ok: false; error: string }

/**
 * "385", "1,250.50", ".5" and a leading "₱" are accepted. Checks run in the order of the spec's table.
 * A transaction amount must be more than zero; an account's opening balance or debt may be zero (`allowZero`).
 */
export function parseMoney(text: string, allowZero = false): AmountResult {
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
  if (centavos === 0 && !allowZero) return { ok: false, error: 'Amount must be more than ₱0.00.' }
  if (centavos > MAX_CENTAVOS) return { ok: false, error: 'That amount is too large.' }
  return { ok: true, centavos }
}

export const parseAmount = (text: string): AmountResult => parseMoney(text)

/** A real calendar date written "YYYY-MM-DD" (a native date input gives "" when it is cleared or incomplete). */
export function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  return y >= 1900 && check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d
}

/** Which accounts a field may offer: expenses take any account; income and "pay from" never a card; "pay card" only cards. */
export function accountsFor(kind: EntryKind, field: 'account' | 'card', snapshot: LedgerSnapshot): AccountInfo[] {
  if (field === 'card') return snapshot.accounts.filter(isCard)
  return kind === 'expense' ? snapshot.accounts : snapshot.accounts.filter((a) => !isCard(a))
}

const accountAllowed = (kind: EntryKind, field: 'account' | 'card', id: number | null, snapshot: LedgerSnapshot) =>
  id !== null && accountsFor(kind, field, snapshot).some((a) => a.id === id)

export function validate(v: EntryValues, snapshot: LedgerSnapshot): EntryErrors {
  const errors: EntryErrors = {}
  const amount = parseAmount(v.amount)
  if (!amount.ok) errors.amount = amount.error

  if (!accountAllowed(v.kind, 'account', v.accountId, snapshot)) {
    errors.account = v.kind === 'payment' ? "Choose the account you're paying from." : 'Choose an account.'
  }
  if (v.kind === 'payment') {
    if (!accountAllowed(v.kind, 'card', v.cardId, snapshot)) errors.card = "Choose the card you're paying."
  } else {
    const category = snapshot.categories.find((c) => c.id === v.categoryId)
    if (!category || category.type !== v.kind) errors.category = 'Choose a category.'
  }
  if (!isValidDate(v.date)) errors.date = 'Enter a valid date.'
  if (v.note.trim().length > MAX_NOTE) errors.note = 'Keep the note under 120 characters.'
  return errors
}

/** Changing the type keeps amount, date and note, clears the category, and clears an account that no longer fits. */
export function switchKind(v: EntryValues, kind: EntryKind, snapshot: LedgerSnapshot): EntryValues {
  return {
    ...v,
    kind,
    categoryId: null,
    accountId: accountAllowed(kind, 'account', v.accountId, snapshot) ? v.accountId : null,
  }
}

export interface Preview {
  title: string
  lines: string[]
}

const owedText = (signedDebt: Centavos) =>
  signedDebt >= 0 ? formatPeso(signedDebt) : `${formatPeso(0)} (card credit ${formatPeso(-signedDebt)})`

/** "After paying (estimate)" for a card payment, or the card's new debt for a purchase on a card. Nothing for other entries. */
export function previewFor(v: EntryValues, snapshot: LedgerSnapshot): Preview | null {
  const amount = parseAmount(v.amount)
  const from = accountById(snapshot, v.accountId)
  if (!amount.ok || !from) return null

  if (v.kind === 'payment') {
    const card = cardOf(snapshot, v.cardId)
    const balance = liquidBalanceOf(snapshot, v.accountId)
    if (!card || balance === undefined) return null
    const debt = card.signedDebt
    return {
      title: 'After paying (estimate)',
      lines: [
        `${from.name}: ${formatPeso(balance)} → ${formatPeso(balance - amount.centavos)}`,
        `${card.account.name} owed: ${formatPeso(card.owed)} → ${owedText(debt - amount.centavos)}`,
        'Expenses: no change',
      ],
    }
  }
  const onCard = v.kind === 'expense' ? cardOf(snapshot, v.accountId) : undefined
  if (onCard) {
    return {
      title: 'After saving (estimate)',
      lines: [`${from.name} owed: ${formatPeso(onCard.owed)} → ${owedText(onCard.signedDebt + amount.centavos)}`],
    }
  }
  return null
}

/** Warnings that never stop a save. */
export function notices(v: EntryValues, snapshot: LedgerSnapshot): string[] {
  const amount = parseAmount(v.amount)
  const from = accountById(snapshot, v.accountId)
  if (!amount.ok || !from) return []
  const out: string[] = []

  if (v.kind === 'payment') {
    const card = cardOf(snapshot, v.cardId)
    if (card && amount.centavos > card.owed) {
      out.push(`That's more than the ${formatPeso(card.owed)} currently owed. The extra becomes credit on the card.`)
    }
    const balance = liquidBalanceOf(snapshot, v.accountId)
    if (balance !== undefined && balance < amount.centavos) {
      out.push(`${from.name} has ${formatPeso(balance)}, less than this payment. Its balance will go below zero.`)
    }
  }
  const onCard = v.kind === 'expense' ? cardOf(snapshot, v.accountId) : undefined
  if (onCard) {
    const available = Math.max(onCard.availableCredit, 0)
    if (amount.centavos > available) {
      out.push(`That's more than the ${formatPeso(available)} credit available on ${from.name}.`)
    }
  }
  return out
}

/**
 * The text of the select option: balance for ordinary accounts, available credit for cards.
 * `withFigures` is false when editing: those figures already include the entry being edited and would mislead.
 */
export function accountOptionLabel(a: AccountInfo, snapshot: LedgerSnapshot, withFigures = true): string {
  if (!withFigures) return a.name
  const card = cardOf(snapshot, a.id)
  if (card) {
    return `${a.name} — ${card.availableCredit > 0 ? `${formatPeso(card.availableCredit)} available` : 'No credit available'}`
  }
  return `${a.name} — ${formatPeso(liquidBalanceOf(snapshot, a.id) ?? 0)}`
}
