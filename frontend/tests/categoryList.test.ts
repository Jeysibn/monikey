import assert from 'node:assert/strict'
import test from 'node:test'

import { categoryEmptyMessage, filterCategories } from '../src/lib/categoryList.ts'
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

test('category empty copy distinguishes an empty collection from filtered no matches', () => {
  assert.equal(categoryEmptyMessage(false), 'No categories yet. Select Add category to create one.')
  assert.equal(categoryEmptyMessage(true), 'No categories match these filters.')
})

import { canDeleteCategory, categoryTabCounts, sortCategories, usageText, viewCategories } from '../src/lib/categoryList.ts'

const catalogue: Category[] = [
  { id: 1, name: 'Groceries', type: 'expense', defaultEnvelope: 'needs', usageCount: 12 },
  { id: 2, name: 'books', type: 'expense', defaultEnvelope: 'culture', usageCount: 3 },
  { id: 3, name: 'Coffee', type: 'expense', defaultEnvelope: null, usageCount: 3 },
  { id: 4, name: 'Salary', type: 'income', usageCount: 8 },
  { id: 5, name: 'Old Rent', type: 'expense', defaultEnvelope: 'needs', archived: true, usageCount: 20 },
  { id: 6, name: 'Gift Income', type: 'income', archived: true, usageCount: 0 },
  { id: 7, name: 'Unused', type: 'expense', usageCount: 0 },
]
const ids = (list: Category[]) => list.map((c) => c.id)
const all = { envelope: 'all' as const, query: '', sort: 'name' as const }

test('every category is on exactly one tab and counts ignore search', () => {
  assert.deepEqual(categoryTabCounts(catalogue), { expense: 4, income: 1, archived: 2 })
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'expense' })), [2, 3, 1, 7])
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'income' })), [4])
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'archived' })), [6, 5])
})

test('most used sorts by count then name; A to Z ignores case; neither mutates the input', () => {
  const before = ids(catalogue)
  assert.deepEqual(ids(sortCategories(catalogue, 'usage')), [5, 1, 4, 2, 3, 6, 7])
  assert.deepEqual(ids(sortCategories(catalogue, 'name')), [2, 3, 6, 1, 5, 4, 7])
  assert.deepEqual(ids(catalogue), before)
})

test('envelope filter (including no default) and search compose; the Income tab ignores the envelope', () => {
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'expense', envelope: 'needs' })), [1])
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'expense', envelope: 'none' })), [3, 7])
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'archived', envelope: 'needs' })), [5])
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'income', envelope: 'culture' })), [4])
  assert.deepEqual(ids(viewCategories(catalogue, { ...all, tab: 'expense', query: '  BOO ' })), [2])
})

test('usage text and delete eligibility follow the all-time count; an unknown count is never deletable', () => {
  assert.equal(usageText(catalogue[0]!), 'Used by 12 transactions')
  assert.equal(usageText({ id: 9, name: 'x', type: 'expense', usageCount: 1 }), 'Used by 1 transaction')
  assert.equal(usageText(catalogue[6]!), 'Not used yet')
  assert.equal(usageText({ id: 9, name: 'x', type: 'expense' }), '')
  assert.equal(canDeleteCategory(catalogue[6]!), true)
  assert.equal(canDeleteCategory(catalogue[0]!), false)
  assert.equal(canDeleteCategory({ id: 9, name: 'x', type: 'expense' }), false)
})
