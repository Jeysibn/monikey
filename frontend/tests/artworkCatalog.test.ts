import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  getSelectableWalletArtworks,
  isLocalWalletArtworkPath,
  isSelectableWalletArtwork,
  MONIKEY_DEFAULT_ARTWORK_ID,
  MONIKEY_DEFAULT_ARTWORK_PATH,
  resolveWalletArtwork,
  WALLET_ARTWORK_CATALOG,
} from '../src/wallet/artworkCatalog.ts'
import type { WalletArtwork } from '../src/wallet/artworkCatalog.ts'
import { CARD_PRODUCTS } from '../src/wallet/cardProducts.ts'

const defaultArtwork = WALLET_ARTWORK_CATALOG.find((artwork) => artwork.id === MONIKEY_DEFAULT_ARTWORK_ID)!
const candidateArtwork = WALLET_ARTWORK_CATALOG.find((artwork) => artwork.status === 'candidate')!

const artworkWith = (overrides: Partial<WalletArtwork>): WalletArtwork => ({
  id: 'test-artwork',
  issuer: 'Example',
  product: 'Example product',
  variant: 'Example variant',
  accountTypes: ['credit_card'],
  kind: 'physical',
  sourcePageUrl: 'https://issuer.example/products/card',
  localAssetPath: '/card-art/example-card.svg',
  status: 'approved',
  verifiedOn: '2026-11-02',
  permissionEvidence: 'docs/design/artwork-permissions/example.json — redistribution permission evidence for this application bundle.',
  ...overrides,
})

describe('wallet artwork catalog safety', () => {
  it('allows approved artwork only for supported account types', () => {
    const approvedCard = artworkWith({ accountTypes: ['credit_card'] })
    assert.equal(isSelectableWalletArtwork(approvedCard, 'credit_card'), true)
    assert.equal(isSelectableWalletArtwork(approvedCard, 'bank'), false)
  })

  it('rejects candidates, verified-but-unapproved, rejected, and retired artwork', () => {
    assert.equal(isSelectableWalletArtwork(candidateArtwork, 'credit_card'), false)
    for (const status of ['verified', 'rejected', 'retired'] as const) {
      assert.equal(isSelectableWalletArtwork(artworkWith({ status }), 'credit_card'), false)
    }
  })

  it('requires a local asset path and rejects remote or path-traversal URLs', () => {
    assert.equal(isSelectableWalletArtwork(artworkWith({ localAssetPath: null }), 'credit_card'), false)
    for (const path of [
      'https://issuer.example/card.svg',
      '//issuer.example/card.svg',
      '/card-art/../private/card.svg',
      '/card-art/%2e%2e/card.svg',
      '/other/card.svg',
      '/card-art/card.svg?remote=true',
    ]) {
      assert.equal(isLocalWalletArtworkPath(path), false, path)
      assert.equal(isSelectableWalletArtwork(artworkWith({ localAssetPath: path }), 'credit_card'), false, path)
    }
  })

  it('requires source verification and permission evidence before issuer artwork is selectable', () => {
    assert.equal(isSelectableWalletArtwork(artworkWith({ sourcePageUrl: null }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ sourcePageUrl: 'https:// not-a-url' }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ verifiedOn: null }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ verifiedOn: '2026-02-30' }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ verifiedOn: '2026-99-99' }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ permissionEvidence: null }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ permissionEvidence: '   ' }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ permissionEvidence: 'Permission pending; no redistribution license.' }), 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(artworkWith({ verifiedOn: '2024-02-29' }), 'credit_card'), true)
    assert.equal(isSelectableWalletArtwork(artworkWith({}), 'credit_card'), true)
  })

  it('allows the fallback evidence exception only for the canonical MoniKey asset', () => {
    const fallbackLikeEntry = artworkWith({
      id: 'third-party-fallback',
      issuer: 'Example',
      kind: 'fallback',
      sourcePageUrl: null,
      verifiedOn: null,
      permissionEvidence: 'Original artwork',
    })
    const canonicalIdWithOtherPath = artworkWith({
      id: MONIKEY_DEFAULT_ARTWORK_ID,
      issuer: 'MoniKey',
      kind: 'fallback',
      localAssetPath: '/card-art/other.svg',
      sourcePageUrl: null,
      verifiedOn: null,
      permissionEvidence: 'Original artwork',
    })

    assert.equal(isSelectableWalletArtwork(defaultArtwork, 'cash'), true)
    assert.equal(isSelectableWalletArtwork(fallbackLikeEntry, 'credit_card'), false)
    assert.equal(isSelectableWalletArtwork(canonicalIdWithOtherPath, 'credit_card'), false)
  })

  it('lists fallback, first-party backups and owner-curated replacements by compatible type', () => {
    for (const accountType of ['cash', 'bank', 'ewallet', 'credit_card'] as const) {
      const byType = CARD_PRODUCTS.filter(product => product.accountType === accountType)
      const expected = [MONIKEY_DEFAULT_ARTWORK_ID, ...byType.map(product => `monikey-${product.id}`), ...byType.map(product => `recovered-${product.id}`)]
      assert.deepEqual(getSelectableWalletArtworks(accountType).map((artwork) => artwork.id), expected)
    }
    assert.equal(candidateArtwork.localAssetPath, null)
    assert.equal(candidateArtwork.permissionEvidence, null)
    assert.equal(defaultArtwork.localAssetPath, MONIKEY_DEFAULT_ARTWORK_PATH)
  })

  it('keeps catalog IDs unique so a duplicate cannot shadow another product', () => {
    const ids = WALLET_ARTWORK_CATALOG.map((artwork) => artwork.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('has a bundled public asset for every approved local catalog entry', () => {
    const approvedLocalArtwork = WALLET_ARTWORK_CATALOG.filter(
      (artwork) => (artwork.status === 'approved' || artwork.status === 'owner-authorized') && artwork.localAssetPath !== null,
    )

    assert.ok(approvedLocalArtwork.length > 0)
    for (const artwork of approvedLocalArtwork) {
      const assetPath = artwork.localAssetPath!
      assert.equal(
        existsSync(new URL(`../public/${assetPath.slice(1)}`, import.meta.url)),
        true,
        `${artwork.id} points to a missing public asset: ${assetPath}`,
      )
    }
  })

  it('falls back for missing, retired, candidate, or type-mismatched selections', () => {
    assert.equal(resolveWalletArtwork(undefined, 'cash').id, MONIKEY_DEFAULT_ARTWORK_ID)
    assert.equal(resolveWalletArtwork('removed-artwork', 'cash').id, MONIKEY_DEFAULT_ARTWORK_ID)
    assert.equal(resolveWalletArtwork(candidateArtwork.id, 'credit_card').id, MONIKEY_DEFAULT_ARTWORK_ID)
    assert.equal(resolveWalletArtwork(candidateArtwork.id, 'bank').id, MONIKEY_DEFAULT_ARTWORK_ID)
  })

  it('ships the original fallback SVG locally with no remote references', () => {
    const svg = readFileSync(new URL('../public/card-art/monikey-default.svg', import.meta.url), 'utf8')
    assert.match(svg, /<svg\b/)
    assert.match(svg, /MoniKey/)
    assert.doesNotMatch(svg, /\b(?:href|src)=["'](?:https?:)?\/\//)
  })
})
