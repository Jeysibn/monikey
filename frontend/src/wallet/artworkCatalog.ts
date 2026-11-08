import type { AccountType } from '../types.ts'
import { CARD_PRODUCTS } from './cardProducts.ts'
import { APPROVED_ISSUER_ARTWORK } from './approvedArtwork.generated.ts'

export type ArtworkStatus = 'candidate' | 'verified' | 'approved' | 'rejected' | 'retired' | 'owner-authorized'
export type WalletArtworkKind = 'physical' | 'virtual' | 'brand' | 'fallback'

export interface WalletArtwork {
  readonly id: string
  readonly issuer: string
  readonly product: string
  readonly variant: string
  readonly accountTypes: readonly AccountType[]
  readonly kind: WalletArtworkKind
  /** Official product page only; never use this value as an image URL. */
  readonly sourcePageUrl: string | null
  /** Root-relative path under /card-art/, and only for locally bundled assets. */
  readonly localAssetPath: string | null
  readonly status: ArtworkStatus
  readonly verifiedOn: string | null
  /** A repository reference or plain-language rights note, never a secret. */
  readonly permissionEvidence: string | null
}

export const MONIKEY_DEFAULT_ARTWORK_ID = 'monikey-default'
export const MONIKEY_DEFAULT_ARTWORK_PATH = '/card-art/monikey-default.svg'

/** First-party abstract designs: visual variants, never issuer/network logos. */
export function originalCardArtworkId(productId: string): string {
  return `monikey-${productId}`
}

const MONIKEY_ORIGINAL_CARD_ARTWORK: readonly WalletArtwork[] = CARD_PRODUCTS.map((product) => ({
  id: originalCardArtworkId(product.id),
  issuer: 'MoniKey',
  product: product.name,
  variant: 'Original MoniKey abstract concept',
  accountTypes: [product.accountType],
  kind: 'brand',
  sourcePageUrl: null,
  localAssetPath: `/card-art/monikey-${product.id}.svg`,
  status: 'approved',
  verifiedOn: null,
  permissionEvidence: 'Original abstract artwork authored for MoniKey; no issuer or network marks.',
}))


// User-curated historical illustrated cards; NOT official issuer-licensed artwork.
// Only the exact supported product mapping and metadata below can be selected.
const RECOVERED_FACE_INK: Readonly<Record<string,'light'|'dark'>> = {
  'bdo-debit-mastercard': 'light',
  'bpi-debit-mastercard': 'light',
  'bpi-debit-cirrus-gold': 'dark',
  'bpi-debit-cirrus-red': 'light',
  'gotyme-visa-debit': 'light',
  'maribank-debit': 'light',
  'gcash-visa': 'light',
  'gcash-mastercard': 'light',
  'maya-visa': 'light',
  'maya-mastercard': 'light',
  'maya-virtual': 'dark',
  'bdo-visa-classic': 'light',
  'bdo-visa-gold': 'dark',
  'bdo-visa-platinum': 'dark',
  'bdo-visa-signature': 'light',
  'bpi-platinum-rewards': 'light',
  'unionbank-rewards-visa-platinum': 'light',
  'maya-visa-platinum': 'light',
}
export function recoveredCardArtworkId(productId: string): string { return `recovered-${productId}` }
export function recoveredCardFaceInk(productId: string): 'light'|'dark' { return RECOVERED_FACE_INK[productId] ?? 'dark' }
export function recoveredCardArtworkPath(productId: string): string {
  return productId === 'maya-visa-platinum' ? '/card-art/recovered-maya-visa-platinum.svg' : `/card-art/recovered-${productId}.webp`
}
const OWNER_CURATED_CARD_ARTWORK: readonly WalletArtwork[] = CARD_PRODUCTS.map(product => ({
  id: recoveredCardArtworkId(product.id),
  issuer: 'MoniKey',
  product: product.name,
  variant: 'Owner-curated AI-generated illustration (unofficial)',
  accountTypes: [product.accountType],
  kind: 'brand',
  sourcePageUrl: null,
  localAssetPath: recoveredCardArtworkPath(product.id),
  status: 'owner-authorized',
  verifiedOn: null,
  permissionEvidence: 'Explicit owner request to display historical AI-generated illustration; third-party marks not issuer-approved.',
}))

const ALL_ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'credit_card'] as const satisfies readonly AccountType[]

const MONIKEY_DEFAULT_ARTWORK: WalletArtwork = {
  id: MONIKEY_DEFAULT_ARTWORK_ID,
  issuer: 'MoniKey',
  product: 'MoniKey default',
  variant: 'Neutral original artwork',
  accountTypes: ALL_ACCOUNT_TYPES,
  kind: 'fallback',
  sourcePageUrl: null,
  localAssetPath: MONIKEY_DEFAULT_ARTWORK_PATH,
  status: 'approved',
  verifiedOn: null,
  permissionEvidence: 'Original MoniKey artwork authored in this repository.',
}

/**
 * This metadata is a research candidate only. Its source page and exact design
 * have not been verified, and it has no local image or redistribution approval.
 */
const CANDIDATE_ARTWORK: WalletArtwork = {
  id: 'example-bdo-visa-classic',
  issuer: 'BDO',
  product: 'Visa Classic',
  variant: 'Exact edition not verified',
  accountTypes: ['credit_card'],
  kind: 'physical',
  sourcePageUrl: 'https://www.bdo.com.ph/personal/cards/credit-cards',
  localAssetPath: null,
  status: 'candidate',
  verifiedOn: null,
  permissionEvidence: null,
}

/** Static metadata catalog. Candidate entries never make external image requests. */
export const WALLET_ARTWORK_CATALOG: readonly WalletArtwork[] = [
  MONIKEY_DEFAULT_ARTWORK,
  ...MONIKEY_ORIGINAL_CARD_ARTWORK,
  ...OWNER_CURATED_CARD_ARTWORK,
  ...APPROVED_ISSUER_ARTWORK,
  CANDIDATE_ARTWORK,
]

const LOCAL_ARTWORK_PATH = /^\/card-art\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?\.(?:svg|png|jpe?g|webp)$/
const VERIFIED_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealVerificationDate(value: string): boolean {
  if (!VERIFIED_DATE.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12) return false

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]!
}

function isHttpsSourcePage(value: string | null): boolean {
  if (!value) return false
  try { return new URL(value).protocol === 'https:' && Boolean(new URL(value).hostname) }
  catch { return false }
}

function hasRedistributionEvidence(value: string | null): boolean {
  return Boolean(value?.trim().length
    && /redistribut|public distribution|application bundle/i.test(value)
    && /https:\/\/\S+|(?:^|\s)(?:docs|licenses|assets?)\/[\w./-]+/i.test(value))
}

/** Accept only simple, root-relative asset paths in the local artwork directory. */
export function isLocalWalletArtworkPath(path: string | null): path is string {
  return path !== null && LOCAL_ARTWORK_PATH.test(path)
}

/** An artwork is displayable only after rights approval, with a safe local file and a matching type. */
export function isSelectableWalletArtwork(
  artwork: WalletArtwork,
  accountType: AccountType,
): boolean {
  const canonicalFallback = artwork.kind === 'fallback'
    && artwork.id === MONIKEY_DEFAULT_ARTWORK_ID
    && artwork.issuer === 'MoniKey'
    && artwork.localAssetPath === MONIKEY_DEFAULT_ARTWORK_PATH
  const originalFallback = canonicalFallback
    && artwork.permissionEvidence?.trim().length
  const originalCard = MONIKEY_ORIGINAL_CARD_ARTWORK.find((item) => item.id === artwork.id)
  const originalConcept = originalCard !== undefined
    && artwork.issuer === 'MoniKey'
    && artwork.kind === 'brand'
    && artwork.product === originalCard.product
    && artwork.variant === originalCard.variant
    && artwork.localAssetPath === originalCard.localAssetPath
    && artwork.sourcePageUrl === null
    && artwork.verifiedOn === null
    && artwork.permissionEvidence === originalCard.permissionEvidence
    && artwork.accountTypes.length === 1
    && artwork.accountTypes[0] === originalCard.accountTypes[0]
  const recovered = OWNER_CURATED_CARD_ARTWORK.find(item => item.id === artwork.id)
  const ownerConcept = recovered !== undefined
    && artwork.issuer === recovered.issuer
    && artwork.product === recovered.product
    && artwork.variant === recovered.variant
    && artwork.kind === recovered.kind
    && artwork.localAssetPath === recovered.localAssetPath
    && artwork.sourcePageUrl === null
    && artwork.verifiedOn === null
    && artwork.permissionEvidence === recovered.permissionEvidence
    && artwork.accountTypes.length === 1
    && artwork.accountTypes[0] === recovered.accountTypes[0]
  const issuerApprovalEvidence = artwork.kind !== 'fallback'
    && isHttpsSourcePage(artwork.sourcePageUrl)
    && artwork.verifiedOn !== null
    && isRealVerificationDate(artwork.verifiedOn)
    && hasRedistributionEvidence(artwork.permissionEvidence)

  return (artwork.status === 'approved' || (artwork.status === 'owner-authorized' && ownerConcept))
    && isLocalWalletArtworkPath(artwork.localAssetPath)
    && artwork.accountTypes.includes(accountType)
    && Boolean(originalFallback || originalConcept || issuerApprovalEvidence || (artwork.status === 'owner-authorized' && ownerConcept))
}

/** Return only approved local artwork compatible with the account's ledger type. */
export function getSelectableWalletArtworks(accountType: AccountType): readonly WalletArtwork[] {
  return WALLET_ARTWORK_CATALOG.filter((artwork) => isSelectableWalletArtwork(artwork, accountType))
}

/** Resolve stale, unknown, retired, unapproved, or type-mismatched IDs to the neutral fallback. */
export function resolveWalletArtwork(
  artworkId: string | null | undefined,
  accountType: AccountType,
): WalletArtwork {
  const artwork = WALLET_ARTWORK_CATALOG.find((entry) => entry.id === artworkId)
  return artwork && isSelectableWalletArtwork(artwork, accountType)
    ? artwork
    : MONIKEY_DEFAULT_ARTWORK
}
