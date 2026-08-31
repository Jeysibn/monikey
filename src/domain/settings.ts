// Domain types for the Settings page's own local preference store.
//
// This is deliberately separate from `domain/finance.ts` (out of bounds for
// this page): nothing here is finance state, nothing here is mutated through
// `useFinance()`, and none of it is persisted by the finance repository.
// It describes only what `useSettings` reads and writes to
// `window.localStorage` under the `monikey.settings.v1` key.

/** Local, mock-only profile — there is no auth backend behind this. */
export interface UserProfile {
  displayName: string
  email: string
}

/**
 * Preferences only — no delivery pipeline exists behind any of these today.
 * Turning one on records the user's intent; nothing actually sends mail or
 * schedules a push notification yet.
 */
export interface NotificationPreferences {
  billDueReminders: boolean
  budgetNearLimitWarnings: boolean
  weeklySummaryEmail: boolean
}

/**
 * The one preference in this group that is genuinely wired up today.
 * Currency/locale is intentionally NOT modeled here — see `utils/currency.ts`:
 * that configuration is module-level and non-reactive, so a working switcher
 * needs a `CurrencyProvider` this app doesn't have yet. It stays a disabled
 * "Coming soon" control in the UI rather than a field in this store.
 */
export interface DisplayPreferences {
  /**
   * Whether amounts shown on this Settings page drop cents (still routed
   * through `formatMoney({ withCents: false })` — never a second formatter).
   * Scoped to this page only: it is a genuinely working local preference,
   * not an app-wide setting, because wiring it into every other page's
   * `formatMoney` calls would mean editing files outside this page's
   * ownership.
   */
  hideCents: boolean
}

export interface SettingsState {
  profile: UserProfile
  notifications: NotificationPreferences
  display: DisplayPreferences
}
