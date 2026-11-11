import type { Category, CategoryType, KakeiboEnvelope } from '../types.ts'

export type CategoryStatus = 'active' | 'archived' | 'all'

export function categoryEmptyMessage(hasCategories: boolean): string {
  return hasCategories ? 'No categories match these filters.' : 'No categories yet. Select Add category to create one.'
}

export function filterCategories(
  categories: Category[],
  filters: { type: CategoryType | 'all'; status: CategoryStatus; envelope: KakeiboEnvelope | 'all'; query: string },
): Category[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return categories.filter((category) =>
    (filters.type === 'all' || category.type === filters.type) &&
    (filters.status === 'all' || Boolean(category.archived) === (filters.status === 'archived')) &&
    (filters.envelope === 'all' || category.defaultEnvelope === filters.envelope) &&
    (!query || category.name.toLocaleLowerCase().includes(query)),
  )
}

/*
 * The redesigned Categories screen (spec §5.3): three tabs, an envelope filter, search and a sort.
 * "Expenses" and "Income" show active categories of that type; "Archived" shows archived ones of both types,
 * so a category is on exactly one tab. Counts always describe the whole catalogue, not the current search.
 */
export type CategoryTab = 'expense' | 'income' | 'archived'
export type CategorySort = 'usage' | 'name'
export type EnvelopeFilter = KakeiboEnvelope | 'all' | 'none'

export const categoryTabOf = (category: Category): CategoryTab => (category.archived ? 'archived' : category.type)

export function categoryTabCounts(categories: Category[]): Record<CategoryTab, number> {
  const counts: Record<CategoryTab, number> = { expense: 0, income: 0, archived: 0 }
  for (const category of categories) counts[categoryTabOf(category)] += 1
  return counts
}

/** Most used first (ties by name), or A–Z. Never mutates its input. */
export function sortCategories(categories: Category[], sort: CategorySort): Category[] {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id
  return [...categories].sort(sort === 'name' ? byName : (a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0) || byName(a, b))
}

/** Whether a category passes the envelope filter and the search (not the tab). `viewCategories` skips the envelope filter on the Income tab, where it means nothing. */
export function passesFilters(category: Category, filters: { envelope: EnvelopeFilter; query: string }): boolean {
  const query = filters.query.trim().toLocaleLowerCase()
  const envelopeOk =
    filters.envelope === 'all' || (filters.envelope === 'none' ? !category.defaultEnvelope : category.defaultEnvelope === filters.envelope)
  return envelopeOk && (!query || category.name.toLocaleLowerCase().includes(query))
}

/** The envelope filter only means something for expense categories, so the Income tab ignores it. */
export function viewCategories(
  categories: Category[],
  view: { tab: CategoryTab; envelope: EnvelopeFilter; query: string; sort: CategorySort },
): Category[] {
  const filters = { envelope: view.tab === 'income' ? ('all' as const) : view.envelope, query: view.query }
  return sortCategories(categories.filter((category) => categoryTabOf(category) === view.tab && passesFilters(category, filters)), view.sort)
}

/** "Used by 12 transactions", "Used by 1 transaction" or "Not used yet" (the all-time count the API reports). */
export function usageText(category: Category): string {
  const count = category.usageCount
  if (count === undefined) return ''
  return count === 0 ? 'Not used yet' : `Used by ${count} ${count === 1 ? 'transaction' : 'transactions'}`
}

/** A category can only be permanently deleted while no transaction uses it (the API and the database agree). */
export const canDeleteCategory = (category: Category): boolean => (category.usageCount ?? 1) === 0
