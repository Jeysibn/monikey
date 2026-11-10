import type { Category, CategoryType, KakeiboEnvelope } from '../types.ts'

export type CategoryStatus = 'active' | 'archived' | 'all'

export function categoryEmptyMessage(hasCategories: boolean): string {
  return hasCategories ? 'No categories match these filters.' : 'No categories yet. Create one using the form above.'
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
