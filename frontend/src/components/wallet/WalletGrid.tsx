import { WalletCard } from './WalletCard'
import type { WalletCardVM } from '@/wallet/walletModel'

export function WalletGrid({
  items,
  selectedAccountId,
  onSelect,
  onEdit,
  onPayCard,
}: {
  items: readonly WalletCardVM[]
  selectedAccountId: number | null
  onSelect: (accountId: number) => void
  onEdit: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
}) {
  return (
    <ul className="grid min-w-0 grid-cols-1 gap-3 min-[30rem]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <WalletCard
          key={`${item.accountId}:${item.artUrl}`}
          item={item}
          selected={selectedAccountId === item.accountId}
          onSelect={onSelect}
          onEdit={onEdit}
          onPayCard={onPayCard}
          variant="accounts"
        />
      ))}
    </ul>
  )
}
