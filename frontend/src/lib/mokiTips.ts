/*
 * Which of Moki's tips a person has dismissed, remembered in this browser only. A tip is helpful once and then
 * gets out of the way. Nothing here is financial data, and a browser that blocks storage simply shows the tip
 * again next visit. Tip ids are a closed list so storage can never grow with arbitrary text.
 */
export const MOKI_TIP_IDS = ['dashboard-scopes', 'activity-search', 'categories-look'] as const
export type MokiTipId = (typeof MOKI_TIP_IDS)[number]

export const MOKI_TIPS_STORAGE_KEY = 'monikey.moki.tips.v1'

export interface TipStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStorage(): TipStorage | null {
  try {
    return (globalThis as typeof globalThis & { localStorage?: TipStorage }).localStorage ?? null
  } catch {
    return null
  }
}

export function parseDismissed(raw: string | null): MokiTipId[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return MOKI_TIP_IDS.filter((id) => parsed.includes(id))
  } catch {
    return []
  }
}

export function readDismissedTips(storage?: TipStorage | null): MokiTipId[] {
  const target = storage === undefined ? browserStorage() : storage
  if (!target) return []
  try {
    return parseDismissed(target.getItem(MOKI_TIPS_STORAGE_KEY))
  } catch {
    return []
  }
}

/** Remembers one more dismissed tip; false when storage refuses (the tip is still hidden for this visit). */
export function dismissTip(id: MokiTipId, storage?: TipStorage | null): boolean {
  const target = storage === undefined ? browserStorage() : storage
  if (!target) return false
  try {
    const next = Array.from(new Set([...readDismissedTips(target), id]))
    target.setItem(MOKI_TIPS_STORAGE_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}
