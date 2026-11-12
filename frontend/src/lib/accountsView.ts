import type { AccountType, AccountsSnapshot, Centavos } from '../types.ts'

/*
 * The Accounts screen's search, filter and sort (spec section 7), as pure functions so they can be tested, plus the
 * presentation preferences kept in this browser. Nothing here works out a balance or a debt: every figure arrives
 * from the data source's snapshot. A credit card's debt is never compared with a cash balance as if both were money
 * you have, so the amount sorts are split: "balance" sorts the accounts that hold money and lists cards after them;
 * "owed" sorts the cards and lists the other accounts after them.
 */
export type AccountTypeFilter = 'all' | 'cash-bank' | 'ewallet' | 'credit'
export type AccountSort = 'default' | 'name' | 'balance-high' | 'balance-low' | 'owed-high'
export type AccountsDisplayMode = 'cards' | 'list'

export const TYPE_FILTERS: { value: AccountTypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'cash-bank', label: 'Cash & bank' },
  { value: 'ewallet', label: 'E-wallets' },
  { value: 'credit', label: 'Credit cards' },
]
export const SORTS: { value: AccountSort; label: string; hint: string | null }[] = [
  { value: 'default', label: 'Default order', hint: null },
  { value: 'name', label: 'Name A–Z', hint: null },
  { value: 'balance-high', label: 'Highest balance', hint: 'Balances of cash, bank and e-wallet accounts. Credit cards follow, A–Z.' },
  { value: 'balance-low', label: 'Lowest balance', hint: 'Balances of cash, bank and e-wallet accounts. Credit cards follow, A–Z.' },
  { value: 'owed-high', label: 'Most owed', hint: 'Credit cards by amount owed. Other accounts follow, A–Z.' },
]

/** One account as the list logic needs it. `amount` is a balance for money accounts and the signed debt for a card. */
export interface AccountEntry {
  id: number
  name: string
  type: AccountType
  amount: Centavos
}

export const isCreditType = (type: AccountType): boolean => type === 'credit_card'

/** Every account in the snapshot's order (money accounts, then cards), with the one figure each is sorted by. */
export function accountEntries(snapshot: AccountsSnapshot): AccountEntry[] {
  return [
    ...snapshot.liquid.map(({ account, balance }) => ({ id: account.id, name: account.name, type: account.type, amount: balance })),
    ...snapshot.cards.map((card) => ({ id: card.account.id, name: card.account.name, type: card.account.type, amount: card.signedDebt })),
  ]
}

export function matchesTypeFilter(type: AccountType, filter: AccountTypeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'cash-bank') return type === 'cash' || type === 'bank'
  if (filter === 'ewallet') return type === 'ewallet'
  return isCreditType(type)
}

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
/** Name search: case-insensitive, ignoring extra spaces; an empty search matches everything. */
export const matchesSearch = (name: string, query: string): boolean => collapse(name).includes(collapse(query))

const byName = (a: AccountEntry, b: AccountEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id

/** Filter by name and type, then order. `default` keeps the snapshot's order. Never mutates its input. */
export function arrangeAccounts(
  entries: readonly AccountEntry[],
  view: { query: string; type: AccountTypeFilter; sort: AccountSort },
): AccountEntry[] {
  const kept = entries.filter((e) => matchesTypeFilter(e.type, view.type) && matchesSearch(e.name, view.query))
  const money = kept.filter((e) => !isCreditType(e.type))
  const cards = kept.filter((e) => isCreditType(e.type))
  switch (view.sort) {
    case 'name': return [...kept].sort(byName)
    case 'balance-high': return [...money.sort((a, b) => b.amount - a.amount || byName(a, b)), ...cards.sort(byName)]
    case 'balance-low': return [...money.sort((a, b) => a.amount - b.amount || byName(a, b)), ...cards.sort(byName)]
    case 'owed-high': return [...cards.sort((a, b) => b.amount - a.amount || byName(a, b)), ...money.sort(byName)]
    default: return kept
  }
}

/** "3 of 5 accounts" or "5 accounts", for the toolbar. */
export function countText(shown: number, total: number): string {
  const noun = total === 1 ? 'account' : 'accounts'
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`
}

/* ---------- Presentation preferences (this browser only; never financial data) ---------- */

export const ACCOUNTS_VIEW_STORAGE_KEY = 'monikey.accountsView'
export interface AccountsViewPrefs { version: 1; mode: AccountsDisplayMode; type: AccountTypeFilter; sort: AccountSort }
export const DEFAULT_ACCOUNTS_PREFS: AccountsViewPrefs = { version: 1, mode: 'cards', type: 'all', sort: 'default' }
export interface PrefStorage { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback)

/** Reads only the small known shape; anything else (corruption, an older or newer shape) becomes the defaults field by field. */
export function parseAccountsPrefs(raw: string | null): AccountsViewPrefs {
  if (raw === null) return { ...DEFAULT_ACCOUNTS_PREFS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || (parsed as { version?: unknown }).version !== 1) return { ...DEFAULT_ACCOUNTS_PREFS }
    const row = parsed as Record<string, unknown>
    return {
      version: 1,
      mode: oneOf(row.mode, ['cards', 'list'], DEFAULT_ACCOUNTS_PREFS.mode),
      type: oneOf(row.type, TYPE_FILTERS.map((f) => f.value), DEFAULT_ACCOUNTS_PREFS.type),
      sort: oneOf(row.sort, SORTS.map((s) => s.value), DEFAULT_ACCOUNTS_PREFS.sort),
    }
  } catch {
    return { ...DEFAULT_ACCOUNTS_PREFS }
  }
}

function browserStorage(): PrefStorage | null {
  try {
    return (globalThis as typeof globalThis & { localStorage?: PrefStorage }).localStorage ?? null
  } catch {
    return null // storage can be blocked (private windows, site settings)
  }
}

export function readAccountsPrefs(storage?: PrefStorage | null): AccountsViewPrefs {
  const target = storage === undefined ? browserStorage() : storage
  if (!target) return { ...DEFAULT_ACCOUNTS_PREFS }
  try {
    return parseAccountsPrefs(target.getItem(ACCOUNTS_VIEW_STORAGE_KEY))
  } catch {
    return { ...DEFAULT_ACCOUNTS_PREFS }
  }
}

/** Saves the preferences; false when storage refuses (the screen keeps working with the choice for this visit). */
export function writeAccountsPrefs(prefs: AccountsViewPrefs, storage?: PrefStorage | null): boolean {
  const target = storage === undefined ? browserStorage() : storage
  if (!target) return false
  try {
    target.setItem(ACCOUNTS_VIEW_STORAGE_KEY, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}
