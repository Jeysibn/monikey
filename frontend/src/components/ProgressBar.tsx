import './ProgressBar.css'

export function ProgressBar({
  pct,
  color = 'var(--cyan)',
  label,
  valueText,
}: {
  pct: number
  color?: string
  /** Accessible name for the progress bar (required for screen-reader users to know what it measures). */
  label?: string
  /** Accessible value text, e.g. "122% used, ₱260 over budget" — falls back to a clamped percentage. */
  valueText?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={valueText ?? `${clamped}%`}
    >
      <div className="progress-fill" style={{ width: `${clamped}%`, background: color }} />
    </div>
  )
}
