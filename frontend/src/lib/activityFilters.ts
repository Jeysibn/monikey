import type { ActivityKind, Category, EntryValues, LedgerSnapshot } from '../types.ts'

/*
 * Activity search and filters, as pure functions so they can be tested and shared by the screen, the HTTP source
 * and the mock. The rules, in one place:
 *  - Filters apply to the WHOLE month on the server, before ordering and paging; the browser never filters rows it
 *    happened to load. (The mock mirrors that.)
 *  - Search finds what a row shows: its note, its category name and its account name(s), case-insensitively.
 *  - A category exists only on income and expense entries, so choosing one (or a payment or transfer type) rules
 *    the other out; combinations that cannot match are prevented in the controls rather than answered with "nothing".
 *  - There is no cross-month search: the month selector always bounds the result.
 */
export type ActivityKindFilter = 'all' | ActivityKind
export interface ActivityFilters {
  search: string
  categoryId: number | null
  kind: ActivityKindFilter
}
export const NO_ACTIVITY_FILTERS: ActivityFilters = { search: '', categoryId: null, kind: 'all' }
export const MAX_SEARCH = 80 // the API's limit

export const KIND_OPTIONS: { value: ActivityKindFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'payment', label: 'Card payments' },
  { value: 'transfer', label: 'Transfers' },
]

/** Extra spaces collapsed, trimmed and cut to the API's limit: what is sent and what is compared. */
export const normalizeSearch = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH)

/** Whether any narrowing is active (the account filter lives beside these, in the caller). */
export const hasActivityFilters = (filters: ActivityFilters, accountId: number | null = null): boolean =>
  normalizeSearch(filters.search) !== '' || filters.categoryId !== null || filters.kind !== 'all' || accountId !== null

/** A kind that has categories (income and expense entries); payments and transfers have none. */
const hasCategories = (kind: ActivityKindFilter): boolean => kind === 'all' || kind === 'income' || kind === 'expense'

/** Picking a type drops a category that no longer fits it. */
export function withKind(filters: ActivityFilters, kind: ActivityKindFilter, categories: readonly Category[]): ActivityFilters {
  const category = categories.find((c) => c.id === filters.categoryId)
  const keeps = category !== undefined && hasCategories(kind) && (kind === 'all' || category.type === kind)
  return { ...filters, kind, categoryId: keeps ? filters.categoryId : null }
}

/** Picking a category narrows an "All types" filter to that category's type, and is refused for payments and transfers. */
export function withCategory(filters: ActivityFilters, categoryId: number | null, categories: readonly Category[]): ActivityFilters {
  if (categoryId === null) return { ...filters, categoryId: null }
  const category = categories.find((c) => c.id === categoryId)
  if (!category || !hasCategories(filters.kind) || (filters.kind !== 'all' && category.type !== filters.kind)) return filters
  return { ...filters, categoryId }
}

export interface CategoryChoice { id: number; label: string; type: 'income' | 'expense'; archived: boolean }

/**
 * The categories to offer for the chosen type: every active one, and an archived one only if it has history (an
 * archived category with no entries can match nothing). Archived choices say so. Empty for payments and transfers.
 */
export function categoryChoices(categories: readonly Category[], kind: ActivityKindFilter): CategoryChoice[] {
  if (!hasCategories(kind)) return []
  return categories
    .filter((c) => (kind === 'all' || c.type === kind) && (!c.archived || (c.usageCount ?? 1) > 0))
    .map((c) => ({ id: c.id, label: c.archived ? `${c.name} (archived)` : c.name, type: c.type, archived: c.archived === true }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

/** Which of the three server reads a filter needs, and the kind the transactions read should be limited to. */
export function activitySources(filters: ActivityFilters): { transactions: boolean; payments: boolean; transfers: boolean; transactionKind: 'income' | 'expense' | null } {
  const kind = filters.kind
  const categorized = filters.categoryId !== null // payments and transfers have no category, so a category rules them out
  return {
    transactions: kind === 'all' || kind === 'income' || kind === 'expense',
    payments: (kind === 'all' || kind === 'payment') && !categorized,
    transfers: (kind === 'all' || kind === 'transfer') && !categorized,
    transactionKind: kind === 'income' || kind === 'expense' ? kind : null,
  }
}

/** Case-insensitive substring match over the texts a row shows; an empty search matches everything. Mirrors the API. */
export function searchMatches(texts: readonly (string | null | undefined)[], search: string): boolean {
  const needle = normalizeSearch(search).toLocaleLowerCase()
  if (needle === '') return true
  return texts.some((text) => typeof text === 'string' && text.toLocaleLowerCase().includes(needle))
}

/**
 * Whether a just-saved entry would show under the current filters, for the "it's hidden by your filters" notice.
 * It judges the same fields the API searches, using the accounts and categories the form already has.
 */
export function entryMatchesFilters(values: EntryValues, filters: ActivityFilters, snapshot: LedgerSnapshot): boolean {
  const category = snapshot.categories.find((c) => c.id === values.categoryId)
  const name = (id: number | null) => snapshot.accounts.find((a) => a.id === id)?.name
  if (filters.kind !== 'all' && filters.kind !== values.kind) return false
  if (filters.categoryId !== null && values.categoryId !== filters.categoryId) return false
  return searchMatches(values.note === '' ? [category?.name, name(values.accountId), name(values.cardId), name(values.destinationAccountId)] : [values.note, category?.name, name(values.accountId), name(values.cardId), name(values.destinationAccountId)], filters.search)
}

/** The count line: an honest statement about what was loaded, never a made-up total. */
export function countLabel(shown: number, hasMore: boolean, filtered: boolean): string {
  const noun = shown === 1 ? 'entry' : 'entries'
  if (hasMore) return filtered ? `First ${shown} matching entries` : `Latest ${shown} entries`
  return filtered ? `${shown} matching ${noun}` : `${shown} ${noun}`
}
