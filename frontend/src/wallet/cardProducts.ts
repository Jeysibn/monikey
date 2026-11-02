import type { AccountType } from '../types.ts'

/*
 * The cards a person can pick for an account: first the bank or provider, then the exact card.
 * Each card has its own design: an AI-generated demo image (ADR-019), made from
 * docs/design/CODEX_CARD_ART_BRIEF.md and listed in public/card-art/generated/manifest.json.
 * Every image is a flat, full-bleed 1600×1009 WebP with square corners (the app rounds them) and a calm
 * bottom-left area where the balance is printed. Choosing a card is presentation only: it never changes
 * the account type, balances or anything sent to the API.
 */
export type CardAccountType = Exclude<AccountType, 'cash'>

export interface CardProduct {
  readonly id: string
  readonly issuer: string
  readonly name: string
  readonly accountType: CardAccountType
  /** Text colour for the balance printed bottom-left: 'light' (white) or 'dark' (ink). */
  readonly faceInk: 'light' | 'dark'
  /** The ID of the earlier concept image this card replaces, so older saved choices still resolve. */
  readonly legacyArtworkId?: string
}

export const CARD_PRODUCTS: readonly CardProduct[] = [
  // Bank accounts (debit cards)
  { id: 'bdo-debit-mastercard', issuer: 'BDO', name: 'BDO Debit Mastercard', accountType: 'bank', faceInk: 'light', legacyArtworkId: 'concept-bdo-debit-mastercard-generated' },
  { id: 'bpi-debit-mastercard', issuer: 'BPI', name: 'BPI Debit Mastercard', accountType: 'bank', faceInk: 'light' },
  { id: 'bpi-debit-cirrus-gold', issuer: 'BPI', name: 'BPI Debit Cirrus Gold', accountType: 'bank', faceInk: 'dark' },
  { id: 'bpi-debit-cirrus-red', issuer: 'BPI', name: 'BPI Debit Cirrus Red', accountType: 'bank', faceInk: 'light' },
  { id: 'gotyme-visa-debit', issuer: 'GoTyme', name: 'GoTyme Visa Debit', accountType: 'bank', faceInk: 'light', legacyArtworkId: 'concept-gotyme-visa-generated' },
  // White on MariBank orange is 3.1:1, below 4.5:1 for the small label; dark ink is about 5.6:1.
  { id: 'maribank-debit', issuer: 'MariBank', name: 'MariBank Debit Card', accountType: 'bank', faceInk: 'dark', legacyArtworkId: 'concept-maribank-generated' },
  // E-wallets
  { id: 'gcash-visa', issuer: 'GCash', name: 'GCash Visa Card', accountType: 'ewallet', faceInk: 'light', legacyArtworkId: 'concept-gcash-visa-debit-generated' },
  { id: 'gcash-mastercard', issuer: 'GCash', name: 'GCash Mastercard', accountType: 'ewallet', faceInk: 'light' },
  { id: 'maya-visa', issuer: 'Maya', name: 'Maya Visa Card', accountType: 'ewallet', faceInk: 'light' },
  { id: 'maya-mastercard', issuer: 'Maya', name: 'Maya Mastercard', accountType: 'ewallet', faceInk: 'light' },
  { id: 'maya-virtual', issuer: 'Maya', name: 'Maya Virtual Card', accountType: 'ewallet', faceInk: 'dark' },
  // Credit cards
  { id: 'atome-credit-black', issuer: 'Atome', name: 'Atome Credit Card Black', accountType: 'credit_card', faceInk: 'light', legacyArtworkId: 'concept-atome-credit-card-black-generated' },
  { id: 'bdo-visa-classic', issuer: 'BDO', name: 'BDO Visa Classic', accountType: 'credit_card', faceInk: 'light', legacyArtworkId: 'concept-bdo-visa-generated' },
  { id: 'bdo-visa-gold', issuer: 'BDO', name: 'BDO Visa Gold', accountType: 'credit_card', faceInk: 'dark' },
  { id: 'bdo-visa-platinum', issuer: 'BDO', name: 'BDO Visa Platinum', accountType: 'credit_card', faceInk: 'dark' },
  { id: 'bdo-visa-signature', issuer: 'BDO', name: 'BDO Visa Signature', accountType: 'credit_card', faceInk: 'light' },
  { id: 'bpi-platinum-rewards', issuer: 'BPI', name: 'BPI Platinum Rewards', accountType: 'credit_card', faceInk: 'light' },
  { id: 'maya-visa-platinum', issuer: 'Maya', name: 'Maya Visa Platinum', accountType: 'credit_card', faceInk: 'light', legacyArtworkId: 'concept-maya-visa-platinum-generated' },
  { id: 'unionbank-rewards-visa-platinum', issuer: 'UnionBank', name: 'UnionBank Rewards Visa Platinum', accountType: 'credit_card', faceInk: 'light', legacyArtworkId: 'concept-unionbank-rewards-visa-platinum-generated' },
]

export function isCardAccountType(type: AccountType): type is CardAccountType {
  return type !== 'cash'
}

/** The banks or providers that offer a card for this account type, in alphabetical order. */
export function cardIssuers(accountType: AccountType): string[] {
  const issuers = CARD_PRODUCTS.filter((product) => product.accountType === accountType).map((product) => product.issuer)
  return [...new Set(issuers)].sort((a, b) => a.localeCompare(b))
}

export function cardProductsFor(accountType: AccountType, issuer: string): CardProduct[] {
  return CARD_PRODUCTS.filter((product) => product.accountType === accountType && product.issuer === issuer)
}

/** A saved product ID only counts when it still exists and matches the account's type. */
export function findCardProduct(productId: string | null | undefined, accountType: AccountType): CardProduct | null {
  return CARD_PRODUCTS.find((product) => product.id === productId && product.accountType === accountType) ?? null
}

/** A choice saved before the generated set existed (only an old concept artwork ID), matched to its card. */
export function findLegacyCardProduct(artworkId: string | null | undefined, accountType: AccountType): CardProduct | null {
  return CARD_PRODUCTS.find((product) => product.legacyArtworkId === artworkId && product.accountType === accountType) ?? null
}

/** The card's own generated design. */
export function cardProductImage(product: CardProduct): string {
  return `/card-art/generated/${product.id}.webp`
}
