import type { AccountType } from '../types.ts'
import { resolveWalletArtwork } from './artworkCatalog.ts'

export const WALLET_PREFERENCES_STORAGE_KEY = 'monikey.walletPreferences'

export interface WalletPreferencesV1 {
  version: 1
  byAccountId: Record<string, { artworkId: string | null }>
}

export interface WalletPreferenceStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const EMPTY_PREFERENCES: WalletPreferencesV1 = { version: 1, byAccountId: {} }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function browserStorage(): WalletPreferenceStorage | null {
  try {
    const host = globalThis as typeof globalThis & { localStorage?: WalletPreferenceStorage }
    return host.localStorage ?? null
  } catch {
    return null
  }
}

function storageOrBrowser(storage: WalletPreferenceStorage | null | undefined): WalletPreferenceStorage | null {
  return storage === undefined ? browserStorage() : storage
}

/** Parse only the small, presentation-only v1 preference shape; corruption safely becomes empty preferences. */
export function parseWalletPreferences(raw: string | null): WalletPreferencesV1 {
  if (raw === null) return { version: 1, byAccountId: {} }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.byAccountId)) {
      return { version: 1, byAccountId: {} }
    }

    const byAccountId: WalletPreferencesV1['byAccountId'] = {}
    for (const [accountId, value] of Object.entries(parsed.byAccountId)) {
      if (!/^\d+$/.test(accountId) || !Number.isSafeInteger(Number(accountId)) || Number(accountId) < 1 || String(Number(accountId)) !== accountId) continue
      if (!isRecord(value)) continue
      if (typeof value.artworkId !== 'string' && value.artworkId !== null) continue
      if (typeof value.artworkId === 'string' && value.artworkId.length > 100) continue
      byAccountId[accountId] = { artworkId: value.artworkId }
    }

    return { version: 1, byAccountId }
  } catch {
    return { version: 1, byAccountId: {} }
  }
}

/** Storage access can be denied or unavailable; use the neutral default in that case. */
export function readWalletPreferences(storage?: WalletPreferenceStorage | null): WalletPreferencesV1 {
  const target = storageOrBrowser(storage)
  if (!target) return { ...EMPTY_PREFERENCES, byAccountId: {} }

  try {
    return parseWalletPreferences(target.getItem(WALLET_PREFERENCES_STORAGE_KEY))
  } catch {
    return { ...EMPTY_PREFERENCES, byAccountId: {} }
  }
}

export function savedWalletArtworkId(preferences: WalletPreferencesV1, accountId: number): string | null {
  return preferences.byAccountId[String(accountId)]?.artworkId ?? null
}

/** Save only a currently approved, type-matched catalog ID. No finance API is involved. */
export function saveWalletArtworkPreference(
  accountId: number,
  artworkId: string,
  accountType: AccountType,
  current: WalletPreferencesV1,
  storage?: WalletPreferenceStorage | null,
): { ok: boolean; preferences: WalletPreferencesV1 } {
  const target = storageOrBrowser(storage)
  if (!target || !Number.isSafeInteger(accountId) || accountId < 1) {
    return { ok: false, preferences: current }
  }

  if (resolveWalletArtwork(artworkId, accountType).id !== artworkId) {
    return { ok: false, preferences: current }
  }

  const preferences: WalletPreferencesV1 = {
    version: 1,
    byAccountId: {
      ...current.byAccountId,
      [String(accountId)]: { artworkId },
    },
  }

  try {
    target.setItem(WALLET_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    return { ok: true, preferences }
  } catch {
    return { ok: false, preferences: current }
  }
}
