import assert from 'node:assert/strict'
import test from 'node:test'

import { filterCategories } from '../src/lib/categoryList.ts'
import type { Category } from '../src/types.ts'

const categories: Category[] = [
  { id: 1, name: ' Groceries ', type: 'expense', defaultEnvelope: 'needs' },
  { id: 2, name: 'Books', type: 'expense', defaultEnvelope: 'culture' },
  { id: 3, name: 'Salary', type: 'income' },
  { id: 4, name: 'Old Rent', type: 'expense', defaultEnvelope: 'needs', archived: true },
]

test('category filters compose type, lifecycle, envelope and case-insensitive name search', () => {
  const base = { type: 'expense' as const, status: 'active' as const, envelope: 'all' as const, query: ' GRO ' }
  assert.deepEqual(filterCategories(categories, base).map(({ id }) => id), [1])
  assert.deepEqual(filterCategories(categories, { ...base, status: 'archived', query: '' }).map(({ id }) => id), [4])
  assert.deepEqual(filterCategories(categories, { ...base, envelope: 'culture', query: '' }).map(({ id }) => id), [2])
  assert.deepEqual(filterCategories(categories, { ...base, type: 'income', query: '' }).map(({ id }) => id), [3])
})
