import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MONIKEY_DEFAULT_ARTWORK_ID } from '../src/wallet/artworkCatalog.ts'
import { MARIBANK_CONCEPT_ARTWORK_ID } from '../src/wallet/walletArtworkConcepts.ts'
import {
  parseWalletPreferences,
  readWalletPreferences,
  saveWalletArtworkPreference,
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

  it('persists an approved artwork ID without adding finance fields', () => {
    const storage = memoryStorage()
    const result = saveWalletArtworkPreference(
      12,
      MONIKEY_DEFAULT_ARTWORK_ID,
      'credit_card',
      { version: 1, byAccountId: {} },
      storage,
    )

    assert.equal(result.ok, true)
    assert.deepEqual(JSON.parse(storage.value ?? 'null'), {
      version: 1,
      byAccountId: { '12': { artworkId: MONIKEY_DEFAULT_ARTWORK_ID } },
    })
    assert.deepEqual(readWalletPreferences(storage), result.preferences)
  })

  it('persists a local concept for a supported bank account only', () => {
    const storage = memoryStorage()
    const result = saveWalletArtworkPreference(
      2,
      MARIBANK_CONCEPT_ARTWORK_ID,
      'bank',
      { version: 1, byAccountId: {} },
      storage,
    )

    assert.equal(result.ok, true)
    assert.equal(result.preferences.byAccountId['2']?.artworkId, MARIBANK_CONCEPT_ARTWORK_ID)
    assert.equal(saveWalletArtworkPreference(
      2,
      MARIBANK_CONCEPT_ARTWORK_ID,
      'credit_card',
      { version: 1, byAccountId: {} },
      storage,
    ).ok, false)
  })

  it('refuses unknown artwork IDs, invalid account IDs, and failed writes', () => {
    const current = { version: 1 as const, byAccountId: {} }
    const storage = memoryStorage()
    assert.equal(saveWalletArtworkPreference(12, 'unknown-artwork', 'bank', current, storage).ok, false)
    assert.equal(saveWalletArtworkPreference(0, MONIKEY_DEFAULT_ARTWORK_ID, 'bank', current, storage).ok, false)

    const failedStorage: WalletPreferenceStorage = {
      getItem() { return null },
      setItem() { throw new Error('quota exceeded') },
    }
    const failed = saveWalletArtworkPreference(12, MONIKEY_DEFAULT_ARTWORK_ID, 'bank', current, failedStorage)
    assert.equal(failed.ok, false)
    assert.equal(failed.preferences, current)
  })
})
