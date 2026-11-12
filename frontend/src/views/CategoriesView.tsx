import { Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { CategoryFormDialog, type CategoryFormValues } from '@/components/categories/CategoryFormDialog'
import { CategoryRow } from '@/components/categories/CategoryRow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock } from '@/components/ErrorBlock'
import { Moki } from '@/components/Moki'
import { MokiTip } from '@/components/MokiTip'
import { PageHeader } from '@/components/PageHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { DataSource } from '@/dataSource'
import {
  categoryEmptyMessage,
  categoryTabCounts,
  passesFilters,
  viewCategories,
  type CategorySort,
  type CategoryTab,
  type EnvelopeFilter,
} from '@/lib/categoryList'
import { ENVELOPES, ENVELOPE_INFO } from '@/lib/kakeibo'
import type { Category } from '@/types'
import type { Resource } from '@/useResource'

/*
 * Categories (spec §5): the one place to organise income and expense categories. Three tabs (Expenses, Income,
 * Archived, each with a count), search, an envelope filter, a sort, and a row per category showing its icon and
 * color, default Kakeibo envelope and how much it is used. Add and Edit open one dialog (a bottom sheet on
 * phones); Archive asks first, Restore is immediate, Delete lives in the Edit dialog and only while the
 * category is unused. Appearance and defaults never change saved transactions, amounts or envelopes.
 */
const PAGE_SIZE = 50
const SELECT = 'h-11 min-w-0 cursor-pointer rounded-control border border-input bg-card pr-7 pl-2.5 text-sm text-foreground sm:min-w-40 sm:pr-9 sm:pl-3 sm:text-[0.9375rem]'

export function CategoriesView({
  categories: resource,
  source,
  onChanged,
  onAdd,
}: {
  categories: Resource<Category[]>
  source: DataSource
  onChanged: () => void
  onAdd: () => void
}) {
  const [tab, setTab] = useState<CategoryTab>('expense')
  const [envelope, setEnvelope] = useState<EnvelopeFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CategorySort>('usage')
  const [pageIndex, setPageIndex] = useState(0)
  const [editor, setEditor] = useState<{ category: Category | null } | null>(null)
  const [archiving, setArchiving] = useState<Category | null>(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [working, setWorking] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  const all = useMemo(() => resource.data ?? [], [resource.data])
  const counts = useMemo(() => categoryTabCounts(all), [all])
  const rows = useMemo(() => viewCategories(all, { tab, envelope, query, sort }), [all, tab, envelope, query, sort])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(pageIndex, pageCount - 1)
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const filtering = query.trim() !== '' || (tab !== 'income' && envelope !== 'all')

  // Radix returns focus only to a DialogTrigger; these open from ordinary buttons, so put it back by hand.
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    const target = opener.current?.isConnected ? opener.current : addRef.current
    window.requestAnimationFrame(() => target?.focus())
  }
  const openEditor = (category: Category | null, from: HTMLElement | null) => {
    opener.current = from
    setMessage('')
    setActionError('')
    setEditor({ category })
  }

  const finish = (text: string) => {
    setMessage(text)
    onChanged()
  }

  const save = async (values: CategoryFormValues) => {
    const editing = editor?.category
    if (editing) {
      await source.updateCategory(editing.id, { name: values.name, defaultEnvelope: values.defaultEnvelope, iconKey: values.iconKey, colorKey: values.colorKey })
      // If the saved category no longer matches the search or filter, its row will disappear: send focus to Add instead.
      const updated: Category = { ...editing, name: values.name, defaultEnvelope: values.defaultEnvelope }
      if (viewCategories([updated], { tab, envelope, query, sort }).length === 0) opener.current = null
    } else {
      await source.createCategory(values)
      setTab(values.type) // show the new category where it belongs
      // Clear the search or envelope filter only if it would hide the new category, judged against what is in the
      // box right now (the person may have typed while the save was running, and that must survive).
      const created: Category = { id: 0, name: values.name, type: values.type, defaultEnvelope: values.defaultEnvelope }
      setQuery((current) => (passesFilters(created, { envelope: 'all', query: current }) ? current : ''))
      setEnvelope((current) => (values.type === 'income' || passesFilters(created, { envelope: current, query: '' }) ? current : 'all')) // the Income tab ignores the envelope filter
      setPageIndex(0)
    }
    setEditor(null)
    finish(editing ? 'Category updated.' : 'Category created.')
  }

  const remove = async (category: Category) => {
    await source.deleteCategory(category.id)
    opener.current = null
    setEditor(null)
    finish('Category deleted.')
  }

  const setArchived = async (category: Category, archived: boolean) => {
    setWorking(true)
    setActionError('')
    try {
      await source.setCategoryArchived(category.id, archived)
      finish(archived ? 'Category archived. Past transactions keep it.' : 'Category restored.')
      window.requestAnimationFrame(() => addRef.current?.focus()) // the row (and its button) just left this tab
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not change this category. Try again.')
    } finally {
      setWorking(false)
    }
  }

  const tabOptions: { value: CategoryTab; label: string }[] = [
    { value: 'expense', label: `Expenses ${counts.expense}` },
    { value: 'income', label: `Income ${counts.income}` },
    { value: 'archived', label: `Archived ${counts.archived}` },
  ]

  return (
    <div>
      <PageHeader title="Categories" onAdd={onAdd}>
        <Button ref={addRef} variant="secondary" onClick={(e) => openEditor(null, e.currentTarget)}>
          <Plus aria-hidden="true" />
          Add category
        </Button>
      </PageHeader>
      <MokiTip id="categories-look" pose="presenting" title="Make categories easy to spot">
        Give a category an icon and a color, or pick your own color. They show up in Activity and on the Dashboard charts, and never change any amount.
      </MokiTip>
      <p className="mb-4 text-sm text-muted-foreground">
        Organize income and expenses. An expense category’s default suggests a Kakeibo envelope for new transactions; expenses you already saved keep their own.
      </p>
      {message && (
        <p role="status" className="mb-4 rounded-control bg-success-soft px-4 py-3 text-sm text-income-ink">
          {message}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 rounded-control bg-error-soft px-4 py-3 text-sm text-error-ink">
          {actionError}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-4">
          <SegmentedControl
            legend="Category list"
            name="category-tab"
            value={tab}
            options={tabOptions}
            dense
            onChange={(next) => {
              setTab(next)
              setPageIndex(0)
            }}
          />
          <div className="grid grid-cols-[minmax(0,11fr)_minmax(0,9fr)] gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative col-span-2 block sm:col-span-1">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search categories"
                placeholder="Search categories"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPageIndex(0)
                }}
                className="h-11 w-full min-w-0 rounded-control border border-input bg-card pr-3 pl-9 text-base"
              />
            </label>
            {tab !== 'income' && (
              <select
                aria-label="Filter Kakeibo envelope"
                value={envelope}
                onChange={(e) => {
                  setEnvelope(e.target.value as EnvelopeFilter)
                  setPageIndex(0)
                }}
                className={SELECT}
              >
                <option value="all">Any envelope</option>
                {ENVELOPES.map((key) => (
                  <option key={key} value={key}>
                    {ENVELOPE_INFO[key].label}
                  </option>
                ))}
                <option value="none">No default</option>
              </select>
            )}
            <select aria-label="Sort categories" value={sort} onChange={(e) => setSort(e.target.value as CategorySort)} className={SELECT}>
              <option value="usage">Most used</option>
              <option value="name">A–Z</option>
            </select>
          </div>

          {resource.loading && !resource.data ? (
            <p role="status" className="py-6 text-center text-muted-foreground">
              Loading categories…
            </p>
          ) : resource.error ? (
            <ErrorBlock mascot what="categories" updatedAt={resource.updatedAt} onRetry={resource.retry} />
          ) : rows.length === 0 ? (
            <EmptyState
              className="my-3"
              message={filtering || all.length > 0 ? (tab === 'archived' && !filtering ? 'No archived categories.' : categoryEmptyMessage(true)) : categoryEmptyMessage(false)}
              illustration={<Moki pose={filtering ? 'searching' : 'resting'} size="small" />}
            />
          ) : (
            <ul className="m-0 list-none divide-y divide-border p-0" aria-label="Categories">
              {visibleRows.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  disabled={working}
                  onEdit={(c, from) => openEditor(c, from)}
                  onArchive={(c, from) => {
                    opener.current = from
                    setMessage('')
                    setArchiving(c)
                  }}
                  onRestore={(c) => void setArchived(c, false)}
                />
              ))}
            </ul>
          )}
          {rows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPageIndex(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {pageCount}
              </span>
              <Button variant="secondary" disabled={page >= pageCount - 1} onClick={() => setPageIndex(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CategoryFormDialog
        open={editor !== null}
        category={editor?.category ?? null}
        initialType={tab === 'income' ? 'income' : 'expense'}
        onSubmit={save}
        onDelete={remove}
        onOpenChange={(open) => !open && setEditor(null)}
        onClosed={restoreFocus}
      />

      <ConfirmDialog
        open={archiving !== null}
        title={archiving ? `Archive “${archiving.name}”?` : 'Archive category?'}
        confirmLabel="Archive category"
        busyLabel="Archiving…"
        tone="default"
        onConfirm={async () => {
          if (!archiving) return
          await source.setCategoryArchived(archiving.id, true)
          opener.current = null // the row leaves this tab
          setArchiving(null)
          finish('Category archived. Past transactions keep it.')
        }}
        onOpenChange={(open) => !open && setArchiving(null)}
        onClosed={restoreFocus}
      >
        <p>It won’t be offered for new transactions. Past transactions, amounts and Kakeibo envelopes stay exactly as they are.</p>
        <p>You can restore it any time from the Archived tab.</p>
      </ConfirmDialog>
    </div>
  )
}
