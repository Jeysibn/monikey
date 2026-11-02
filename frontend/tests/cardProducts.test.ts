import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { access, readFile } from 'node:fs/promises'
import { CARD_PRODUCTS, cardIssuers, cardProductImage, cardProductsFor, findCardProduct, findLegacyCardProduct } from '../src/wallet/cardProducts.ts'

describe('card products', () => {
  it('lists the providers for each account type, and none for cash', () => {
    assert.deepEqual(cardIssuers('bank'), ['BDO', 'BPI', 'GoTyme', 'MariBank'])
    assert.deepEqual(cardIssuers('ewallet'), ['GCash', 'Maya'])
    assert.deepEqual(cardIssuers('credit_card'), ['Atome', 'BDO', 'BPI', 'Maya', 'UnionBank'])
    assert.deepEqual(cardIssuers('cash'), [])
  })

  it('offers every BDO credit card, each with its own entry, and only credit cards', () => {
    const bdoCredit = cardProductsFor('credit_card', 'BDO')
    assert.deepEqual(bdoCredit.map((product) => product.name), ['BDO Visa Classic', 'BDO Visa Gold', 'BDO Visa Platinum', 'BDO Visa Signature'])
    assert.deepEqual(cardProductsFor('bank', 'BDO').map((product) => product.name), ['BDO Debit Mastercard'])
  })

  it('uses unique IDs, and every card has its generated image listed in the manifest', async () => {
    assert.equal(new Set(CARD_PRODUCTS.map((product) => product.id)).size, CARD_PRODUCTS.length)
    const manifest = JSON.parse(await readFile(new URL('../public/card-art/generated/manifest.json', import.meta.url), 'utf8')) as { id: string; file: string; width: number; height: number }[]
    for (const product of CARD_PRODUCTS) {
      const entry = manifest.find((item) => item.id === product.id)
      assert.ok(entry, `${product.id} is in the manifest`)
      assert.equal(entry.file, cardProductImage(product))
      assert.deepEqual([entry.width, entry.height], [1600, 1009])
      await access(new URL(`../public${cardProductImage(product)}`, import.meta.url))
    }
  })

  it('maps each old concept ID to one card of a matching type', () => {
    const legacy = CARD_PRODUCTS.filter((product) => product.legacyArtworkId)
    assert.equal(legacy.length, 8)
    assert.equal(new Set(legacy.map((product) => product.legacyArtworkId)).size, 8)
    assert.equal(findLegacyCardProduct('concept-bdo-visa-generated', 'credit_card')?.id, 'bdo-visa-classic')
    assert.equal(findLegacyCardProduct('concept-bdo-visa-generated', 'bank'), null)
  })

  it('finds a saved product only for the matching account type', () => {
    assert.equal(findCardProduct('maribank-debit', 'bank')?.name, 'MariBank Debit Card')
    assert.equal(findCardProduct('maribank-debit', 'credit_card'), null)
    assert.equal(findCardProduct('retired-card', 'bank'), null)
    assert.equal(findCardProduct(null, 'bank'), null)
  })

  it('points each card at its own generated design', () => {
    assert.equal(cardProductImage(findCardProduct('bdo-visa-gold', 'credit_card')!), '/card-art/generated/bdo-visa-gold.webp')
  })
})
