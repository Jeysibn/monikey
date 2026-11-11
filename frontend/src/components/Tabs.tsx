import { useRef, type KeyboardEvent } from 'react'
import { cn } from 'cn'

import { panelId, tabId } from '@/lib/tabIds'

/*
 * An in-page tab list (ARIA tabs pattern): the tab buttons here, the panels in the parent. Arrow keys,
 * Home and End move between tabs and select the one that gets focus; only the selected tab is in the tab order
 * (roving tabindex), so Tab goes into the panel. Each tab names its panel (aria-controls) and each panel
 * should name its tab (aria-labelledby) using `tabId` and `panelId` from lib/tabIds.ts. Tabs change what is shown on the page;
 * they are not separate pages and do not touch the URL or the navigation.
 */
export function Tabs<T extends string>({
  label,
  idPrefix,
  tabs,
  value,
  onChange,
  className,
}: {
  label: string
  idPrefix: string
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>())

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const target =
      event.key === 'ArrowRight' ? (index >= last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index <= 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (target === null) return
    event.preventDefault()
    const next = tabs[target]!
    onChange(next.id)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={cn('inline-grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-secondary p-1', className)}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el)
              else refs.current.delete(tab.id)
            }}
            id={tabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => move(e, index)}
            className={cn(
              'h-11 cursor-pointer rounded-full px-4 text-[0.9375rem] font-semibold whitespace-nowrap text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected && 'bg-card text-foreground shadow-[0_0_0_1px_var(--rule)]',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
