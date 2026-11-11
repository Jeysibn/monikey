import { List, WalletCards } from 'lucide-react'

export type WalletViewMode = 'cards' | 'list'

export function WalletViewToggle({
  value,
  onChange,
  className = 'mb-4 flex justify-end gap-2',
}: {
  value: WalletViewMode
  onChange: (mode: WalletViewMode) => void
  className?: string
}) {
  return (
    <div role="group" aria-label="Account display" className={className}>
      <button
        type="button"
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
        className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${value === 'cards' ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border bg-card text-muted-foreground hover:bg-secondary'}`}
      >
        <WalletCards aria-hidden="true" className="size-4" />
        Cards
      </button>
      <button
        type="button"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${value === 'list' ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border bg-card text-muted-foreground hover:bg-secondary'}`}
      >
        <List aria-hidden="true" className="size-4" />
        List
      </button>
    </div>
  )
}
