import { MONIKEY_DEFAULT_ARTWORK_PATH, resolveWalletArtwork } from './artworkCatalog.ts'
import { resolveWalletArtworkConcept } from './walletArtworkConcepts.ts'
import { savedWalletArtworkId, type WalletPreferencesV1 } from './walletPreferences.ts'
import type { AccountType, AccountsSnapshot } from '../types.ts'

export type WalletAmountLabel = 'Balance' | 'Owed' | 'Card credit' | 'Nothing owed'

/** Read-only presentation data. The amounts are copied directly from the server snapshot. */
export interface WalletCardVM {
  accountId: number
  accountName: string
  accountType: AccountType
  artworkId: string
  artUrl: string
  isArtworkConcept: boolean
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
  preferences: WalletPreferencesV1,
  primaryAmountCentavos: number,
  primaryLabel: WalletAmountLabel,
  availableCreditCentavos: number | null = null,
  creditLimitCentavos: number | null = null,
): WalletCardVM {
  const artworkId = savedWalletArtworkId(preferences, account.id)
  const concept = resolveWalletArtworkConcept(artworkId, account.type)
  const artwork = concept ? null : resolveWalletArtwork(artworkId, account.type)

  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    artworkId: concept?.id ?? artwork!.id,
    artUrl: concept?.localAssetPath ?? artwork!.localAssetPath ?? MONIKEY_DEFAULT_ARTWORK_PATH,
    isArtworkConcept: concept !== null,
    primaryAmountCentavos,
    primaryLabel,
    availableCreditCentavos,
    creditLimitCentavos,
  }
}

/** Project existing account figures without aggregating, clamping, or recalculating money. */
export function buildWalletGalleryModel(
  snapshot: AccountsSnapshot,
  preferences: WalletPreferencesV1 = { version: 1, byAccountId: {} },
): WalletGalleryModel {
  return {
    liquid: snapshot.liquid.map(({ account, balance }) => walletCard(account, preferences, balance, 'Balance')),
    cards: snapshot.cards.map((card) => {
      if (card.credit > 0) {
        return walletCard(card.account, preferences, card.credit, 'Card credit', card.availableCredit, card.creditLimit)
      }
      if (card.owed > 0) {
        return walletCard(card.account, preferences, card.owed, 'Owed', card.availableCredit, card.creditLimit)
      }
      return walletCard(card.account, preferences, 0, 'Nothing owed', card.availableCredit, card.creditLimit)
    }),
  }
}
