import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MONIKEY_DEFAULT_ARTWORK_ID, MONIKEY_DEFAULT_ARTWORK_PATH } from '../src/wallet/artworkCatalog.ts'
import {
  ATOME_BLACK_CREDIT_CONCEPT_ID,
  BDO_DEBIT_MASTERCARD_CONCEPT_ID,
  BDO_VISA_CONCEPT_ID,
  GCASH_VISA_DEBIT_CONCEPT_ID,
  GOTYME_VISA_CONCEPT_ID,
  MARIBANK_CONCEPT_ARTWORK_ID,
  MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID,
  UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID,
} from '../src/wallet/walletArtworkConcepts.ts'
import { buildWalletGalleryModel } from '../src/wallet/walletModel.ts'
import type { AccountsSnapshot } from '../src/types.ts'

const snapshot: AccountsSnapshot = {
  accounts: [
    { id: 1, name: 'Cash on hand', type: 'cash' },
    { id: 2, name: 'Main Savings', type: 'bank' },
    { id: 3, name: 'GCash', type: 'ewallet' },
    { id: 4, name: 'Blue Card', type: 'credit_card' },
    { id: 5, name: 'Overpaid Card', type: 'credit_card' },
    { id: 6, name: 'Paid Off Card', type: 'credit_card' },
    { id: 7, name: 'Over Limit Card', type: 'credit_card' },
  ],
  liquid: [
    { account: { id: 1, name: 'Cash on hand', type: 'cash' }, balance: -12_000 },
    { account: { id: 2, name: 'Main Savings', type: 'bank' }, balance: 4_872_550 },
    { account: { id: 3, name: 'GCash', type: 'ewallet' }, balance: 312_075 },
  ],
  cards: [
    {
      account: { id: 4, name: 'Blue Card', type: 'credit_card' },
      signedDebt: 1_425_000,
      owed: 1_425_000,
      credit: 0,
      creditLimit: 5_000_000,
      availableCredit: 3_575_000,
    },
    {
      account: { id: 5, name: 'Overpaid Card', type: 'credit_card' },
      signedDebt: -50_000,
      owed: 0,
      credit: 50_000,
      creditLimit: 1_000_000,
      availableCredit: 1_050_000,
    },
    {
      account: { id: 6, name: 'Paid Off Card', type: 'credit_card' },
      signedDebt: 0,
      owed: 0,
      credit: 0,
      creditLimit: 2_000_000,
      availableCredit: 2_000_000,
    },
    {
      account: { id: 7, name: 'Over Limit Card', type: 'credit_card' },
      signedDebt: 3_680_000,
      owed: 3_680_000,
      credit: 0,
      creditLimit: 3_000_000,
      availableCredit: -680_000,
    },
  ],
}

describe('buildWalletGalleryModel', () => {
  it('projects liquid balances and preserves account ordering without recalculating amounts', () => {
    const model = buildWalletGalleryModel(snapshot)
    assert.deepEqual(model.liquid.map(({ accountId, primaryAmountCentavos, primaryLabel }) => [accountId, primaryAmountCentavos, primaryLabel]), [
      [1, -12_000, 'Balance'],
      [2, 4_872_550, 'Balance'],
      [3, 312_075, 'Balance'],
    ])
  })

  it('uses server-provided card amounts and keeps available credit separate', () => {
    const [owed, credit, paidOff, overLimit] = buildWalletGalleryModel(snapshot).cards
    assert.deepEqual(
      [owed?.primaryAmountCentavos, owed?.primaryLabel, owed?.availableCreditCentavos, owed?.creditLimitCentavos],
      [1_425_000, 'Owed', 3_575_000, 5_000_000],
    )
    assert.deepEqual(
      [credit?.primaryAmountCentavos, credit?.primaryLabel, credit?.availableCreditCentavos],
      [50_000, 'Card credit', 1_050_000],
    )
    assert.deepEqual(
      [paidOff?.primaryAmountCentavos, paidOff?.primaryLabel],
      [0, 'Nothing owed'],
    )
    assert.deepEqual(
      [overLimit?.primaryAmountCentavos, overLimit?.availableCreditCentavos],
      [3_680_000, -680_000],
    )
  })

  it('uses the approved neutral artwork by account type without inferring from account names', () => {
    const model = buildWalletGalleryModel(snapshot)
    for (const item of [...model.liquid, ...model.cards]) {
      assert.equal(item.artworkId, MONIKEY_DEFAULT_ARTWORK_ID)
      assert.equal(item.artUrl, MONIKEY_DEFAULT_ARTWORK_PATH)
    }
  })

  it('resolves unknown or retired saved artwork to MoniKey default for live accounts', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: {
        '1': { artworkId: 'removed-artwork' },
        '999': { artworkId: MONIKEY_DEFAULT_ARTWORK_ID },
      },
    })

    assert.equal(model.liquid.find((item) => item.accountId === 1)?.artworkId, MONIKEY_DEFAULT_ARTWORK_ID)
    assert.equal(model.liquid.some((item) => item.accountId === 999), false)
  })

  it('shows an explicitly selected MariBank concept on Main Savings without changing its balance', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: { '2': { artworkId: MARIBANK_CONCEPT_ARTWORK_ID } },
    })
    const mainSavings = model.liquid.find((item) => item.accountId === 2)

    assert.equal(mainSavings?.artworkId, MARIBANK_CONCEPT_ARTWORK_ID)
    assert.equal(mainSavings?.artUrl, '/card-art/concepts/maribank-concept.png')
    assert.equal(mainSavings?.isArtworkConcept, true)
    assert.equal(mainSavings?.accountName, 'Main Savings')
    assert.equal(mainSavings?.primaryAmountCentavos, 4_872_550)
  })

  it('shows an explicitly selected Maya concept on a credit card without changing its figures', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: { '4': { artworkId: MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID } },
    })
    const blueCard = model.cards.find((item) => item.accountId === 4)

    assert.equal(blueCard?.artworkId, MAYA_VISA_PLATINUM_CONCEPT_ARTWORK_ID)
    assert.equal(blueCard?.artUrl, '/card-art/concepts/maya-visa-platinum-concept.png')
    assert.equal(blueCard?.isArtworkConcept, true)
    assert.equal(blueCard?.primaryAmountCentavos, 1_425_000)
    assert.equal(blueCard?.availableCreditCentavos, 3_575_000)
    assert.equal(blueCard?.creditLimitCentavos, 5_000_000)
  })

  it('maps generated bank and credit-card concepts without changing account values', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: {
        '2': { artworkId: GOTYME_VISA_CONCEPT_ID },
        '4': { artworkId: UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID },
        '5': { artworkId: ATOME_BLACK_CREDIT_CONCEPT_ID },
        '6': { artworkId: BDO_VISA_CONCEPT_ID },
      },
    })
    const mainSavings = model.liquid.find((item) => item.accountId === 2)
    const [unionBank, atome, bdo] = model.cards

    assert.deepEqual([mainSavings?.artworkId, mainSavings?.artUrl, mainSavings?.primaryAmountCentavos], [
      GOTYME_VISA_CONCEPT_ID,
      '/card-art/concepts/gotyme-visa-concept.png',
      4_872_550,
    ])
    assert.deepEqual(
      [unionBank?.artworkId, atome?.artworkId, bdo?.artworkId],
      [UNIONBANK_REWARDS_VISA_PLATINUM_CONCEPT_ID, ATOME_BLACK_CREDIT_CONCEPT_ID, BDO_VISA_CONCEPT_ID],
    )
    assert.deepEqual([unionBank?.primaryAmountCentavos, atome?.primaryAmountCentavos, bdo?.primaryAmountCentavos], [1_425_000, 50_000, 0])
    assert.deepEqual([unionBank?.availableCreditCentavos, atome?.availableCreditCentavos, bdo?.availableCreditCentavos], [3_575_000, 1_050_000, 2_000_000])
  })

  it('maps generated debit-card concepts to bank and e-wallet accounts without changing balances', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: {
        '2': { artworkId: BDO_DEBIT_MASTERCARD_CONCEPT_ID },
        '3': { artworkId: GCASH_VISA_DEBIT_CONCEPT_ID },
      },
    })
    const mainSavings = model.liquid.find((item) => item.accountId === 2)
    const gcash = model.liquid.find((item) => item.accountId === 3)

    assert.deepEqual([mainSavings?.artworkId, mainSavings?.artUrl, mainSavings?.primaryAmountCentavos], [
      BDO_DEBIT_MASTERCARD_CONCEPT_ID,
      '/card-art/concepts/bdo-debit-mastercard-concept.png',
      4_872_550,
    ])
    assert.deepEqual([gcash?.artworkId, gcash?.artUrl, gcash?.primaryAmountCentavos], [
      GCASH_VISA_DEBIT_CONCEPT_ID,
      '/card-art/concepts/gcash-visa-debit-concept.png',
      312_075,
    ])
  })
})
