import type { AccountType } from '../types.ts'

/*
 * The cards a person can pick for an account: first the bank or provider, then the exact card (ADR-019).
 * The name is a text label only. Every card is drawn with the original neutral MoniKey artwork
 * (/card-art/monikey-default.svg); no issuer-specific or issuer-style image ships with MoniKey, and a card
 * face never implies an official design. Choosing a card is presentation only: it never changes the
 * account type, balances or anything else sent to the API.
 */
export type CardAccountType = Exclude<AccountType, 'cash'>

export interface CardProduct {
  readonly id: string
  readonly issuer: string
  readonly name: string
  readonly accountType: CardAccountType
  /** The ID of the earlier concept image this card replaces, so older saved choices still resolve. */
  readonly legacyArtworkId?: string
}

export const CARD_PRODUCTS: readonly CardProduct[] = [
  // Bank accounts (debit cards)
  { id: 'bdo-debit-mastercard', issuer: 'BDO', name: 'BDO Debit Mastercard', accountType: 'bank', legacyArtworkId: 'concept-bdo-debit-mastercard-generated' },
  { id: 'bpi-debit-mastercard', issuer: 'BPI', name: 'BPI Debit Mastercard', accountType: 'bank' },
  { id: 'bpi-debit-cirrus-gold', issuer: 'BPI', name: 'BPI Debit Cirrus Gold', accountType: 'bank' },
  { id: 'bpi-debit-cirrus-red', issuer: 'BPI', name: 'BPI Debit Cirrus Red', accountType: 'bank' },
  { id: 'gotyme-visa-debit', issuer: 'GoTyme', name: 'GoTyme Visa Debit', accountType: 'bank', legacyArtworkId: 'concept-gotyme-visa-generated' },
  { id: 'maribank-debit', issuer: 'MariBank', name: 'MariBank Debit Card', accountType: 'bank', legacyArtworkId: 'concept-maribank-generated' },
  // E-wallets
  { id: 'gcash-visa', issuer: 'GCash', name: 'GCash Visa Card', accountType: 'ewallet', legacyArtworkId: 'concept-gcash-visa-debit-generated' },
  { id: 'gcash-mastercard', issuer: 'GCash', name: 'GCash Mastercard', accountType: 'ewallet' },
  { id: 'maya-visa', issuer: 'Maya', name: 'Maya Visa Card', accountType: 'ewallet' },
  { id: 'maya-mastercard', issuer: 'Maya', name: 'Maya Mastercard', accountType: 'ewallet' },
  { id: 'maya-virtual', issuer: 'Maya', name: 'Maya Virtual Card', accountType: 'ewallet' },
  // Credit cards
  { id: 'bdo-visa-classic', issuer: 'BDO', name: 'BDO Visa Classic', accountType: 'credit_card', legacyArtworkId: 'concept-bdo-visa-generated' },
  { id: 'bdo-visa-gold', issuer: 'BDO', name: 'BDO Visa Gold', accountType: 'credit_card' },
  { id: 'bdo-visa-platinum', issuer: 'BDO', name: 'BDO Visa Platinum', accountType: 'credit_card' },
  { id: 'bdo-visa-signature', issuer: 'BDO', name: 'BDO Visa Signature', accountType: 'credit_card' },
  { id: 'bpi-platinum-rewards', issuer: 'BPI', name: 'BPI Platinum Rewards', accountType: 'credit_card' },
  { id: 'maya-visa-platinum', issuer: 'Maya', name: 'Maya Visa Platinum', accountType: 'credit_card', legacyArtworkId: 'concept-maya-visa-platinum-generated' },
  { id: 'unionbank-rewards-visa-platinum', issuer: 'UnionBank', name: 'UnionBank Rewards Visa Platinum', accountType: 'credit_card', legacyArtworkId: 'concept-unionbank-rewards-visa-platinum-generated' },
]

/**
 * Product IDs that were selectable earlier but are not offered now. An account that still stores one shows the
 * neutral MoniKey card with no product name; its stored value, type and figures are never rewritten.
 * Atome Credit Card Black: its prepaid / buy-now-pay-later behaviour is unresolved, so it must not be shown
 * as a conventional credit card until a product-model decision is made (see ADR-019).
 */
export const UNSUPPORTED_CARD_PRODUCT_IDS: readonly string[] = ['atome-credit-black']

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
