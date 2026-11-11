import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Banknote, Check, ChevronDown, CreditCard, Landmark, Search, Smartphone, Wallet } from 'lucide-react'
import { cn } from 'cn'

import { accountDetail, groupAccounts, searchAccounts } from '@/lib/accountPicker'
import { accountById } from '@/lib/snapshot'
import type { AccountInfo, LedgerSnapshot } from '@/types'

/*
 * The Quick Add account chooser: a searchable list that opens inline under its button (no popover, so there
 * is no second focus trap or portal layer inside the dialog). The button is labelled by the field's <label>;
 * the open panel is an ARIA combobox: the search box keeps focus and arrow keys move a highlighted option
 * (aria-activedescendant), Enter picks it, Escape closes only the list. Options are grouped as Last used /
 * Cash & bank / E-wallet / Credit cards, and each shows its type plus balance or amount owed (a card never
 * shows its available credit as if it were cash). Which accounts are offered is the caller's job (accountsFor).
 */
function TypeIcon({ type }: { type?: string }) {
  const className = 'size-5'
  if (type === 'cash') return <Banknote className={className} />
  if (type === 'bank') return <Landmark className={className} />
  if (type === 'ewallet') return <Smartphone className={className} />
  if (type === 'credit_card') return <CreditCard className={className} />
  return <Wallet className={className} />
}

function AccountGlyph({ account, selected }: { account?: AccountInfo; selected?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid size-10 shrink-0 place-items-center rounded-control bg-secondary text-muted-foreground', selected && 'bg-primary-soft text-primary-ink')}
    >
      <TypeIcon type={account?.type} />
    </span>
  )
}

export function AccountPicker({
  id,
  accounts,
  snapshot,
  value,
  recentId = null,
  withFigures,
  placeholder,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  id: string // the trigger's id: the field's <label htmlFor> points here
  accounts: AccountInfo[] // already limited to what this field may offer
  snapshot: LedgerSnapshot
  value: number | null
  recentId?: number | null
  withFigures: boolean
  placeholder: string
  invalid?: boolean
  describedBy?: string
  onChange: (id: number) => void
  onBlur?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const opened = useRef<'keyboard' | 'pointer'>('pointer')
  const panelId = useId()

  const selected = accountById(snapshot, value)
  // "Last used" is a shortcut, not a filter: it disappears while searching so results are not repeated.
  const groups = useMemo(() => {
    const found = searchAccounts(accounts, query)
    return groupAccounts(found, query.trim() === '' ? recentId : null)
  }, [accounts, query, recentId])
  const options = useMemo(() => groups.flatMap((g) => g.accounts.map((a) => ({ account: a, key: `${g.key}-${a.id}` }))), [groups])
  const optionId = (key: string) => `${panelId}-${key}`
  const activeOption = options[Math.min(active, options.length - 1)]

  useEffect(() => {
    if (!open) return
    // Phones: opening the keyboard for a four-account list buries it; open it for long lists or for keyboard users.
    if (opened.current === 'keyboard' || accounts.length > 6) searchRef.current?.focus()
    document.getElementById(panelId)?.scrollIntoView?.({ block: 'nearest' }) // keep the whole list inside the sheet
    const chosen = options.findIndex((o) => o.account.id === value)
    setActive(chosen >= 0 ? chosen : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when opening only, not on every keystroke
  }, [open])

  useEffect(() => {
    if (!open || !activeOption) return
    document.getElementById(optionId(activeOption.key))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, activeOption?.key])

  const close = (refocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (refocus) triggerRef.current?.focus()
    onBlur?.()
  }
  const choose = (accountId: number) => {
    onChange(accountId)
    close(true)
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = options.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i >= last ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? last : i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(last, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault() // never submit the form from the search box
      if (activeOption) choose(activeOption.account.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }

  return (
    <div
      data-account-picker=""
      data-open={open ? '' : undefined}
      onBlur={(e) => {
        // Focus left the picker altogether (Tab away): close it without stealing focus back.
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) close(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open && e.target === triggerRef.current) {
          e.stopPropagation()
          close(true)
        }
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={(e) => {
          opened.current = e.detail === 0 ? 'keyboard' : 'pointer'
          if (open) close(false)
          else setOpen(true)
        }}
        className={cn(
          'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-control border border-input bg-card px-3 py-2 text-left outline-none',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg',
          invalid && 'border-destructive ring-1 ring-destructive',
          open && 'border-primary',
        )}
      >
        <AccountGlyph account={selected} selected={!!selected} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-base', selected ? 'font-semibold' : 'text-muted-foreground')}>{selected ? selected.name : placeholder}</span>
          {selected && <span className="block truncate text-sm text-muted-foreground">{accountDetail(selected, snapshot, withFigures)}</span>}
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>

      {open && (
        <div id={panelId} className="mt-2 grid gap-2 rounded-control border border-border bg-surface-raised p-2.5">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${panelId}-list`}
              aria-activedescendant={activeOption ? optionId(activeOption.key) : undefined}
              aria-autocomplete="list"
              aria-label="Search accounts"
              placeholder="Search accounts"
              autoComplete="off"
              enterKeyHint="done"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onSearchKeyDown}
              className="h-11 w-full rounded-control border border-input bg-card pr-3 pl-9 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>
          {/* mousedown on an option must not blur the search box, or the panel would close before the click lands */}
          <ul
            ref={listRef}
            id={`${panelId}-list`}
            role="listbox"
            aria-label="Accounts"
            onMouseDown={(e) => e.preventDefault()}
            className="m-0 grid max-h-60 grid-cols-1 list-none gap-1 overflow-y-auto overscroll-contain p-0"
          >
            {groups.map((g) => (
              <li key={g.key} role="presentation" className="grid min-w-0 grid-cols-1 gap-1">
                <span aria-hidden="true" className="px-1 pt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.label}
                </span>
                <ul role="group" aria-label={g.label} className="m-0 grid min-w-0 grid-cols-1 list-none gap-1 p-0">
                  {g.accounts.map((a) => {
                    const key = `${g.key}-${a.id}`
                    const isActive = activeOption?.key === key
                    const isSelected = a.id === value
                    return (
                      <li
                        key={key}
                        id={optionId(key)}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => choose(a.id)}
                        onMouseMove={() => {
                          const at = options.findIndex((o) => o.key === key)
                          if (at >= 0 && at !== active) setActive(at)
                        }}
                        className={cn(
                          'flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-control border border-transparent bg-card px-2.5 py-2',
                          isActive && 'border-primary',
                          isSelected && 'bg-primary-soft',
                        )}
                      >
                        <AccountGlyph account={a} selected={isSelected} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{a.name}</span>
                          <span className="block truncate text-sm text-muted-foreground">{accountDetail(a, snapshot, withFigures)}</span>
                        </span>
                        {isSelected && <Check aria-label="Selected" className="size-5 shrink-0 text-primary-ink" />}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
          {options.length === 0 && (
            <p role="status" className="px-1 py-3 text-center text-sm text-muted-foreground">
              {query.trim() === '' ? 'No accounts to choose from.' : `No accounts match “${query.trim()}”.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
