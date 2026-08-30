// One currency configuration for the whole app. Every amount shown in the
// UI, in tests, and in form previews should go through this module so a
// future user-configurable currency/locale setting only has to change one
// place. Default is Philippine peso, matching the mock dataset's BPI/BDO/
// GCash/Maya accounts and PHP-denominated sample spending.

export interface CurrencyConfig {
  locale: string
  currency: string
}

// Not yet exposed as a user setting — kept as a single mutable module-level
// config so that future work (a settings page) can call `setCurrencyConfig`
// without touching every call site.
let currencyConfig: CurrencyConfig = { locale: 'en-PH', currency: 'PHP' }

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
