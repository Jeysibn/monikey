import type { KeyboardEvent } from 'react'
import { NavLink } from 'react-router-dom'
import './V3Dock.css'

export type V3DockRoutes = {
  overview: string
  activity: string
  accounts: string
  planning: string
}

type DockIconName = 'overview' | 'activity' | 'add' | 'accounts' | 'planning'

function DockIcon({ name }: { name: DockIconName }) {
  const shared = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  switch (name) {
    case 'overview':
      return <svg {...shared}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M9 21v-8h6v8" /></svg>
    case 'activity':
      return <svg {...shared}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
    case 'add':
      return <svg {...shared}><path d="M12 5v14M5 12h14" /></svg>
    case 'accounts':
      return <svg {...shared}><rect x="3" y="6" width="18" height="15" rx="2" /><path d="M3 10h18M7 6V4a1 1 0 0 1 1-1h11" /></svg>
    case 'planning':
      return <svg {...shared}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18m-13 5h3" /></svg>
  }
}

/**
 * V3 floating dock. Mounted only by the opt-in V3 preview shell (never by the
 * legacy AppShell) until the remake release gates are met.
 *
 * This component never mutates accounts or the ledger; the owning shell supplies
 * route destinations and the already-validated Quick Add callback. Every control
 * stays in the natural Tab order; Left/Right/Home/End additionally move focus
 * between dock controls (a toolbar-style shortcut, not a roving tabindex).
 */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a, button'))
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index === -1) return
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % items.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
  else if (event.key === 'Home') next = 0
  else next = items.length - 1
  event.preventDefault()
  items[next]?.focus()
}

export function V3Dock({
  routes,
  onAddTransaction,
}: {
  routes: V3DockRoutes
  onAddTransaction: () => void
}) {
  const destinations = [
    { label: 'Overview', key: 'overview' as const, to: routes.overview },
    { label: 'Activity', key: 'activity' as const, to: routes.activity },
    { label: 'Accounts', key: 'accounts' as const, to: routes.accounts },
    { label: 'Planning', key: 'planning' as const, to: routes.planning },
  ]

  const renderLink = (item: (typeof destinations)[number]) => (
    <NavLink
      key={item.key}
      to={item.to}
      end={item.key === 'overview'}
      className={({ isActive }) => `v3-dock__item${isActive ? ' v3-dock__item--active' : ''}`}
      aria-label={item.label}
    >
      <DockIcon name={item.key} />
      <span className="v3-dock__label">{item.label}</span>
    </NavLink>
  )

  return (
    <nav className="v3-dock" aria-label="Primary" onKeyDown={moveFocus}>
      {destinations.slice(0, 2).map(renderLink)}
      <button
        type="button"
        className="v3-dock__item v3-dock__add"
        aria-label="Add transaction"
        onClick={onAddTransaction}
      >
        <DockIcon name="add" />
        <span className="v3-dock__label">Add</span>
      </button>
      {destinations.slice(2).map(renderLink)}
    </nav>
  )
}
