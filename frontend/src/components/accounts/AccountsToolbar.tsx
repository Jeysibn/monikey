import { Search } from 'lucide-react'

import { WalletViewToggle, type WalletViewMode } from '@/components/wallet/WalletViewToggle'
import { SORTS, TYPE_FILTERS, countText, type AccountSort, type AccountTypeFilter } from '@/lib/accountsView'

/*
 * The Accounts toolbar (spec 7.1): search by name, a type filter, a sort, and the Cards/List toggle, with a count of
 * what is shown. The type, sort and display mode are remembered in this browser; the search is not. Sorting by an amount
 * explains what it compares, because a card's debt is never ranked as if it were money you have.
 */
const SELECT = 'h-11 w-full min-w-0 cursor-pointer rounded-control border border-input bg-card pr-8 pl-3 text-[0.9375rem] text-foreground'

export function AccountsToolbar({
  query,
  onQuery,
  type,
  onType,
  sort,
  onSort,
  mode,
  onMode,
  shown,
  total,
}: {
  query: string
  onQuery: (query: string) => void
  type: AccountTypeFilter
  onType: (type: AccountTypeFilter) => void
  sort: AccountSort
  onSort: (sort: AccountSort) => void
  mode: WalletViewMode
  onMode: (mode: WalletViewMode) => void
  shown: number
  total: number
}) {
  const hint = SORTS.find((s) => s.value === sort)?.hint
  return (
    <section aria-label="Find and arrange accounts" className="grid gap-2.5 rounded-card border border-border bg-card p-3 md:p-4">
      <div className="grid gap-2.5 min-[560px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="relative block min-[560px]:col-auto">
          <span className="sr-only">Search accounts</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search accounts"
            placeholder="Search accounts"
            autoComplete="off"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            className="h-11 w-full min-w-0 rounded-control border border-input bg-card pr-3 pl-9 text-base"
          />
        </label>
        <select aria-label="Filter accounts by type" value={type} onChange={(e) => onType(e.target.value as AccountTypeFilter)} className={SELECT}>
          {TYPE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select aria-label="Sort accounts" value={sort} onChange={(e) => onSort(e.target.value as AccountSort)} className={SELECT}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p role="status" className="text-sm text-muted-foreground">{countText(shown, total)}{hint ? ` · ${hint}` : ''}</p>
        <WalletViewToggle value={mode} onChange={onMode} className="flex gap-2" />
      </div>
    </section>
  )
}
