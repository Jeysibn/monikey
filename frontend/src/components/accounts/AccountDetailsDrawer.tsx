import { useState } from 'react'

import { AccountDetailsContent } from '@/components/accounts/AccountDetailsContent'
import { Dialog } from '@/components/ui/dialog'
import { MONIKEY_DEFAULT_ARTWORK_PATH } from '@/wallet/artworkCatalog'
import type { WalletCardVM } from '@/wallet/walletModel'

/*
 * The account details panel opened from the Accounts LIST (the card gallery opens the same panel from the card
 * itself). It is controlled by the parent, which says which account, and shows the same artwork fallbacks as a card.
 */
export function AccountDetailsDrawer({
  item,
  onClose,
  onClosed,
}: {
  item: WalletCardVM | null // null while closed
  onClose: () => void
  onClosed?: (event: Event) => void
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item && <DrawerBody key={item.accountId} item={item} onClose={onClose} onClosed={onClosed} />}
    </Dialog>
  )
}

function DrawerBody({ item, onClose, onClosed }: { item: WalletCardVM; onClose: () => void; onClosed?: (event: Event) => void }) {
  const [imageSrc, setImageSrc] = useState<string | null>(item.artUrl)
  const imageFailed = () => setImageSrc((current) => (current !== MONIKEY_DEFAULT_ARTWORK_PATH ? MONIKEY_DEFAULT_ARTWORK_PATH : null))
  return <AccountDetailsContent item={item} imageSrc={imageSrc} onImageError={imageFailed} onClose={onClose} onClosed={onClosed} />
}
