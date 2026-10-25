import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { cn } from 'cn'

import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock, UpdatingStamp } from '@/components/ErrorBlock'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { TransactionItem } from '@/components/TransactionItem'
import { addBlocked, addLabel } from '@/components/addState'
import { Button } from '@/components/ui/button'
import { ACTIVITY_MAX_ROWS, dayHeading, groupByDate, monthLabel, monthOptions } from '@/lib/finance'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot, ActivityItem, ActivityPage, AddState } from '@/types'

/*
 * Activity: every income, expense and card payment for one month, newest first, grouped by day.
 * Two filters (month, account) and nothing else. No totals here: the browser never adds money
 * (the summary endpoint is month-only), so the count line only counts entries.
 * The account filter is applied before the page limit, like the API will: see activityPage().
 * Edit and Delete open the shared dialog in App (QuickAddDialog); this view only reports which row was chosen.
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
  loading: forcedLoading,
  addState,
  onMonthChange,
  onAccountChange,
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
  loading: boolean // ?demo=loading: show the skeleton whatever has arrived
  addState: AddState
  onMonthChange: (month: string) => void
  onAccountChange: (accountId: number | null) => void
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
  const filtered = accountId !== null

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

  const count = hasMore
    ? `Latest ${items.length} entries`
    : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`

  return (
    <div aria-busy={loading}>
      <PageHeader title="Activity" onAdd={onAdd} addState={addState} />
      <p role="status" className="sr-only">
        {loading ? 'Loading activity' : ''}
      </p>

      <div className="mb-3.5 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 md:flex">
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
      </div>

      {!loading && !pageRes.error && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          <p role="status" className="text-sm text-muted-foreground">
            {count} · {label}
          </p>
          <UpdatingStamp show={updating} />
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
            action={
              <Button variant="secondary" onClick={() => onAccountChange(null)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            message={`No activity in ${label}.`}
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
              Showing the latest {ACTIVITY_MAX_ROWS}. Choose a month or an account to narrow this.
            </p>
          ) : (
            hasMore && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                <span>Showing the latest {items.length}.</span>
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
