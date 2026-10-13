export type V3AccountKind = 'bank' | 'ewallet' | 'cash' | 'credit'

const KIND_LABEL: Record<V3AccountKind, string> = { bank: 'Bank', ewallet: 'E-wallet', cash: 'Cash', credit: 'Credit card' }

/** Presentational account card. Callers pass already-formatted text; it never reads the ledger. */
export function V3AccountCard({ kind, name, figure, meta }: { kind: V3AccountKind; name: string; figure: string; meta?: string }) {
  return (
    <article className={`v3-account-card v3-account-card--${kind}`} aria-label={`${name}, ${KIND_LABEL[kind]}`}>
      <div className="v3-account-card__top">
        <span>{name}</span>
        {kind === 'credit' || kind === 'bank' ? <span className="v3-account-card__chip" aria-hidden="true" /> : <span className="v3-account-card__kind">{KIND_LABEL[kind]}</span>}
      </div>
      <div>
        <div className="v3-account-card__figure">{figure}</div>
        {meta && <div className="v3-account-card__meta">{meta}</div>}
      </div>
    </article>
  )
}
