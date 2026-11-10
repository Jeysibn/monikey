import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/lib/categoryIcons'
import { CATEGORY_ICON_OPTIONS, type CategoryIconKey } from '@/lib/categoryIconRegistry'

const options = Object.entries(CATEGORY_ICON_OPTIONS) as [CategoryIconKey, (typeof CATEGORY_ICON_OPTIONS)[CategoryIconKey]][]

export function CategoryIconPicker({ value, onChange }: { value: CategoryIconKey | null; onChange: (value: CategoryIconKey | null) => void }) {
  const [query, setQuery] = useState('')
  const [focusKey, setFocusKey] = useState<CategoryIconKey | null>(value)
  const buttons = useRef(new Map<CategoryIconKey, HTMLButtonElement>())
  const matches = useMemo(() => options.filter(([key, option]) => `${option.label} ${key}`.toLowerCase().includes(query.trim().toLowerCase())), [query])

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, current: CategoryIconKey) => {
    const directions: Record<string, number> = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }
    const offset = directions[event.key]
    if (offset === undefined || matches.length === 0) return
    event.preventDefault()
    const index = matches.findIndex(([key]) => key === current)
    const next = matches[(index + offset + matches.length * 10) % matches.length]?.[0]
    if (next) {
      setFocusKey(next)
      buttons.current.get(next)?.focus()
    }
  }

  return (
    <fieldset className="grid min-w-0 gap-2 border-0 p-0">
      <legend className="text-sm font-medium">Category icon <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <label className="relative block">
        <Search aria-hidden="true" className="absolute top-3 left-3 size-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search category icons"
          placeholder="Search icons"
          className="min-h-10 w-full rounded-control border border-input bg-background pr-3 pl-9 text-sm"
        />
      </label>
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <CategoryIcon iconKey={value} className="size-4" />
        <span>{value ? CATEGORY_ICON_OPTIONS[value].label : 'No icon selected'}</span>
        {value && <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => onChange(null)}><X aria-hidden="true" className="size-4" />Clear icon</Button>}
      </div>
      {matches.length ? (
        <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto rounded-control border border-border p-2" role="group" aria-label="Available category icons">
          {matches.map(([key, option]) => {
            const Icon = option.Icon
            const selected = value === key
            const tabStop = (focusKey && matches.some(([candidate]) => candidate === focusKey) ? focusKey : matches[0]?.[0]) === key
            return (
              <button
                key={key}
                ref={(element) => { if (element) buttons.current.set(key, element); else buttons.current.delete(key) }}
                type="button"
                aria-label={`${option.label} icon`}
                aria-pressed={selected}
                tabIndex={tabStop ? 0 : -1}
                onFocus={() => setFocusKey(key)}
                onKeyDown={(event) => moveFocus(event, key)}
                onClick={() => onChange(key)}
                className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-control border border-transparent px-1 text-xs text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary-ink"
                title={option.label}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-5" />
                  {selected && <Check aria-hidden="true" className="absolute -right-2 -bottom-2 size-3 rounded-full bg-primary-soft" />}
                </span>
                <span className="max-w-full truncate">{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : <p className="text-sm text-muted-foreground">No icons match that search.</p>}
      <span className="sr-only">Use arrow keys to move through the icon choices.</span>
    </fieldset>
  )
}
