import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MONIKEY_DEFAULT_ARTWORK_ID, MONIKEY_DEFAULT_ARTWORK_PATH } from '../src/wallet/artworkCatalog.ts'
import { buildWalletGalleryModel, faceFigure, pendingCardUploads, serverStoresCards, usedShare } from '../src/wallet/walletModel.ts'
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

  it('maps a choice saved with an old concept ID to its generated card, without changing figures', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: {
        '2': { artworkId: 'concept-maribank-generated' },
        '3': { artworkId: 'concept-gcash-visa-debit-generated' },
        '4': { artworkId: 'concept-maya-visa-platinum-generated' },
        '5': { artworkId: 'concept-atome-credit-card-black-generated' },
        '6': { artworkId: 'concept-bdo-visa-generated' },
        '7': { artworkId: 'concept-maribank-generated' }, // a bank design saved on a credit card: ignored
      },
    })
    const byId = Object.fromEntries([...model.liquid, ...model.cards].map((item) => [item.accountId, item]))
    assert.deepEqual(
      [2, 3, 4, 5, 6].map((id) => [byId[id]!.productLabel, byId[id]!.artUrl]),
      [
        ['MariBank Debit Card', '/card-art/generated/maribank-debit.webp'],
        ['GCash Visa Card', '/card-art/generated/gcash-visa.webp'],
        ['Maya Visa Platinum', '/card-art/generated/maya-visa-platinum.webp'],
        ['Atome Credit Card Black', '/card-art/generated/atome-credit-black.webp'],
        ['BDO Visa Classic', '/card-art/generated/bdo-visa-classic.webp'],
      ],
    )
    assert.equal(byId[7]!.artUrl, MONIKEY_DEFAULT_ARTWORK_PATH)
    assert.deepEqual([byId[2]!.primaryAmountCentavos, byId[4]!.primaryAmountCentavos, byId[4]!.availableCreditCentavos], [4_872_550, 1_425_000, 3_575_000])
  })

  it('shows the card chosen when the account was added, with its name, without changing figures', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: {
        '2': { artworkId: null, productId: 'maribank-debit' },
        '4': { artworkId: null, productId: 'bdo-visa-gold' },
        '5': { artworkId: null, productId: 'maribank-debit' },
      },
    })
    const savings = model.liquid.find((item) => item.accountId === 2)!
    assert.equal(savings.productLabel, 'MariBank Debit Card')
    assert.equal(savings.artUrl, '/card-art/generated/maribank-debit.webp')
    assert.equal(savings.primaryAmountCentavos, 4_872_550)
    const gold = model.cards.find((item) => item.accountId === 4)!
    assert.equal(gold.productLabel, 'BDO Visa Gold')
    assert.equal(gold.artUrl, '/card-art/generated/bdo-visa-gold.webp')
    const mismatched = model.cards.find((item) => item.accountId === 5)!
    assert.equal(mismatched.productLabel, null)
    assert.equal(mismatched.artUrl, MONIKEY_DEFAULT_ARTWORK_PATH)
  })

  it('shows available credit and the share of the limit used on credit card faces', () => {
    const model = buildWalletGalleryModel(snapshot)
    const cards = Object.fromEntries(model.cards.map((item) => [item.accountName, item]))
    assert.deepEqual(faceFigure(cards['Blue Card']!), { label: 'Available credit', centavos: cards['Blue Card']!.availableCreditCentavos!, note: `${Math.round(usedShare(cards['Blue Card']!)!.percent)}% used` })
    assert.equal(faceFigure(cards['Paid Off Card']!).note, '0% used')
    assert.match(faceFigure(cards['Overpaid Card']!).note ?? '', /^0% used · ₱[\d,.]+ card credit$/)
    const over = faceFigure(cards['Over Limit Card']!)
    assert.equal(over.label, 'Over limit by')
    assert.equal(over.centavos, -cards['Over Limit Card']!.availableCreditCentavos!)
    assert.equal(usedShare(model.liquid[0]!), null)
    assert.deepEqual(faceFigure(model.liquid[0]!), { label: 'Balance', centavos: -12_000, note: 'Below zero' })
  })

  it('reports a tiny balance as under 1% used, never as unused', () => {
    const [card] = buildWalletGalleryModel(snapshot).cards
    assert.equal(usedShare({ ...card!, primaryLabel: 'Owed', primaryAmountCentavos: 100, creditLimitCentavos: 5_000_000 })!.text, 'Under 1% used')
  })

  it('uses dark text on light designs and the MoniKey card, white on dark designs', () => {
    const model = buildWalletGalleryModel(snapshot, {
      version: 1,
      byAccountId: {
        '2': { artworkId: null, productId: 'maribank-debit' },
        '3': { artworkId: null, productId: 'gcash-visa' },
      },
    })
    assert.equal(model.liquid.find((item) => item.accountId === 2)!.faceInk, 'dark')
    assert.equal(model.liquid.find((item) => item.accountId === 3)!.faceInk, 'light')
    assert.equal(model.liquid.find((item) => item.accountId === 1)!.faceInk, 'dark')
  })

  it('prefers the card the server stores over one kept in the browser (ADR-020)', () => {
    const served: AccountsSnapshot = {
      ...snapshot,
      liquid: snapshot.liquid.map((row) => row.account.id === 2 ? { ...row, account: { ...row.account, cardProductId: 'gotyme-visa-debit' } } : row),
    }
    const model = buildWalletGalleryModel(served, { version: 1, byAccountId: { '2': { artworkId: null, productId: 'maribank-debit' } } })
    assert.equal(model.liquid.find((item) => item.accountId === 2)!.productLabel, 'GoTyme Visa Debit')
  })

  it('lists browser-only cards to send once the server stores card choices', () => {
    const accounts = [
      { id: 2, name: 'Main Savings', type: 'bank' as const, cardProductId: null },
      { id: 3, name: 'GCash', type: 'ewallet' as const, cardProductId: 'gcash-visa' },
      { id: 4, name: 'Blue Card', type: 'credit_card' as const, cardProductId: null },
      { id: 5, name: 'Old API card', type: 'credit_card' as const },
    ]
    const preferences = { version: 1 as const, byAccountId: {
      '2': { artworkId: null, productId: 'maribank-debit' },
      '3': { artworkId: null, productId: 'gcash-mastercard' },
      '4': { artworkId: 'concept-bdo-visa-generated' },
      '5': { artworkId: null, productId: 'bdo-visa-gold' },
    } }
    assert.deepEqual(pendingCardUploads(accounts, preferences), [
      { accountId: 2, productId: 'maribank-debit' },
      { accountId: 4, productId: 'bdo-visa-classic' },
    ])
    assert.equal(serverStoresCards(accounts), true)
    assert.equal(serverStoresCards([{ id: 5, name: 'Old', type: 'bank' }]), false)
  })
})
