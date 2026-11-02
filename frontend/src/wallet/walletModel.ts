import { MONIKEY_DEFAULT_ARTWORK_PATH, resolveWalletArtwork } from './artworkCatalog.ts'
import { cardProductImage, findCardProduct, findLegacyCardProduct } from './cardProducts.ts'
import { savedWalletArtworkId, savedWalletProductId, type WalletPreferencesV1 } from './walletPreferences.ts'
import type { AccountType, AccountsSnapshot } from '../types.ts'
import { formatPeso } from '../lib/money.ts'

export type WalletAmountLabel = 'Balance' | 'Owed' | 'Card credit' | 'Nothing owed'

/** Read-only presentation data. The amounts are copied directly from the server snapshot. */
export interface WalletCardVM {
  accountId: number
  accountName: string
  accountType: AccountType
  artworkId: string
  artUrl: string
  /** The card picked for the account, such as "BDO Visa Classic"; null for none (the MoniKey card). */
  productLabel: string | null
  /** Text colour on the card face: set per design; ink on the light MoniKey card. */
  faceInk: 'light' | 'dark'
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
  const savedArtworkId = savedWalletArtworkId(preferences, account.id)
  const product = findCardProduct(savedWalletProductId(preferences, account.id), account.type)
    ?? findLegacyCardProduct(savedArtworkId, account.type)
  // Without a card, an approved issuer artwork (ADR-019) or the neutral MoniKey card.
  const artwork = product ? null : resolveWalletArtwork(savedArtworkId, account.type)

  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    artworkId: product ? product.id : artwork!.id,
    artUrl: product ? cardProductImage(product) : artwork!.localAssetPath ?? MONIKEY_DEFAULT_ARTWORK_PATH,
    productLabel: product?.name ?? null,
    faceInk: product ? product.faceInk : 'dark',
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

/** A credit card's share of its limit in use, for the line on its face; null for other account types. */
export function usedShare(item: WalletCardVM): { percent: number; text: string } | null {
  const limit = item.creditLimitCentavos
  if (item.accountType !== 'credit_card' || limit === null || limit <= 0) return null
  const owed = item.primaryLabel === 'Owed' ? item.primaryAmountCentavos : 0
  const raw = (owed * 100) / limit // multiply first: (owed / limit) * 100 turns an exact 28.5 into 28.4999…
  return {
    percent: Math.max(0, Math.min(100, raw)),
    text: owed > 0 && raw < 1 ? 'Under 1% used' : `${Math.round(raw)}% used`,
  }
}

/** What the card face shows bottom-left: its label, figure and the small line under it. */
export function faceFigure(item: WalletCardVM): { label: string; centavos: number; note: string | null } {
  if (item.accountType !== 'credit_card') {
    return { label: 'Balance', centavos: item.primaryAmountCentavos, note: item.primaryAmountCentavos < 0 ? 'Below zero' : null }
  }
  const available = item.availableCreditCentavos ?? 0
  const used = usedShare(item)?.text ?? null
  if (available < 0) return { label: 'Over limit by', centavos: -available, note: used }
  const credit = item.primaryLabel === 'Card credit' ? `${formatPeso(item.primaryAmountCentavos)} card credit` : null
  return { label: 'Available credit', centavos: available, note: [used, credit].filter(Boolean).join(' · ') || null }
}
