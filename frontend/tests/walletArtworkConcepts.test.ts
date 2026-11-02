import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import { getSelectableWalletArtworks } from '../src/wallet/artworkCatalog.ts'
import {
  ATOME_BLACK_CREDIT_CONCEPT_ID,
  BDO_DEBIT_MASTERCARD_CONCEPT_ID,
  BDO_VISA_CONCEPT_ID,
  GCASH_VISA_DEBIT_CONCEPT_ID,
  GOTYME_VISA_CONCEPT_ID,
  getSelectableWalletArtworkConcepts,
  MARIBANK_CONCEPT_ARTWORK_ID,
  MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID,
  UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID,
  WALLET_ARTWORK_CONCEPTS,
  resolveWalletArtworkConcept,
} from '../src/wallet/walletArtworkConcepts.ts'

describe('local wallet artwork concepts', () => {
  it('offers each concept only to its supported account type', () => {
    assert.deepEqual(getSelectableWalletArtworkConcepts('bank').map(({ id }) => id), [
      MARIBANK_CONCEPT_ARTWORK_ID,
      GOTYME_VISA_CONCEPT_ID,
      BDO_DEBIT_MASTERCARD_CONCEPT_ID,
    ])
    assert.deepEqual(getSelectableWalletArtworkConcepts('credit_card').map(({ id }) => id), [
      MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID,
      UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID,
      ATOME_BLACK_CREDIT_CONCEPT_ID,
      BDO_VISA_CONCEPT_ID,
    ])
    assert.deepEqual(getSelectableWalletArtworkConcepts('cash'), [])
    assert.deepEqual(getSelectableWalletArtworkConcepts('ewallet').map(({ id }) => id), [GCASH_VISA_DEBIT_CONCEPT_ID])
  })

  it('keeps generated concepts separate from approved artwork and verifies every local file exists', () => {
    for (const concept of WALLET_ARTWORK_CONCEPTS) {
      assert.equal(getSelectableWalletArtworks(concept.accountTypes[0]!).some(({ id }) => id === concept.id), false)
      const assetPath = resolve('public', concept.localAssetPath.slice(1))
      assert.equal(existsSync(assetPath), true, `${concept.id} asset missing: ${concept.localAssetPath}`)
      const png = readFileSync(assetPath)
      assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', `${concept.id} is not a PNG`)
      assert.equal(png[25], 6, `${concept.id} must use PNG RGBA transparency`)
    }
  })

  it('rejects the concept for unsupported account types', () => {
    assert.equal(resolveWalletArtworkConcept(MARIBANK_CONCEPT_ARTWORK_ID, 'bank')?.id, MARIBANK_CONCEPT_ARTWORK_ID)
    assert.equal(resolveWalletArtworkConcept(MARIBANK_CONCEPT_ARTWORK_ID, 'credit_card'), null)
    assert.equal(resolveWalletArtworkConcept(MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID, 'credit_card')?.id, MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID)
    assert.equal(resolveWalletArtworkConcept(MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID, 'bank'), null)
    assert.equal(resolveWalletArtworkConcept(GOTYME_VISA_CONCEPT_ID, 'bank')?.id, GOTYME_VISA_CONCEPT_ID)
    assert.equal(resolveWalletArtworkConcept(UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID, 'credit_card')?.id, UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID)
    assert.equal(resolveWalletArtworkConcept(ATOME_BLACK_CREDIT_CONCEPT_ID, 'bank'), null)
    assert.equal(resolveWalletArtworkConcept(BDO_VISA_CONCEPT_ID, 'ewallet'), null)
    assert.equal(resolveWalletArtworkConcept(GCASH_VISA_DEBIT_CONCEPT_ID, 'ewallet')?.id, GCASH_VISA_DEBIT_CONCEPT_ID)
    assert.equal(resolveWalletArtworkConcept(BDO_DEBIT_MASTERCARD_CONCEPT_ID, 'bank')?.id, BDO_DEBIT_MASTERCARD_CONCEPT_ID)
    assert.equal(resolveWalletArtworkConcept(GCASH_VISA_DEBIT_CONCEPT_ID, 'bank'), null)
  })
})
