import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useFinance } from '../hooks/useFinance'
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

/**
 * A disclosure (button + panel), not an ARIA `menu` — the panel holds
 * ordinary links, and this component doesn't implement full menu keyboard
 * behavior (arrow-key roving focus), so `role="menu"`/`"menuitem"` would be
 * a false accessibility promise. Escape and outside-click close it and
 * return focus to the toggle button; opening moves focus to the first item.
 */
function useDisclosure() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>('a, button')
    firstFocusable?.focus()

    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, rootRef, buttonRef, panelRef }
}

function MoreMenu() {
  const { open, setOpen, rootRef, buttonRef, panelRef } = useDisclosure()
  const panelId = useId()

  return (
    <div className="more-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="pill pill--more"
        aria-expanded={open}
        aria-controls={panelId}
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
        <div id={panelId} ref={panelRef} className="more-dropdown">
          {MORE_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className="more-item" onClick={() => setOpen(false)}>
              <span className="more-item-label">{item.label}</span>
              <span className="more-item-sub">{item.sub}</span>
            </NavLink>
          ))}
          <div className="more-sep" role="separator" />
          <NavLink to="/settings" className="more-item" onClick={() => setOpen(false)}>
            <span className="more-item-label">Settings</span>
          </NavLink>
        </div>
      )}
    </div>
  )
}

function NotificationBell() {
  const { attentionItems } = useFinance().state
  const { open, setOpen, rootRef, buttonRef, panelRef } = useDisclosure()
  const panelId = useId()

  return (
    <div className="notif-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn notif-bell"
        aria-expanded={open}
        aria-controls={panelId}
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
        <div id={panelId} ref={panelRef} className="notif-dropdown">
          <div className="notif-head">Attention Needed</div>
          {attentionItems.length === 0 ? (
            <p className="notif-item faint">Nothing needs your attention right now.</p>
          ) : (
            <ul className="notif-list">
              {attentionItems.map((item) => (
                <li key={item.id} className="notif-item">
                  <span className={`notif-dot notif-dot--${item.severity}`} aria-hidden="true" />
                  <span>{item.title}</span>
                </li>
              ))}
            </ul>
          )}
          <NavLink to="/transactions" className="notif-see-all" onClick={() => setOpen(false)}>
            See all →
          </NavLink>
        </div>
      )}
    </div>
  )
}

/** Shown only under the mobile breakpoint (CSS-hidden on desktop) — a single compact menu replacing the wrapping desktop nav row. */
function MobileNav() {
  const { open, setOpen, rootRef, buttonRef, panelRef } = useDisclosure()
  const panelId = useId()

  return (
    <div className="mobile-nav" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn mobile-nav-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <nav id={panelId} ref={panelRef} className="mobile-nav-panel" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mobile-nav-item${isActive ? ' mobile-nav-item--active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="more-sep" role="separator" />
          {MORE_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className="mobile-nav-item" onClick={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/settings" className="mobile-nav-item" onClick={() => setOpen(false)}>
            Settings
          </NavLink>
        </nav>
      )}
    </div>
  )
}

export function AppShell({ children, onAddTransaction }: { children: ReactNode; onAddTransaction?: () => void }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <MobileNav />
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
              <span className="add-tx-label">Add Transaction</span>
            </button>
          )}
        </div>
      </header>
      <main className="page-main">{children}</main>
    </div>
  )
}
