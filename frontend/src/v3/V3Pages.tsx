import { Link } from 'react-router-dom'
import { V3AccountCard } from './V3AccountCard'
import { V3Workspace } from './V3Shell'

/*
 * Structural destinations for the V3 preview. These are intentionally NOT the
 * redesigned pages: they define layout regions and link to the existing
 * workflows. No ledger data is read here, so nothing is shown that could be
 * mistaken for a user's real figures.
 */

function PageHead({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="v3-page-head">
      <h1 className="v3-h1">{title}</h1>
      <p className="v3-secondary">{summary}</p>
    </div>
  )
}

function Placeholder({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div className="v3-card">
      <p className="v3-secondary">{label}</p>
      <div className="v3-stack" aria-hidden="true" style={{ marginTop: 'var(--v3-space-3)' }}>
        {Array.from({ length: rows }, (_, i) => <div key={i} className="v3-skeleton" />)}
      </div>
    </div>
  )
}

export function V3Overview() {
  return (
    <>
      <PageHead title="Overview" summary="Layout preview. Live account cards, position and activity arrive in the Overview milestone." />
      <V3Workspace
        accounts={<Placeholder label="Favorite account cards (bank, e-wallet, cash, credit card) will appear here first." rows={3} />}
        position={<Placeholder label="Cash, credit liability, net position and monthly budget preview." rows={2} />}
        activity={<Placeholder label="Recent transactions." rows={3} />}
      />
    </>
  )
}

function ClassicLinks({ links }: { links: { to: string; label: string }[] }) {
  return (
    <div className="v3-page-actions">
      {links.map((link) => <Link key={link.to} className="v3-btn v3-btn--secondary" to={link.to}>{link.label}</Link>)}
    </div>
  )
}

export function V3Activity() {
  return (
    <>
      <PageHead title="Activity" summary="Compact chronological list on mobile, sortable table on desktop (coming in the Activity milestone)." />
      <Placeholder label="Transaction list region." rows={4} />
      <ClassicLinks links={[{ to: '/transactions', label: 'Open classic Transactions' }, { to: '/imports', label: 'Imports' }, { to: '/reconciliation', label: 'Reconciliation' }]} />
    </>
  )
}

export function V3Accounts() {
  return (
    <>
      <PageHead title="Accounts" summary="Account cards with inline recent activity (coming in the Accounts milestone)." />
      <Placeholder label="Account cards region." rows={3} />
      <ClassicLinks links={[{ to: '/accounts', label: 'Open classic Accounts' }, { to: '/crypto', label: 'Crypto' }, { to: '/goals', label: 'Goals' }]} />
    </>
  )
}

export function V3Planning() {
  return (
    <>
      <PageHead title="Planning" summary="Monthly category budgets first, then confirmed recurring bills (coming in the Planning milestone)." />
      <Placeholder label="Budgets region." rows={3} />
      <Placeholder label="Recurring bills region." rows={2} />
      <ClassicLinks links={[{ to: '/budget', label: 'Open classic Budget' }, { to: '/recurring', label: 'Recurring & Bills' }, { to: '/reports', label: 'Reports' }]} />
    </>
  )
}

/** Design-system specimen. All values are labelled samples, never user data. */
export function V3DesignSpecimen() {
  return (
    <>
      <PageHead title="Design system" summary="Specimen of V3 tokens and primitives. Sample values only, not your data." />
      <div className="v3-stack">
        <div className="v3-specimen-grid" aria-label="Account card specimens">
          <V3AccountCard kind="bank" name="Sample bank" figure="₱ 12,345.67" meta="Specimen" />
          <V3AccountCard kind="ewallet" name="Sample e-wallet" figure="₱ 1,250.00" meta="Specimen" />
          <V3AccountCard kind="cash" name="Sample cash" figure="₱ 800.00" meta="Specimen" />
          <V3AccountCard kind="credit" name="Sample card" figure="₱ 4,300.00" meta="Owed · specimen" />
        </div>
        <section className="v3-card" aria-labelledby="v3-spec-controls">
          <h2 id="v3-spec-controls" className="v3-h2">Controls</h2>
          <div className="v3-page-actions">
            <button type="button" className="v3-btn v3-btn--primary">Primary</button>
            <button type="button" className="v3-btn v3-btn--secondary">Secondary</button>
            <button type="button" className="v3-btn v3-btn--ghost">Ghost</button>
            <button type="button" className="v3-btn v3-btn--primary" disabled>Disabled</button>
          </div>
          <div className="v3-field" style={{ marginTop: 'var(--v3-space-4)', maxWidth: 320 }}>
            <label className="v3-label" htmlFor="v3-spec-input">Amount</label>
            <input id="v3-spec-input" className="v3-input" inputMode="decimal" placeholder="0.00" />
          </div>
        </section>
        <section className="v3-card" aria-labelledby="v3-spec-type">
          <h2 id="v3-spec-type" className="v3-h2">Figures and type</h2>
          <p className="v3-figure v3-figure--lg">₱ 98,765.43</p>
          <p className="v3-figure v3-figure--md v3-figure--positive">+ ₱ 1,200.00</p>
          <p className="v3-figure v3-figure--md v3-figure--negative">− ₱ 450.00</p>
          <p className="v3-secondary">Secondary text, 14px, 7.4:1 contrast.</p>
          <p className="v3-caption">Caption, 12px.</p>
        </section>
      </div>
    </>
  )
}
