import { useEffect, useMemo, useRef } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { cn } from 'cn'

import { EmptyState } from '@/components/EmptyState'
import { Moki } from '@/components/Moki'
import { ErrorBlock, UpdatingStamp } from '@/components/ErrorBlock'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { TransactionItem } from '@/components/TransactionItem'
import { addBlocked, addLabel } from '@/components/addState'
import { Button } from '@/components/ui/button'
import { ACTIVITY_MAX_ROWS, dayHeading, groupByDate, monthLabel, monthOptions } from '@/lib/finance'
import { KIND_OPTIONS, categoryChoices, countLabel, hasActivityFilters, normalizeSearch, MAX_SEARCH, type ActivityFilters, type ActivityKindFilter } from '@/lib/activityFilters'
import { useDebouncedCommit } from '@/useDebouncedCommit'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot, ActivityItem, ActivityPage, AddState, Category } from '@/types'

/*
 * Activity: every income, expense, card payment and transfer for ONE month, newest first, grouped by day.
 * Controls: the month, the account, a type, a category, and a search over what a row shows (note, category, account).
 * Everything is applied by the server to the whole month before its page limit (see lib/activityFilters.ts), so a
 * filtered list is the newest MATCHING entries and an older match is never silently left out. There is no search
 * across months and no totals: the browser never adds money, so the count line only counts entries and says
 * plainly when more are waiting. Edit and Delete open the shared dialog in App (QuickAddDialog); this view only
 * reports which row was chosen.
 */

const NO_ITEMS: ActivityItem[] = []

function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block rounded-chip bg-secondary', className)} />
}

export function ActivityView({
  today,
  accounts: accountsRes,
  page: pageRes,
  month,
  accountId,
  filters,
  categories,
  loading: forcedLoading,
  addState,
  onMonthChange,
  onAccountChange,
  onSearch,
  onKind,
  onCategory,
  onReset,
  onLoadMore,
  onAdd,
  onEdit,
  onDelete,
}: {
  today: string
  accounts: Resource<AccountsSnapshot> // only for the account filter's choices
  page: Resource<ActivityPage> // the list; the newest page that arrived stays visible while the next one loads
  month: string
  accountId: number | null // lives in App so a save can say "hidden by your filters" and clear them
  filters: ActivityFilters // search, type and category: also in App, for the same reason
  categories: Category[] // for the category choices, archived ones with history included
  loading: boolean // ?demo=loading: show the skeleton whatever has arrived
  addState: AddState
  onMonthChange: (month: string) => void
  onAccountChange: (accountId: number | null) => void
  onSearch: (search: string) => void
  onKind: (kind: ActivityKindFilter) => void
  onCategory: (categoryId: number | null) => void
  onReset: () => void // clears the account, search, type and category (never the month)
  onLoadMore: () => void
  onAdd: () => void
  onEdit: (item: ActivityItem, opener: HTMLElement) => void
  onDelete: (item: ActivityItem, opener: HTMLElement) => void
}) {
  const snapshot = accountsRes.data
  const items = pageRes.data?.items ?? NO_ITEMS
  const hasMore = pageRes.data?.hasMore ?? false
  const loading = forcedLoading || (!pageRes.data && !pageRes.error)
  const updating = useDelayedFlag(pageRes.stale, 400)
  const groups = groupByDate(items)
  const label = monthLabel(month)
  const filtered = hasActivityFilters(filters, accountId)
  const search = useDebouncedCommit(filters.search, onSearch, normalizeSearch)
  const choices = useMemo(() => categoryChoices(categories, filters.kind), [categories, filters.kind])
  const noCategories = filters.kind === 'payment' || filters.kind === 'transfer'

  const accounts = snapshot ? [...snapshot.liquid.map((l) => l.account), ...snapshot.cards.map((c) => c.account)] : []

  // "Load more" appends below the button, so move focus to the first new row once it arrives; otherwise focus
  // would be lost when the button disappears on the last page.
  const focusFrom = useRef<number | null>(null)
  useEffect(() => {
    const from = focusFrom.current
    if (from === null || items.length <= from) return
    focusFrom.current = null
    const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-row="${items[from].key}"]`))
    targets.find((el) => el.offsetParent !== null)?.focus() // the phone row or the desktop Edit button, whichever is shown
  }, [items])

  const loadMore = () => {
    focusFrom.current = items.length // the first new entry is the one after those already shown
    onLoadMore()
  }

  const count = countLabel(items.length, hasMore, filtered)

  return (
    <div aria-busy={loading}>
      <PageHeader title="Activity" onAdd={onAdd} addState={addState} />
      <p role="status" className="sr-only">
        {loading ? 'Loading activity' : ''}
      </p>

      <div role="search" aria-label="Search and filter activity" className="mb-3.5 grid gap-2.5">
        <div className="relative">
          <label htmlFor="activity-search" className="sr-only">Search activity</label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="activity-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={MAX_SEARCH}
            placeholder="Search notes, categories and accounts"
            value={search.draft}
            onChange={(e) => search.setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && search.draft !== '') { e.stopPropagation(); search.clear() } }}
            className="h-11 w-full min-w-0 rounded-full border border-input bg-card pr-11 pl-10 text-base [&::-webkit-search-cancel-button]:hidden"
          />
          {search.draft !== '' && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { search.clear(); document.getElementById('activity-search')?.focus() }}
              className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 md:flex md:flex-wrap">
          <MonthSelect value={month} options={monthOptions(today)} onChange={onMonthChange} className="min-w-0 md:w-auto" />
          <label htmlFor="activity-account" className="sr-only">
            Account
          </label>
          <select
            id="activity-account"
            value={accountId ?? ''}
            onChange={(e) => onAccountChange(e.target.value === '' ? null : Number(e.target.value))}
            className="h-11 min-w-0 cursor-pointer rounded-full border border-input bg-card pl-4 text-[0.9375rem] font-semibold text-foreground md:w-auto"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <label htmlFor="activity-kind" className="sr-only">Type</label>
          <select
            id="activity-kind"
            value={filters.kind}
            onChange={(e) => onKind(e.target.value as ActivityKindFilter)}
            className="h-11 min-w-0 cursor-pointer rounded-full border border-input bg-card pl-4 text-[0.9375rem] font-semibold text-foreground md:w-auto"
          >
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label htmlFor="activity-category" className="sr-only">Category</label>
          <select
            id="activity-category"
            value={filters.categoryId ?? ''}
            disabled={noCategories}
            aria-describedby={noCategories ? 'activity-category-note' : undefined}
            onChange={(e) => onCategory(e.target.value === '' ? null : Number(e.target.value))}
            className="h-11 min-w-0 cursor-pointer rounded-full border border-input bg-card pl-4 text-[0.9375rem] font-semibold text-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg md:w-auto"
          >
            <option value="">{noCategories ? 'No categories' : 'All categories'}</option>
            {filters.kind === 'all' ? (
              (['expense', 'income'] as const).map((type) => (
                <optgroup key={type} label={type === 'expense' ? 'Expense categories' : 'Income categories'}>
                  {choices.filter((c) => c.type === type).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </optgroup>
              ))
            ) : (
              choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)
            )}
          </select>
        </div>
        {noCategories && <p id="activity-category-note" className="-mt-1 text-sm text-muted-foreground">Card payments and transfers don&rsquo;t have a category.</p>}
      </div>

      {!loading && !pageRes.error && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          <p role="status" className="text-sm text-muted-foreground">
            {count} · {label}
          </p>
          <div className="flex items-center gap-x-3">
            <UpdatingStamp show={updating} />
            {filtered && (
              <Button variant="link" className="min-h-11 px-0" onClick={onReset}>
                Reset filters
              </Button>
            )}
          </div>
        </div>
      )}
      {pageRes.error ? (
        <ErrorBlock what="activity" updatedAt={pageRes.updatedAt} onRetry={pageRes.retry} focusAfter="main h1" />
      ) : loading ? (
        <ul aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="flex min-h-[68px] items-center justify-between gap-4 border-t border-rule py-3.5 first:border-t-0">
              <div className="grid gap-2">
                <Bar className="h-4 w-36" />
                <Bar className="h-3.5 w-24" />
              </div>
              <Bar className="h-4 w-20" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            message="Nothing matches these filters."
            illustration={<Moki pose="searching" size="medium" />}
            action={
              <Button variant="secondary" onClick={onReset}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            message={`No activity in ${label}.`}
            illustration={<Moki pose="resting" size="medium" />}
            action={
              <Button variant="secondary" onClick={onAdd} disabled={addBlocked(addState)}>
                <Plus aria-hidden="true" />
                {addLabel(addState)}
              </Button>
            }
          />
        )
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.date} aria-labelledby={`day-${group.date}`} className="mb-2">
              <h2 id={`day-${group.date}`} className="pt-3 pb-0.5 text-sm font-semibold text-muted-foreground">
                {dayHeading(group.date)}
              </h2>
              <ul>
                {group.items.map((item) => (
                  <TransactionItem key={item.key} item={item} onOpen={() => undefined} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </ul>
            </section>
          ))}
          {hasMore && items.length >= ACTIVITY_MAX_ROWS ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing the latest {ACTIVITY_MAX_ROWS}. Search or filter to narrow this, or choose another month.
            </p>
          ) : (
            hasMore && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                <span>{filtered ? `Showing the first ${items.length} matching.` : `Showing the latest ${items.length}.`}</span>
                <Button variant="link" onClick={loadMore}>
                  Load more
                </Button>
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
