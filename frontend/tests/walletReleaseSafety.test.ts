import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { findUnapprovedArtwork } from '../scripts/artworkResearch.mjs'
import {
  getSelectableWalletArtworks,
  isSelectableWalletArtwork,
  MONIKEY_DEFAULT_ARTWORK_ID,
  MONIKEY_DEFAULT_ARTWORK_PATH,
  WALLET_ARTWORK_CATALOG,
  type WalletArtwork,
} from '../src/wallet/artworkCatalog.ts'
import {
  CARD_PRODUCTS,
  UNSUPPORTED_CARD_PRODUCT_IDS,
  cardIssuers,
  cardProductsFor,
  findCardProduct,
  isCardAccountType,
} from '../src/wallet/cardProducts.ts'
import { accountCardProduct, buildWalletGalleryModel, pendingCardUploads } from '../src/wallet/walletModel.ts'
import type { AccountInfo, AccountsSnapshot, AccountType } from '../src/types.ts'

const root = new URL('..', import.meta.url).pathname
const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'ewallet', 'credit_card']
const none = { version: 1 as const, byAccountId: {} }

function filesUnder(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? filesUnder(full, `${prefix}/${name}`) : [`${prefix}/${name}`]
  })
}

const account = (id: number, type: AccountType, cardProductId?: string | null): AccountInfo => ({ id, name: `Account ${id}`, type, ...(cardProductId === undefined ? {} : { cardProductId }) })

const snapshot = (cardProductId: string | null): AccountsSnapshot => ({
  liquid: [{ account: account(1, 'bank', cardProductId), balance: 1_234_500 }],
  cards: [{ account: account(2, 'credit_card', cardProductId), owed: 500_000, credit: 0, creditLimit: 2_000_000, availableCredit: 1_500_000 }],
  totalMoney: 1_234_500,
  totalOwed: 500_000,
  netPosition: 734_500,
} as unknown as AccountsSnapshot)

describe('release-safe wallet artwork', () => {
  it('ships only the original MoniKey artwork under public/card-art', () => {
    const shipped = filesUnder(join(root, 'public/card-art'), '/card-art')
    assert.deepEqual(shipped, [MONIKEY_DEFAULT_ARTWORK_PATH])
    assert.equal(existsSync(join(root, 'public/card-art/generated')), false)
  })

  it('has no source reference to the removed generated or concept image directories', () => {
    const sources = filesUnder(join(root, 'src'), 'src').filter((path) => /\.(tsx?|css)$/.test(path))
    assert.ok(sources.length > 20)
    for (const path of sources) assert.doesNotMatch(readFileSync(join(root, path), 'utf8'), /card-art\/(generated|concepts)/, path)
  })

  it('only the neutral original artwork is selectable, for every account type', () => {
    for (const type of ACCOUNT_TYPES) {
      assert.deepEqual(getSelectableWalletArtworks(type).map((artwork) => artwork.id), [MONIKEY_DEFAULT_ARTWORK_ID])
    }
  })

  it('lets no unapproved or third-party asset bypass the approval policy', () => {
    const base: WalletArtwork = {
      id: 'x', issuer: 'BDO', product: 'Visa', variant: 'v', accountTypes: ['credit_card'], kind: 'physical',
      sourcePageUrl: 'https://issuer.example/card', localAssetPath: '/card-art/generated/bdo-visa-classic.webp',
      status: 'approved', verifiedOn: '2026-11-03', permissionEvidence: null,
    }
    assert.equal(isSelectableWalletArtwork(base, 'credit_card'), false, 'approved without evidence')
    assert.equal(isSelectableWalletArtwork({ ...base, permissionEvidence: 'AI generated, looks fine' }, 'credit_card'), false, 'vague evidence')
    assert.equal(isSelectableWalletArtwork({ ...base, kind: 'fallback', id: 'bdo-fake', issuer: 'BDO', permissionEvidence: 'Original artwork.' }, 'credit_card'), false, 'fake fallback')
    for (const artwork of WALLET_ARTWORK_CATALOG.filter((entry) => entry.id !== MONIKEY_DEFAULT_ARTWORK_ID)) {
      assert.equal(isSelectableWalletArtwork(artwork, 'credit_card'), false, artwork.id)
    }
  })

  it('draws every supported product with local safe artwork and no per-product image', () => {
    const preferences = { version: 1 as const, byAccountId: {} as Record<string, { artworkId: null; productId: string }> }
    for (const product of CARD_PRODUCTS) {
      const model = buildWalletGalleryModel(
        { ...snapshot(null), liquid: [{ account: account(1, product.accountType === 'credit_card' ? 'bank' : product.accountType, product.id), balance: 100 }], cards: product.accountType === 'credit_card' ? [{ account: account(2, 'credit_card', product.id), owed: 0, credit: 0, creditLimit: 1000, availableCredit: 1000 }] : [] } as unknown as AccountsSnapshot,
        preferences,
      )
      const item = product.accountType === 'credit_card' ? model.cards[0]! : model.liquid[0]!
      assert.equal(item.productLabel, product.name)
      assert.equal(item.artUrl, MONIKEY_DEFAULT_ARTWORK_PATH, product.id)
      assert.equal(item.artworkId, MONIKEY_DEFAULT_ARTWORK_ID, product.id)
      assert.ok(existsSync(join(root, 'public', item.artUrl)), product.id)
    }
  })
})

describe('Atome and stale product IDs', () => {
  it('is not selectable', () => {
    assert.equal(CARD_PRODUCTS.some((product) => product.id === 'atome-credit-black' || product.issuer === 'Atome'), false)
    for (const type of ACCOUNT_TYPES) assert.equal(cardIssuers(type).includes('Atome'), false)
    assert.deepEqual(cardProductsFor('credit_card', 'Atome'), [])
  })

  it('shows a stale Atome account as a neutral card with no product claim, figures unchanged', () => {
    const accounts = snapshot('atome-credit-black')
    const model = buildWalletGalleryModel(accounts, none)
    for (const item of [...model.liquid, ...model.cards]) {
      assert.equal(item.productLabel, null)
      assert.equal(item.artUrl, MONIKEY_DEFAULT_ARTWORK_PATH)
    }
    const card = model.cards[0]!
    assert.deepEqual([card.primaryAmountCentavos, card.primaryLabel, card.availableCreditCentavos, card.creditLimitCentavos], [500_000, 'Owed', 1_500_000, 2_000_000])
    assert.equal(model.liquid[0]!.primaryAmountCentavos, 1_234_500)
  })

  it('never uploads or rewrites a stored Atome ID', () => {
    const accounts = [account(1, 'credit_card', 'atome-credit-black')]
    assert.equal(accountCardProduct(accounts[0]!, none), null)
    assert.deepEqual(pendingCardUploads(accounts, none), [])
    assert.deepEqual(UNSUPPORTED_CARD_PRODUCT_IDS, ['atome-credit-black'])
  })

  it('treats unknown product IDs the same way', () => {
    const model = buildWalletGalleryModel(snapshot('retired-card'), none)
    assert.equal(model.cards[0]!.productLabel, null)
    assert.equal(model.cards[0]!.artUrl, MONIKEY_DEFAULT_ARTWORK_PATH)
  })
})

describe('card selection is presentation only', () => {
  it('still offers issuer then product, and keeps old saved choices working', () => {
    assert.deepEqual(cardIssuers('credit_card'), ['BDO', 'BPI', 'Maya', 'UnionBank'])
    assert.equal(cardProductsFor('credit_card', 'BDO').length, 4)
    assert.equal(findCardProduct('bdo-visa-gold', 'credit_card')?.name, 'BDO Visa Gold')
    const model = buildWalletGalleryModel(snapshot('bdo-visa-gold'), none)
    assert.equal(model.cards[0]!.productLabel, 'BDO Visa Gold')
  })

  it('refuses credit-card products on cash and on the wrong account type', () => {
    assert.equal(isCardAccountType('cash'), false)
    assert.equal(findCardProduct('bdo-visa-classic', 'cash'), null)
    assert.equal(findCardProduct('bdo-visa-classic', 'bank'), null)
    assert.equal(findCardProduct('bdo-debit-mastercard', 'credit_card'), null)
    assert.deepEqual(cardIssuers('cash'), [])
  })

  it('changes no amount, debt, limit or label of money when a card is picked', () => {
    const plain = buildWalletGalleryModel(snapshot(null), none)
    const chosen = buildWalletGalleryModel(snapshot('bdo-visa-gold'), none)
    const money = (items: typeof plain.cards) => items.map(({ accountId, accountType, primaryAmountCentavos, primaryLabel, availableCreditCentavos, creditLimitCentavos }) => ({ accountId, accountType, primaryAmountCentavos, primaryLabel, availableCreditCentavos, creditLimitCentavos }))
    assert.deepEqual(money(chosen.cards), money(plain.cards))
    assert.deepEqual(money(chosen.liquid), money(plain.liquid))
  })
})

describe('artwork release gate', () => {
  const allowed = new Set([MONIKEY_DEFAULT_ARTWORK_PATH])

  it('accepts the original artwork only', () => {
    assert.deepEqual(findUnapprovedArtwork({ files: [MONIKEY_DEFAULT_ARTWORK_PATH], allowed }), [])
  })

  it('flags a reintroduced generated image, a new third-party file and a stale source reference', () => {
    const problems = findUnapprovedArtwork({
      files: [MONIKEY_DEFAULT_ARTWORK_PATH, '/card-art/generated/bdo-visa-classic.webp', '/card-art/gcash.png'],
      allowed,
      sources: [{ path: 'src/a.ts', text: "const x = '/card-art/generated/a.webp'" }, { path: 'src/b.ts', text: 'ok' }],
    })
    assert.equal(problems.length, 3)
    assert.match(problems.join('\n'), /generated\/bdo-visa-classic\.webp/)
    assert.match(problems.join('\n'), /gcash\.png/)
    assert.match(problems.join('\n'), /src\/a\.ts/)
  })
})
