import { useMemo, useState, type FormEvent } from 'react'

import type { DataSource } from '@/dataSource'
import { ENVELOPES, ENVELOPE_INFO, envelopeLabel } from '@/lib/kakeibo'
import { filterCategories, type CategoryStatus } from '@/lib/categoryList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorBlock } from '@/components/ErrorBlock'
import { PageHeader } from '@/components/PageHeader'
import type { Category, CategoryType, KakeiboEnvelope } from '@/types'
import type { Resource } from '@/useResource'

const PAGE_SIZE = 50

export function CategoriesView({ categories: resource, source, onChanged }: { categories: Resource<Category[]>; source: DataSource; onChanged: () => void }) {
  const [type, setType] = useState<CategoryType | 'all'>('all')
  const [status, setStatus] = useState<CategoryStatus>('active')
  const [envelope, setEnvelope] = useState<KakeiboEnvelope | 'all'>('all')
  const [query, setQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [editEnvelope, setEditEnvelope] = useState<KakeiboEnvelope | ''>('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const rows = useMemo(() => filterCategories(resource.data ?? [], { type, status, envelope, query }), [resource.data, type, status, envelope, query])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(pageIndex, pageCount - 1)
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const beginEdit = (category?: Category) => {
    setEditing(category ?? null)
    setName(category?.name ?? '')
    setEditEnvelope(category?.defaultEnvelope ?? '')
    setFormError('')
    setMessage('')
  }

  const run = async (action: () => Promise<void>, success: string) => {
    setSaving(true)
    setFormError('')
    try {
      await action()
      setMessage(success)
      setEditing(null)
      onChanged()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this category. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = name.trim().replace(/\s+/g, ' ')
    if (!normalized) { setFormError('Enter a category name.'); return }
    const chosen = editing ? editing.type : type === 'income' ? 'income' : 'expense'
    const defaultEnvelope = chosen === 'expense' ? editEnvelope || null : null
    if (!editing) { setType(chosen); setStatus('active'); setEnvelope('all'); setPageIndex(0) }
    if (editing) void run(() => source.updateCategory(editing.id, { name: normalized, defaultEnvelope }), 'Category updated.')
    else void run(() => source.createCategory({ name: normalized, type: chosen, defaultEnvelope }), 'Category created.')
  }

  return <div>
    <PageHeader title="Categories" onAdd={() => beginEdit()} />
    <p className="mb-4 text-sm text-muted-foreground">Organize income and expenses. Expense defaults suggest a Kakeibo envelope for new transactions; saved expenses keep their own classification.</p>
    {message && <p role="status" className="mb-4 rounded-control bg-success-soft px-4 py-3 text-sm text-income-ink">{message}</p>}
    <Card className="mb-4">
      <CardHeader><CardTitle>{editing ? `Edit ${editing.name}` : 'Add a category'}</CardTitle><CardDescription>Names are unique within income or expense categories.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto] md:items-end">
          <label className="grid gap-1.5 text-sm font-medium">Name<input autoComplete="off" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-control border border-input bg-background px-3" /></label>
          {!editing && <label className="grid gap-1.5 text-sm font-medium">Type<select value={type === 'income' ? 'income' : 'expense'} onChange={(event) => setType(event.target.value as CategoryType)} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="expense">Expense</option><option value="income">Income</option></select></label>}
          {(editing ? editing.type : type !== 'income') && <label className="grid gap-1.5 text-sm font-medium">Default Kakeibo envelope<select value={editEnvelope} onChange={(event) => setEditEnvelope(event.target.value as KakeiboEnvelope | '')} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="">No default</option>{ENVELOPES.map((item) => <option key={item} value={item}>{ENVELOPE_INFO[item].label}</option>)}</select></label>}
          {formError && <p role="alert" className="text-sm text-destructive md:col-span-full">{formError}</p>}
          <div className="flex gap-2 md:col-start-3 md:row-start-1">{editing && <Button type="button" variant="secondary" onClick={() => beginEdit()}>Cancel</Button>}<Button disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create category'}</Button></div>
        </form>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Category list</CardTitle><CardDescription>{rows.length} {rows.length === 1 ? 'category' : 'categories'}{rows.length > PAGE_SIZE ? ` · Page ${page + 1} of ${pageCount}` : ''}</CardDescription></CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Type<select aria-label="Filter category type" value={type} onChange={(event) => setType(event.target.value as CategoryType | 'all')} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="all">Income and expense</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
          <label className="grid gap-1 text-sm">Status<select aria-label="Filter category status" value={status} onChange={(event) => setStatus(event.target.value as CategoryStatus)} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="active">Active</option><option value="archived">Archived</option><option value="all">Active and archived</option></select></label>
          <label className="grid gap-1 text-sm">Kakeibo envelope<select aria-label="Filter Kakeibo envelope" value={envelope} onChange={(event) => setEnvelope(event.target.value as KakeiboEnvelope | 'all')} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="all">All envelopes</option>{ENVELOPES.map((item) => <option key={item} value={item}>{ENVELOPE_INFO[item].label}</option>)}</select></label>
        </div>
        <label className="mb-3 grid gap-1 text-sm">Search categories<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" className="min-h-11 rounded-control border border-input bg-background px-3" /></label>
        {resource.loading && !resource.data ? <p role="status" className="py-6 text-center text-muted-foreground">Loading categories…</p> : resource.error ? <ErrorBlock what="categories" updatedAt={resource.updatedAt} onRetry={resource.retry} /> : rows.length === 0 ? <p className="py-6 text-center text-muted-foreground">No categories match these filters.</p> : <ul className="divide-y divide-border">{visibleRows.map((category) => <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{category.name} <span className="ml-1 text-xs font-normal text-muted-foreground">{category.type}{category.archived ? ' · archived' : ''}</span></p>{category.type === 'expense' && <p className="text-sm text-muted-foreground">Default: {envelopeLabel(category.defaultEnvelope)}</p>}</div><div className="flex flex-wrap gap-2"><Button aria-label={`Edit ${category.name}`} variant="secondary" size="sm" onClick={() => beginEdit(category)}>Edit</Button>{category.archived ? <Button aria-label={`Restore ${category.name}`} variant="secondary" size="sm" disabled={saving} onClick={() => void run(() => source.setCategoryArchived(category.id, false), 'Category restored.')}>Restore</Button> : <Button aria-label={`Archive ${category.name}`} variant="secondary" size="sm" disabled={saving} onClick={() => { if (window.confirm(`Archive “${category.name}”? Historical transactions will keep this category.`)) void run(() => source.setCategoryArchived(category.id, true), 'Category archived.') }}>Archive</Button>}<Button aria-label={`Delete ${category.name}`} variant="ghost" size="sm" disabled={saving} onClick={() => { if (window.confirm(`Permanently delete “${category.name}”? This only works when no transactions refer to it.`)) void run(() => source.deleteCategory(category.id), 'Category deleted.') }}>Delete</Button></div></li>)}</ul>}
        {rows.length > PAGE_SIZE && <div className="mt-4 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page === 0} onClick={() => setPageIndex(page - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</span><Button variant="secondary" disabled={page >= pageCount - 1} onClick={() => setPageIndex(page + 1)}>Next</Button></div>}
      </CardContent>
    </Card>
  </div>
}
