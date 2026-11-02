import type { AccountType } from '../types.ts'

/** Generated local previews are kept separate from the approved issuer artwork catalog. */
export interface WalletArtworkConcept {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly accountTypes: readonly AccountType[]
  readonly localAssetPath: string
}

export const MARIBANK_CONCEPT_ARTWORK_ID = 'concept-maribank-generated'
export const MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID = 'concept-maya-visa-platinum-generated'
export const UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID = 'concept-unionbank-rewards-visa-platinum-generated'
export const ATOME_BLACK_CREDIT_CONCEPT_ID = 'concept-atome-credit-card-black-generated'
export const BDO_VISA_CONCEPT_ID = 'concept-bdo-visa-generated'
export const GOTYME_VISA_CONCEPT_ID = 'concept-gotyme-visa-generated'
export const GCASH_VISA_DEBIT_CONCEPT_ID = 'concept-gcash-visa-debit-generated'
export const BDO_DEBIT_MASTERCARD_CONCEPT_ID = 'concept-bdo-debit-mastercard-generated'

export const WALLET_ARTWORK_CONCEPTS: readonly WalletArtworkConcept[] = [
  {
    id: MARIBANK_CONCEPT_ARTWORK_ID,
    label: 'MariBank card concept',
    description: 'Generated design study; not official MariBank artwork.',
    accountTypes: ['bank'],
    localAssetPath: '/card-art/concepts/maribank-concept.png',
  },
  {
    id: MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID,
    label: 'Maya Visa Platinum card concept',
    description: 'Generated design study; not official Maya or Visa artwork.',
    accountTypes: ['credit_card'],
    localAssetPath: '/card-art/concepts/maya-visa-platinum-concept.png',
  },
  {
    id: UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID,
    label: 'UnionBank Rewards Visa Platinum concept',
    description: 'Generated design study; not official UnionBank or Visa artwork.',
    accountTypes: ['credit_card'],
    localAssetPath: '/card-art/concepts/unionbank-rewards-visa-platinum-concept.png',
  },
  {
    id: ATOME_BLACK_CREDIT_CONCEPT_ID,
    label: 'Atome Credit Card Black concept',
    description: 'Generated design study; not official Atome artwork.',
    accountTypes: ['credit_card'],
    localAssetPath: '/card-art/concepts/atome-credit-card-black-concept.png',
  },
  {
    id: BDO_VISA_CONCEPT_ID,
    label: 'BDO Visa card concept',
    description: 'Generated design study; not official BDO or Visa artwork.',
    accountTypes: ['credit_card'],
    localAssetPath: '/card-art/concepts/bdo-visa-concept.png',
  },
  {
    id: GOTYME_VISA_CONCEPT_ID,
    label: 'GoTyme Visa card concept',
    description: 'Generated design study; not official GoTyme or Visa artwork.',
    accountTypes: ['bank'],
    localAssetPath: '/card-art/concepts/gotyme-visa-concept.png',
  },
  {
    id: GCASH_VISA_DEBIT_CONCEPT_ID,
    label: 'GCash Visa debit card concept',
    description: 'Generated design study; not official GCash or Visa artwork.',
    accountTypes: ['ewallet'],
    localAssetPath: '/card-art/concepts/gcash-visa-debit-concept.png',
  },
  {
    id: BDO_DEBIT_MASTERCARD_CONCEPT_ID,
    label: 'BDO debit Mastercard concept',
    description: 'Generated design study; not official BDO or Mastercard artwork.',
    accountTypes: ['bank'],
    localAssetPath: '/card-art/concepts/bdo-debit-mastercard-concept.png',
  },
]

export function getSelectableWalletArtworkConcepts(accountType: AccountType): readonly WalletArtworkConcept[] {
  return WALLET_ARTWORK_CONCEPTS.filter((concept) => concept.accountTypes.includes(accountType))
}

export function resolveWalletArtworkConcept(
  artworkId: string | null | undefined,
  accountType: AccountType,
): WalletArtworkConcept | null {
  return WALLET_ARTWORK_CONCEPTS.find((concept) => concept.id === artworkId && concept.accountTypes.includes(accountType)) ?? null
}
