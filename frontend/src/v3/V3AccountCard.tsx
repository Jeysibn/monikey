export type V3AccountKind = 'bank' | 'ewallet' | 'cash' | 'credit'

const KIND_LABEL: Record<V3AccountKind, string> = { bank: 'Bank', ewallet: 'E-wallet', cash: 'Cash', credit: 'Credit card' }

interface Props {
  kind: V3AccountKind
  name: string
  figure: string
  meta?: string
  /** 0-3: colour variant so several accounts of one kind are distinguishable. */
  tone?: number
  /** When set the card is a real button (expand/collapse). Otherwise it is a static article. */
  onSelect?: () => void
  expanded?: boolean
  controls?: string
  label?: string
}

/** Presentational account card. Callers pass already-formatted text; it never reads the ledger. */
export function V3AccountCard({ kind, name, figure, meta, tone = 0, onSelect, expanded, controls, label }: Props) {
  const className = `v3-account-card v3-account-card--${kind} v3-account-card--tone-${tone % 4}${onSelect ? ' v3-account-card--button' : ''}`
  const content = (
    <>
      <span className="v3-account-card__top">
        <span>{name}</span>
        {kind === 'credit' || kind === 'bank' ? <span className="v3-account-card__chip" aria-hidden="true" /> : <span className="v3-account-card__kind">{KIND_LABEL[kind]}</span>}
      </span>
      <span className="v3-account-card__body">
        <span className="v3-account-card__figure">{figure}</span>
        {meta && <span className="v3-account-card__meta">{meta}</span>}
      </span>
    </>
  )
  if (onSelect) {
    return <button type="button" className={className} aria-expanded={expanded} aria-controls={controls} aria-label={label ?? `${name}, ${KIND_LABEL[kind]}`} onClick={onSelect}>{content}</button>
  }
  return <article className={className} aria-label={`${name}, ${KIND_LABEL[kind]}`}>{content}</article>
}
