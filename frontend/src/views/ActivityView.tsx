import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from 'cn'

import { EmptyState } from '@/components/EmptyState'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { TransactionItem } from '@/components/TransactionItem'
import { Button } from '@/components/ui/button'
import { activityPage, dayHeading, groupByDate, isCard, liquidAccounts, monthLabel, monthOptions } from '@/lib/finance'
import type { ActivityItem, MockData } from '@/types'

/*
 * Activity: every income, expense and card payment for one month, newest first, grouped by day.
 * Two filters (month, account) and nothing else. No totals here: the browser never adds money
 * (the summary endpoint is month-only), so the count line only counts entries.
 * The account filter is applied before the page limit, like the API will: see activityPage().
 * Edit and Delete are stand-ins until Milestone 4.5.
 */
const PAGE_SIZE = 50

function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block rounded-chip bg-secondary', className)} />
}

export function ActivityView({
  data,
  month,
  loading,
  addDisabled,
  onMonthChange,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: MockData
  month: string
  loading: boolean
  addDisabled: boolean
  onMonthChange: (month: string) => void
  onAdd: () => void
  onEdit: (item: ActivityItem, opener: HTMLElement) => void
  onDelete: (item: ActivityItem, opener: HTMLElement) => void
}) {
  const [accountId, setAccountId] = useState<number | null>(null)
  // The page size belongs to one combination of filters; a different month or account starts again at one page.
  const filterKey = `${month}|${accountId}`
  const [paged, setPaged] = useState({ key: filterKey, size: PAGE_SIZE })
  const size = paged.key === filterKey ? paged.size : PAGE_SIZE
  // Forget the old page size as soon as the filters change, so coming back to a month starts at one page again.
  if (paged.key !== filterKey) setPaged({ key: filterKey, size: PAGE_SIZE })

  const { items, hasMore } = activityPage(data, month, accountId, size)
  const groups = groupByDate(items)
  const label = monthLabel(month)
  const filtered = accountId !== null

  const accounts = [...liquidAccounts(data).map((a) => a.account), ...data.accounts.filter(isCard)]

  // "Load more" appends below the button, so move focus to the first new row; otherwise it would be lost
  // when the button disappears on the last page.
  const focusAfterMore = useRef<string | null>(null)
  useEffect(() => {
    const key = focusAfterMore.current
    if (!key) return
    focusAfterMore.current = null
    const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-row="${key}"]`))
    targets.find((el) => el.offsetParent !== null)?.focus() // the phone row or the desktop Edit button, whichever is shown
  }, [items.length])

  const loadMore = () => {
    // size is the page just shown, so the first new entry is the one after it
    focusAfterMore.current = activityPage(data, month, accountId, size + PAGE_SIZE).items[size]?.key ?? null
    setPaged({ key: filterKey, size: size + PAGE_SIZE })
  }

  const count = hasMore
    ? `Latest ${items.length} entries`
    : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`

  return (
    <div aria-busy={loading}>
      <PageHeader title="Activity" onAdd={onAdd} addDisabled={addDisabled} />
      <p role="status" className="sr-only">
        {loading ? 'Loading activity' : ''}
      </p>

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 md:flex">
        <MonthSelect value={month} options={monthOptions(data.today)} onChange={onMonthChange} className="min-w-0 md:w-auto" />
        <label htmlFor="activity-account" className="sr-only">
          Account
        </label>
        <select
          id="activity-account"
          value={accountId ?? ''}
          onChange={(e) => setAccountId(e.target.value === '' ? null : Number(e.target.value))}
          className="h-11 min-w-0 cursor-pointer rounded-full border border-input bg-card pl-4 text-[15px] font-semibold text-foreground md:w-auto"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {!loading && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {count} · {label}
        </p>
      )}
      {loading ? (
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
              <Button variant="secondary" onClick={() => setAccountId(null)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            message={`No activity in ${label}.`}
            action={
              <Button variant="secondary" onClick={onAdd} disabled={addDisabled}>
                <Plus aria-hidden="true" />
                {addDisabled ? 'Add an account first' : 'Add transaction'}
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
          {hasMore && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
              <span>Showing the latest {items.length}.</span>
              <Button variant="link" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
