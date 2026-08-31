import { useCallback, useEffect, useState } from 'react'
import type { DisplayPreferences, NotificationPreferences, SettingsState, UserProfile } from '../domain/settings'
import type { SettingsGateway } from '../services/apiSettingsGateway'

/**
 * Namespaced so it can never collide with a key some other feature reads or
 * writes, and versioned so a future shape change can migrate or discard old
 * data instead of crashing on it.
 */
const STORAGE_KEY = 'monikey.settings.v1'

export const DEFAULT_SETTINGS: SettingsState = {
  profile: {
    displayName: 'Jane Dela Cruz',
    email: 'jane@example.com',
  },
  notifications: {
    billDueReminders: true,
    budgetNearLimitWarnings: true,
    weeklySummaryEmail: false,
  },
  display: {
    hideCents: false,
  },
}

/**
 * `window.localStorage` can throw (private-browsing quota, disabled storage,
 * a non-browser test environment) or simply be unavailable — every read and
 * write here is wrapped so the page keeps working from in-memory defaults
 * instead of crashing.
 */
function readStoredSettings(): SettingsState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SettingsState>
    // Shallow-merge over the defaults field by field so a partial or
    // stale-shaped record (an older version, a hand-edited value) still
    // yields a complete, well-typed SettingsState rather than `undefined`
    // fields leaking into the UI.
    return {
      profile: { ...DEFAULT_SETTINGS.profile, ...parsed.profile },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
      display: { ...DEFAULT_SETTINGS.display, ...parsed.display },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeStoredSettings(next: SettingsState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked or full — the in-memory state (held by the caller's
    // useState) is still correct for this session, it just won't persist
    // across a reload. Nothing to surface here; this is a best-effort cache.
  }
}

/**
 * Owns the Settings page's own local preference state. Backed by
 * `localStorage` on a best-effort basis (every access is try/catch-guarded),
 * with in-memory defaults so the page renders and works even when storage is
 * blocked or throws. Nothing here touches finance state — see `useFinance`
 * for that, read-only, elsewhere on this page.
 */
export function useSettings(gateway?: SettingsGateway) {
  const [settings, setSettings] = useState<SettingsState>(() => readStoredSettings())

  useEffect(() => {
    if (!gateway) return
    let active = true
    gateway.load().then((next) => { if (active) setSettings(next) }).catch(() => undefined)
    return () => { active = false }
  }, [gateway])

  const persist = useCallback((next: SettingsState) => {
    setSettings(next)
    if (gateway) void gateway.save(next).catch(() => undefined)
    else writeStoredSettings(next)
  }, [gateway])

  const saveProfile = useCallback(
    (profile: UserProfile) => {
      persist({ ...settings, profile })
    },
    [settings, persist],
  )

  const setNotification = useCallback(
    <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
      persist({ ...settings, notifications: { ...settings.notifications, [key]: value } })
    },
    [settings, persist],
  )

  const setDisplayPreference = useCallback(
    <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) => {
      persist({ ...settings, display: { ...settings.display, [key]: value } })
    },
    [settings, persist],
  )

  const resetToDefaults = useCallback(() => {
    persist(DEFAULT_SETTINGS)
  }, [persist])

  return { settings, saveProfile, setNotification, setDisplayPreference, resetToDefaults }
}

/**
 * The shape `useSettings()` returns. Exported so `Settings.tsx` can call the
 * hook exactly once (state backed by `useState` isn't shared across separate
 * calls) and type the props it passes down to each section from a single
 * source of truth.
 */
export type UseSettingsResult = ReturnType<typeof useSettings>
