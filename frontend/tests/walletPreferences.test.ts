import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MONIKEY_DEFAULT_ARTWORK_ID } from '../src/wallet/artworkCatalog.ts'
import {
  parseWalletPreferences,
  readWalletPreferences,
  saveWalletCardProduct,
  clearWalletCardProduct,
  savedWalletProductId,
  WALLET_PREFERENCES_STORAGE_KEY,
  type WalletPreferenceStorage,
} from '../src/wallet/walletPreferences.ts'

function memoryStorage(initial: string | null = null): WalletPreferenceStorage & { value: string | null } {
  return {
    value: initial,
    getItem(key) {
      assert.equal(key, WALLET_PREFERENCES_STORAGE_KEY)
      return this.value
    },
    setItem(key, value) {
      assert.equal(key, WALLET_PREFERENCES_STORAGE_KEY)
      this.value = value
    },
  }
}

describe('wallet preferences', () => {
  it('parses versioned account artwork IDs and ignores malformed entries', () => {
    const preferences = parseWalletPreferences(JSON.stringify({
      version: 1,
      byAccountId: {
        '12': { artworkId: MONIKEY_DEFAULT_ARTWORK_ID },
        ['__proto__']: { artworkId: 'unsafe-key' },
        '012': { artworkId: 'non-canonical-id' },
        '0': { artworkId: 'zero-id' },
        '13': { artworkId: 24 },
        '14': { artworkId: 'x'.repeat(101) },
      },
    }))

    assert.deepEqual(preferences, {
      version: 1,
      byAccountId: { '12': { artworkId: MONIKEY_DEFAULT_ARTWORK_ID } },
    })
  })

  it('returns empty preferences for corrupt, unsupported, or unavailable storage', () => {
    assert.deepEqual(parseWalletPreferences('{not json'), { version: 1, byAccountId: {} })
    assert.deepEqual(parseWalletPreferences(JSON.stringify({ version: 2, byAccountId: {} })), { version: 1, byAccountId: {} })
    assert.deepEqual(readWalletPreferences(null), { version: 1, byAccountId: {} })
    assert.deepEqual(readWalletPreferences({
      getItem() { throw new Error('storage denied') },
      setItem() {},
    }), { version: 1, byAccountId: {} })
  })

  it('persists the chosen card without adding finance fields, and reads it back', () => {
    const storage = memoryStorage()
    const result = saveWalletCardProduct(12, 'bdo-visa-gold', 'credit_card', { version: 1, byAccountId: {} }, storage)
    assert.equal(result.ok, true)
    assert.deepEqual(JSON.parse(storage.value ?? 'null'), {
      version: 1,
      byAccountId: { '12': { artworkId: null, productId: 'bdo-visa-gold' } },
    })
    assert.deepEqual(readWalletPreferences(storage), result.preferences)
  })

  it('keeps the current preferences when the browser refuses the write', () => {
    const current = { version: 1 as const, byAccountId: {} }
    const failedStorage: WalletPreferenceStorage = {
      getItem() { return null },
      setItem() { throw new Error('quota exceeded') },
    }
    const failed = saveWalletCardProduct(12, 'maribank-debit', 'bank', current, failedStorage)
    assert.equal(failed.ok, false)
    assert.equal(failed.preferences, current)
  })

  it('saves the card chosen for a new account with its design, and refuses a card of another type', () => {
    const storage = memoryStorage()
    const empty = { version: 1 as const, byAccountId: {} }
    const saved = saveWalletCardProduct(9, 'bdo-visa-classic', 'credit_card', empty, storage)
    assert.equal(saved.ok, true)
    assert.deepEqual(saved.preferences.byAccountId['9'], { artworkId: null, productId: 'bdo-visa-classic' })
    assert.equal(savedWalletProductId(parseWalletPreferences(storage.value), 9), 'bdo-visa-classic')

    assert.equal(saveWalletCardProduct(9, 'bdo-visa-classic', 'bank', empty, memoryStorage()).ok, false)
    assert.equal(saveWalletCardProduct(9, 'unknown-card', 'credit_card', empty, memoryStorage()).ok, false)
    assert.equal(saveWalletCardProduct(0, 'bdo-visa-classic', 'credit_card', empty, memoryStorage()).ok, false)
  })

  it('keeps a valid saved product ID and drops a malformed one', () => {
    const preferences = parseWalletPreferences(JSON.stringify({
      version: 1,
      byAccountId: {
        '2': { artworkId: null, productId: 'maribank-debit' },
        '3': { artworkId: null, productId: '<script>' },
      },
    }))
    assert.deepEqual(preferences.byAccountId, { '2': { artworkId: null, productId: 'maribank-debit' }, '3': { artworkId: null } })
  })

  it('clears an account card so it shows the MoniKey card again', () => {
    const storage = memoryStorage()
    const saved = saveWalletCardProduct(9, 'gcash-visa', 'ewallet', { version: 1, byAccountId: {} }, storage)
    const cleared = clearWalletCardProduct(9, saved.preferences, storage)
    assert.equal(cleared.ok, true)
    assert.deepEqual(parseWalletPreferences(storage.value).byAccountId, {})
  })
})
