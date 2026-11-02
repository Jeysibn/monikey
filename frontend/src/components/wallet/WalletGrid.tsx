import { WalletCard } from './WalletCard'
import type { WalletCardVM } from '@/wallet/walletModel'

export function WalletGrid({
  items,
  onEdit,
  onPayCard,
}: {
  items: readonly WalletCardVM[]
  onEdit: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
}) {
  // As many columns as fit with each card at least 19rem (304px) wide, so the face never gets cramped.
  return (
    <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
      {items.map((item) => (
        <WalletCard
          key={`${item.accountId}:${item.artUrl}`}
          item={item}
          onEdit={onEdit}
          onPayCard={onPayCard}
        />
      ))}
    </ul>
  )
}
