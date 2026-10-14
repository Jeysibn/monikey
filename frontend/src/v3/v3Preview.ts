/**
 * Opt-in switch for the V3 preview. The legacy UI stays the default.
 *
 * Enable with `?v3=1` on any URL (persisted in localStorage), or build-time
 * `VITE_V3_PREVIEW=true`. Disable with `?v3=0` or the "Exit preview" control.
 * Purely a UI flag: it never touches finance data, the outbox or the API.
 */
export const V3_PREVIEW_STORAGE_KEY = 'monikey.v3Preview'

export const V3_ROUTES = {
  overview: '/v3',
  activity: '/v3/activity',
  accounts: '/v3/accounts',
  planning: '/v3/planning',
} as const

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function isV3PreviewEnabled(): boolean {
  if (import.meta.env.VITE_V3_PREVIEW === 'true') return true
  return storage()?.getItem(V3_PREVIEW_STORAGE_KEY) === '1'
}

export function setV3PreviewEnabled(enabled: boolean): void {
  const store = storage()
  if (!store) return
  if (enabled) store.setItem(V3_PREVIEW_STORAGE_KEY, '1')
  else store.removeItem(V3_PREVIEW_STORAGE_KEY)
}

/** Reads `?v3=1|0` from a query string; returns null when absent/invalid. */
export function v3QueryOverride(search: string): boolean | null {
  const value = new URLSearchParams(search).get('v3')
  if (value === '1') return true
  if (value === '0') return false
  return null
}
