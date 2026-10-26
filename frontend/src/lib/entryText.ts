import type { ActivityItem, Centavos, EntryTarget, EntryValues, LedgerSnapshot } from '../types.ts'
import { parseAmount } from './entryForm.ts'
import { formatDate, monthOf } from './finance.ts'
import { formatPeso } from './money.ts'
import { accountById, cardOf } from './snapshot.ts'

/*
 * The words the app says about an entry: the confirmation after a save and the delete confirmation.
 * They read a LedgerSnapshot (the accounts' figures as the data source reports them: after a save, the
 * re-fetched ones). The only arithmetic is the display-only before/after of a card in a delete text
 * (owner decision Q4, extended to these texts) and it is labelled as an estimate.
 */
export const targetOf = (item: ActivityItem): EntryTarget => ({ table: item.kind === 'payment' ? 'payment' : item.kind === 'transfer' ? 'transfer' : 'transaction', id: item.id })

/** What the card owes now, in words, from the figures AFTER the save. */
function cardClause(name: string, cardId: number, after: LedgerSnapshot): string {
  const card = cardOf(after, cardId)
  if (!card) return ''
  if (card.owed > 0) return ` ${name} now owes ${formatPeso(card.owed)}.`
  if (card.credit > 0) return ` ${name} now has ${formatPeso(card.credit)} card credit.`
  return ` ${name} now owes nothing.`
}

/** The one confirmation message (spec section 7, Success). `after` is the snapshot re-fetched after the save. */
export function saveMessage(v: EntryValues, after: LedgerSnapshot): string {
  const amount = parseAmount(v.amount)
  const from = accountById(after, v.accountId)
  if (!amount.ok || !from) return 'Saved.'
  const money = formatPeso(amount.centavos)

  if (v.kind === 'payment') {
    const card = accountById(after, v.cardId)
    if (!card) return 'Card payment saved.'
    return `Card payment saved: ${money} from ${from.name} to ${card.name}.${cardClause(card.name, card.id, after)} Card payments don't count as expenses and don't change your net position.`
  }
  if (v.kind === 'transfer') {
    const to = accountById(after, v.destinationAccountId)
    return to
      ? `Transfer saved: ${money} from ${from.name} to ${to.name}. Income and expenses don't change.`
      : 'Transfer saved.'
  }
  if (v.kind === 'income') return `Income saved: +${money} to ${from.name}.`
  return `Expense saved: −${money} from ${from.name}.${cardOf(after, from.id) ? cardClause(from.name, from.id, after) : ''}`
}

/** A card's position in words: "₱9,250.00 owed", "₱500.00 card credit" or "nothing owed". */
const cardWords = (signedDebt: Centavos): string =>
  signedDebt > 0 ? `${formatPeso(signedDebt)} owed` : signedDebt < 0 ? `${formatPeso(-signedDebt)} card credit` : 'nothing owed'

/**
 * What a delete does to a card. When the card stays on one side of zero, "owed goes up/down by the amount"
 * is exact; when the card is in credit before or after, the amount does not map onto "owed" one for one,
 * so the actual before and after are stated instead, marked as an estimate (the browser worked them out).
 */
function cardEffect(card: string, before: Centavos, after: Centavos, amount: string, direction: 'up' | 'down'): string {
  if (before >= 0 && after >= 0) return `${card} owed goes ${direction} by ${amount}`
  return `${card} goes from ${cardWords(before)} to ${cardWords(after)} (estimate)`
}

export interface DeleteSummary {
  title: string // "Delete this expense?"
  entry: string // "Lunch with team · −₱385.00 · Oct 24, 2026 · GCash"
  effect: string // what deleting changes, in words (spec section 10)
  button: string // "Delete expense"
  done: string // "Expense deleted."
}

/**
 * The words of the delete confirmation for `entry` (the stored entry, as opened). The monthly clause is left
 * out when the entry is not in the month being viewed.
 */
export function deleteSummary(snapshot: LedgerSnapshot, entry: EntryValues, viewedMonth: string): DeleteSummary | null {
  const amount = parseAmount(entry.amount)
  const from = accountById(snapshot, entry.accountId)
  if (!amount.ok || !from) return null
  const money = formatPeso(amount.centavos)
  const date = formatDate(entry.date)
  const monthly = monthOf(entry.date) === viewedMonth
  const cant = " This can't be undone."

  if (entry.kind === 'payment') {
    const card = cardOf(snapshot, entry.cardId)
    if (!card) return null
    // Deleting a payment puts its amount back on the card's debt.
    const effect = cardEffect(card.account.name, card.signedDebt, card.signedDebt + amount.centavos, money, 'up')
    return {
      title: 'Delete this card payment?',
      entry: `${entry.note || 'Card payment'} · ${money} · ${date} · ${from.name} → ${card.account.name}`,
      effect: `${from.name} goes up by ${money} and ${effect}. Your expenses don't change.${cant}`,
      button: 'Delete payment',
      done: 'Card payment deleted.',
    }
  }
  if (entry.kind === 'transfer') {
    const to = accountById(snapshot, entry.destinationAccountId)
    if (!to) return null
    return {
      title: 'Delete this transfer?',
      entry: `${entry.note || 'Account transfer'} · ${money} · ${date} · ${from.name} → ${to.name}`,
      effect: `${from.name} goes up by ${money} and ${to.name} goes down by ${money}. Income and expenses don't change.${cant}`,
      button: 'Delete transfer',
      done: 'Transfer deleted.',
    }
  }
  const category = snapshot.categories.find((c) => c.id === entry.categoryId)
  const name = entry.note || category?.name || (entry.kind === 'income' ? 'Income' : 'Expense')
  if (entry.kind === 'income') {
    return {
      title: 'Delete this income?',
      entry: `${name} · +${money} · ${date} · ${from.name}`,
      effect: `${from.name} goes down by ${money}${monthly ? ` and this month's income drops by ${money}` : ''}.${cant}`,
      button: 'Delete income',
      done: 'Income deleted.',
    }
  }
  const onCard = cardOf(snapshot, from.id)
  // Deleting a card expense takes its amount off the card's debt.
  const where = onCard
    ? cardEffect(from.name, onCard.signedDebt, onCard.signedDebt - amount.centavos, money, 'down')
    : `${from.name} goes up by ${money}`
  return {
    title: 'Delete this expense?',
    entry: `${name} · −${money} · ${date} · ${from.name}`,
    effect: `${where}${monthly ? ` and this month's expenses drop by ${money}` : ''}.${cant}`,
    button: 'Delete expense',
    done: 'Expense deleted.',
  }
}
