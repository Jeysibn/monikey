import type { AccountInfo, LedgerSnapshot } from '../types.ts'
import { isCard } from './finance.ts'
import { formatPeso } from './money.ts'
import { cardOf, liquidBalanceOf } from './snapshot.ts'

/*
 * The rules of the Quick Add account picker and date shortcuts, kept free of React so they can be tested.
 * Which accounts a field may offer is still decided by `accountsFor` in entryForm.ts; this file only
 * groups, searches and describes the accounts it is given. Nothing here calculates a balance or a debt:
 * every figure is read from the snapshot (the data source's answer).
 */

export interface AccountGroup {
  key: 'recent' | 'cash-bank' | 'ewallet' | 'card'
  label: string
  accounts: AccountInfo[]
}

const TYPE_LABEL: Record<string, string> = { cash: 'Cash', bank: 'Bank', ewallet: 'E-wallet', credit_card: 'Credit card' }

export const accountTypeLabel = (a: AccountInfo): string => TYPE_LABEL[a.type] ?? (isCard(a) ? 'Credit card' : 'Account')

/**
 * "Bank · ₱1,200.00" for a liquid account; "Credit card · ₱500.00 owed" for a card.
 * `withFigures` is false when editing: the figures already include the entry being edited and would mislead.
 */
export function accountDetail(a: AccountInfo, snapshot: LedgerSnapshot, withFigures = true): string {
  const type = accountTypeLabel(a)
  if (!withFigures) return type
  const card = cardOf(snapshot, a.id)
  if (card) {
    const owed = card.signedDebt < 0 ? `${formatPeso(-card.signedDebt)} card credit` : `${formatPeso(card.owed)} owed`
    return `${type} · ${owed} · ${card.availableCredit > 0 ? `${formatPeso(card.availableCredit)} available` : 'no credit available'}`
  }
  return `${type} · ${formatPeso(liquidBalanceOf(snapshot, a.id) ?? 0)}`
}

/** Case-insensitive match on the account's name or its type label ("bank", "e-wallet", "credit card"). */
export function searchAccounts(accounts: AccountInfo[], query: string): AccountInfo[] {
  const q = query.trim().toLowerCase()
  if (q === '') return accounts
  return accounts.filter((a) => a.name.toLowerCase().includes(q) || accountTypeLabel(a).toLowerCase().includes(q))
}

/**
 * Cash & bank, e-wallets and credit cards, in that order, each in the order the data source gave.
 * The last-used account (when it is still offered) is also listed first under "Last used", so a repeat
 * entry is one tap; it appears in its own group as well, so the groups still tell the whole story.
 */
export function groupAccounts(accounts: AccountInfo[], recentId: number | null = null): AccountGroup[] {
  const groups: AccountGroup[] = []
  const recent = recentId === null ? undefined : accounts.find((a) => a.id === recentId)
  if (recent) groups.push({ key: 'recent', label: 'Last used', accounts: [recent] })
  const add = (key: AccountGroup['key'], label: string, list: AccountInfo[]) => {
    if (list.length > 0) groups.push({ key, label, accounts: list })
  }
  add('cash-bank', 'Cash & bank', accounts.filter((a) => a.type === 'cash' || a.type === 'bank'))
  add('ewallet', 'E-wallet', accounts.filter((a) => a.type === 'ewallet'))
  add('card', 'Credit cards — adds to debt', accounts.filter(isCard))
  return groups
}

/** Moves a "YYYY-MM-DD" calendar date by whole days using UTC arithmetic, so no time zone can shift it. */
export function shiftDate(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  const moved = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  const two = (n: number) => String(n).padStart(2, '0')
  return `${moved.getUTCFullYear()}-${two(moved.getUTCMonth() + 1)}-${two(moved.getUTCDate())}`
}
