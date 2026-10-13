import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { V3Dock } from '../components/V3Dock'
import { setV3PreviewEnabled, V3_ROUTES } from './v3Preview'
import '../styles/v3-tokens.css'
import '../styles/v3-primitives.css'
import './V3Shell.css'

/**
 * Responsive V3 application shell (opt-in preview only).
 *
 * Structure only: header utilities, a content region, and the floating dock.
 * Legacy routes, Sync Center, Settings and authentication stay reachable from
 * the header utilities. The shell reserves `--v3-dock-clearance` at the bottom
 * so the fixed dock never covers content.
 */
export function V3Shell({ children, onAddTransaction }: { children: ReactNode; onAddTransaction: () => void }) {
  useEffect(() => {
    document.documentElement.classList.add('v3-active')
    return () => document.documentElement.classList.remove('v3-active')
  }, [])
  return (
    <div className="v3-root v3-shell">
      <a className="v3-shell__skip v3-btn v3-btn--primary" href="#v3-main">Skip to main content</a>
      <header className="v3-shell__header">
        <Link to={V3_ROUTES.overview} className="v3-shell__brand">MoniKey <span className="v3-shell__preview-tag">V3 preview</span></Link>
        <nav className="v3-shell__utilities" aria-label="Utilities">
          <Link className="v3-btn v3-btn--ghost" to="/sync">Sync Center</Link>
          <Link className="v3-btn v3-btn--ghost" to="/settings">Settings</Link>
          <Link className="v3-btn v3-btn--ghost" to="/security">Security</Link>
          <Link className="v3-btn v3-btn--secondary" to="/" onClick={() => setV3PreviewEnabled(false)}>Exit preview</Link>
        </nav>
      </header>
      <main id="v3-main" className="v3-shell__main" tabIndex={-1}>{children}</main>
      <V3Dock routes={V3_ROUTES} onAddTransaction={onAddTransaction} />
    </div>
  )
}

/**
 * Three-region financial workspace. DOM order is accounts, position, activity
 * so single-column mobile reading order puts account cards first. CSS turns
 * this into two columns (tablet) and three columns (wide desktop).
 */
export function V3Workspace({ accounts, position, activity }: { accounts: ReactNode; position: ReactNode; activity: ReactNode }) {
  return (
    <div className="v3-workspace" data-testid="v3-workspace">
      <section className="v3-workspace__accounts" aria-labelledby="v3-ws-accounts"><h2 id="v3-ws-accounts" className="v3-h2">Accounts</h2>{accounts}</section>
      <section className="v3-workspace__position" aria-labelledby="v3-ws-position"><h2 id="v3-ws-position" className="v3-h2">Financial position</h2>{position}</section>
      <section className="v3-workspace__activity" aria-labelledby="v3-ws-activity"><h2 id="v3-ws-activity" className="v3-h2">Recent activity</h2>{activity}</section>
    </div>
  )
}
