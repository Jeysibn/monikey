import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { attentionItems } from '../data/mockData'
import './AppShell.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/budget', label: 'Budget' },
  { to: '/goals', label: 'Goals' },
]

const MORE_ITEMS = [
  { to: '/investments', label: 'Investments', sub: 'Portfolio & holdings' },
  { to: '/recurring', label: 'Recurring & Bills', sub: 'Subscriptions & due dates' },
  { to: '/reports', label: 'Reports', sub: 'Trends over time' },
]

function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M4 18 C4 10, 9 5, 16 5 C21 5, 23 9, 21 12 C19 15, 14 13, 15 9"
        stroke="var(--cyan)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="19.5" cy="7.5" r="1.6" fill="var(--cyan)" />
    </svg>
  )
}

function MoreMenu() {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="more-menu" ref={ref}>
      <button
        type="button"
        className="pill pill--more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        More
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" className="more-dropdown">
          {MORE_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} role="menuitem" className="more-item" onClick={() => setOpen(false)}>
              <span className="more-item-label">{item.label}</span>
              <span className="more-item-sub">{item.sub}</span>
            </NavLink>
          ))}
          <div className="more-sep" role="separator" />
          <NavLink to="/settings" role="menuitem" className="more-item" onClick={() => setOpen(false)}>
            <span className="more-item-label">Settings</span>
          </NavLink>
        </div>
      )}
    </div>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="notif-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn notif-bell"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Notifications, ${attentionItems.length} need attention`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {attentionItems.length > 0 && <span className="notif-badge">{attentionItems.length}</span>}
      </button>
      {open && (
        <div id={menuId} role="menu" className="notif-dropdown">
          <div className="notif-head">
            <span>Attention Needed</span>
          </div>
          {attentionItems.map((item) => (
            <div key={item.id} role="menuitem" className="notif-item">
              <span className={`notif-dot notif-dot--${item.severity}`} aria-hidden="true" />
              <span>{item.title}</span>
            </div>
          ))}
          <NavLink to="/transactions" role="menuitem" className="notif-see-all" onClick={() => setOpen(false)}>
            See all →
          </NavLink>
        </div>
      )}
    </div>
  )
}

export function AppShell({ children, onAddTransaction }: { children: ReactNode; onAddTransaction?: () => void }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          Monikey
        </div>
        <nav className="nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `pill${isActive ? ' pill--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
          <MoreMenu />
        </nav>
        <div className="topbar-right">
          <NotificationBell />
          {onAddTransaction && (
            <button type="button" className="btn btn--primary btn--compact" onClick={onAddTransaction}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Add Transaction
            </button>
          )}
        </div>
      </header>
      <main className="page-main">{children}</main>
    </div>
  )
}
