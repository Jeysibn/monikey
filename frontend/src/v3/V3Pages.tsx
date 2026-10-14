import { V3AccountCard } from './V3AccountCard'

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
