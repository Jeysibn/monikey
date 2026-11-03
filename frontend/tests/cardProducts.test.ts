import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CARD_PRODUCTS, UNSUPPORTED_CARD_PRODUCT_IDS, cardIssuers, cardProductsFor, findCardProduct, findLegacyCardProduct } from '../src/wallet/cardProducts.ts'

describe('card products', () => {
  it('lists the providers for each account type, and none for cash', () => {
    assert.deepEqual(cardIssuers('bank'), ['BDO', 'BPI', 'GoTyme', 'MariBank'])
    assert.deepEqual(cardIssuers('ewallet'), ['GCash', 'Maya'])
    assert.deepEqual(cardIssuers('credit_card'), ['BDO', 'BPI', 'Maya', 'UnionBank'])
    assert.deepEqual(cardIssuers('cash'), [])
  })

  it('offers every BDO credit card, each with its own entry, and only credit cards', () => {
    const bdoCredit = cardProductsFor('credit_card', 'BDO')
    assert.deepEqual(bdoCredit.map((product) => product.name), ['BDO Visa Classic', 'BDO Visa Gold', 'BDO Visa Platinum', 'BDO Visa Signature'])
    assert.deepEqual(cardProductsFor('bank', 'BDO').map((product) => product.name), ['BDO Debit Mastercard'])
  })

  it('uses unique IDs, and never offers an unsupported product', () => {
    assert.equal(new Set(CARD_PRODUCTS.map((product) => product.id)).size, CARD_PRODUCTS.length)
    assert.equal(CARD_PRODUCTS.length, 18)
    for (const id of UNSUPPORTED_CARD_PRODUCT_IDS) assert.equal(CARD_PRODUCTS.some((product) => product.id === id), false, id)
  })

  it('does not offer Atome for any account type, and resolves a stale Atome ID to no product', () => {
    assert.deepEqual(UNSUPPORTED_CARD_PRODUCT_IDS, ['atome-credit-black'])
    for (const type of ['bank', 'ewallet', 'credit_card', 'cash'] as const) {
      assert.equal(cardIssuers(type).includes('Atome'), false)
      assert.deepEqual(cardProductsFor(type, 'Atome'), [])
      assert.equal(findCardProduct('atome-credit-black', type), null)
      assert.equal(findLegacyCardProduct('concept-atome-credit-card-black-generated', type), null)
    }
  })

  it('maps each old concept ID to one card of a matching type', () => {
    const legacy = CARD_PRODUCTS.filter((product) => product.legacyArtworkId)
    assert.equal(legacy.length, 7)
    assert.equal(new Set(legacy.map((product) => product.legacyArtworkId)).size, 7)
    assert.equal(findLegacyCardProduct('concept-bdo-visa-generated', 'credit_card')?.id, 'bdo-visa-classic')
    assert.equal(findLegacyCardProduct('concept-bdo-visa-generated', 'bank'), null)
  })

  it('finds a saved product only for the matching account type', () => {
    assert.equal(findCardProduct('maribank-debit', 'bank')?.name, 'MariBank Debit Card')
    assert.equal(findCardProduct('maribank-debit', 'credit_card'), null)
    assert.equal(findCardProduct('retired-card', 'bank'), null)
    assert.equal(findCardProduct(null, 'bank'), null)
  })
})
