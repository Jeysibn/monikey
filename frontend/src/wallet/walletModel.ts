import { MONIKEY_DEFAULT_ARTWORK_PATH, resolveWalletArtwork } from './artworkCatalog.ts'
import type { AccountType, AccountsSnapshot } from '../types.ts'

export type WalletAmountLabel = 'Balance' | 'Owed' | 'Card credit' | 'Nothing owed'

/** Read-only presentation data. The amounts are copied directly from the server snapshot. */
export interface WalletCardVM {
  accountId: number
  accountName: string
  accountType: AccountType
  artworkId: string
  artUrl: string
  primaryAmountCentavos: number
  primaryLabel: WalletAmountLabel
  availableCreditCentavos: number | null
  creditLimitCentavos: number | null
}

export interface WalletGalleryModel {
  liquid: WalletCardVM[]
  cards: WalletCardVM[]
}

function walletCard(
  account: { id: number; name: string; type: AccountType },
  primaryAmountCentavos: number,
  primaryLabel: WalletAmountLabel,
  availableCreditCentavos: number | null = null,
  creditLimitCentavos: number | null = null,
): WalletCardVM {
  const artwork = resolveWalletArtwork(null, account.type)

  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    artworkId: artwork.id,
    artUrl: artwork.localAssetPath ?? MONIKEY_DEFAULT_ARTWORK_PATH,
    primaryAmountCentavos,
    primaryLabel,
    availableCreditCentavos,
    creditLimitCentavos,
  }
}

/** Project existing account figures without aggregating, clamping, or recalculating money. */
export function buildWalletGalleryModel(snapshot: AccountsSnapshot): WalletGalleryModel {
  return {
    liquid: snapshot.liquid.map(({ account, balance }) => walletCard(account, balance, 'Balance')),
    cards: snapshot.cards.map((card) => {
      if (card.credit > 0) {
        return walletCard(card.account, card.credit, 'Card credit', card.availableCredit, card.creditLimit)
      }
      if (card.owed > 0) {
        return walletCard(card.account, card.owed, 'Owed', card.availableCredit, card.creditLimit)
      }
      return walletCard(card.account, 0, 'Nothing owed', card.availableCredit, card.creditLimit)
    }),
  }
}
