// One currency configuration for the whole app. Every amount shown in the
// UI, in tests, and in form previews should go through this module so a
// future user-configurable currency/locale setting only has to change one
// place. Default is Philippine peso, matching the mock dataset's BPI/BDO/
// GCash/Maya accounts and PHP-denominated sample spending.

export interface CurrencyConfig {
  locale: string
  currency: string
}

// Honest scope (TR-010): this configuration is MODULE-LEVEL AND NON-REACTIVE.
// `formatMoney` is a plain function, not a hook, and nothing subscribes to
// this variable — so calling `setCurrencyConfig` at runtime changes only the
// amounts formatted *after* the next render that happens to occur for some
// other reason. It does NOT re-render the app, and half the screen can end
// up in the old currency.
//
// Runtime currency switching is therefore explicitly UNSUPPORTED until a
// Settings page exists. Making it work means moving this config into React
// state/context (a `CurrencyProvider` + `useMoneyFormatter()` hook) so that
// changing it re-renders every consumer — the same shape the app clock uses
// today (`AppClock`, injected at the root in `main.tsx`). `setCurrencyConfig`
// is kept only for one-time configuration before the first render (and for
// tests); it is not a user-facing setting hook.
let currencyConfig: CurrencyConfig = { locale: 'en-PH', currency: 'PHP' }

/**
 * Sets the app-wide currency/locale. Intended for one-time setup before the
 * first render, or for tests. Calling this while the app is running does not
 * re-render anything — see the note above.
 */
export function setCurrencyConfig(config: CurrencyConfig): void {
  currencyConfig = config
}

export function getCurrencyConfig(): CurrencyConfig {
  return currencyConfig
}

export function formatMoney(value: number, opts: { withCents?: boolean } = {}): string {
  const withCents = opts.withCents ?? true
  const { locale, currency } = currencyConfig
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(value)
}
