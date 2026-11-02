import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MONIKEY_DEFAULT_ARTWORK_ID, MONIKEY_DEFAULT_ARTWORK_PATH } from '../src/wallet/artworkCatalog.ts'
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
})
