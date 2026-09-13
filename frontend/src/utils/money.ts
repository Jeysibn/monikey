// Centralized money-input parsing so every finance form rejects the same
// malformed input the same way, instead of each form rolling its own
// `Number(...)` check (see SR-007). This is a pure function — the forms are
// responsible for keeping the user's raw typed text in state while editing
// and only calling this at validation/submit time, so a bad keystroke never
// silently rewrites what the user meant (e.g. stripping a leading `-`).
//
// Accepted formats: an optional leading `-` (rejected unless the caller
// opts in via `allowNegative`), digits with optional comma thousands
// separators (`1,250.75`), and at most one decimal point with at most two
// decimal places. Scientific notation (`1e6`), `Infinity`/`NaN`, blank
// input, and anything with stray characters are all rejected with a
// specific message rather than silently coerced.
export type MoneyParseResult = { ok: true; value: number } | { ok: false; error: string }
export type MinorMoneyParseResult = { ok: true; value: bigint } | { ok: false; error: string }

/** Read canonical minor units. The numeric fallback exists only for mock and
 * legacy state while domains migrate; API-backed state supplies the string. */
export function exactMinor(value: string | undefined, legacyValue: number): bigint {
  if (value !== undefined) {
    if (!/^-?\d+$/.test(value)) throw new TypeError('Minor units must be a decimal integer string.')
    return BigInt(value)
  }
  if (!Number.isFinite(legacyValue)) throw new TypeError('Legacy money value must be finite.')
  const minor = Math.round(legacyValue * 100)
  if (!Number.isSafeInteger(minor)) throw new RangeError('Legacy money value exceeds the safe frontend range.')
  return BigInt(minor)
}

/** Checked compatibility boundary for visual components that still require a
 * major-unit number. Authoritative aggregation must happen before this call. */
export function exactMinorToMajorNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Minor-unit value exceeds the safe frontend calculation range.')
  }
  return Number(value) / 100
}

/**
 * Boundary for the legacy frontend domain, whose calculated money fields are
 * still JavaScript numbers. API values stay as decimal strings until this
 * check proves their minor-unit integer can be represented without loss.
 */
export function minorUnitsToMajorNumber(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new TypeError('Minor units must be a decimal integer string.')
  const minor = BigInt(value)
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Minor-unit value exceeds the safe frontend calculation range.')
  }
  return Number(minor) / 100
}

/** Non-authoritative read-model fallback. Exact `*Minor` fields remain the
 * source of truth; this value exists only for legacy components that still
 * require a number to render or position a chart. */
export function minorUnitsToMajorDisplayNumber(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new TypeError('Minor units must be a decimal integer string.')
  const display = Number(BigInt(value)) / 100
  if (!Number.isFinite(display)) throw new RangeError('Minor-unit value cannot be represented for display.')
  return display
}

/** Converts an existing numeric domain value to an exact API minor-unit string. */
export function majorNumberToMinorUnits(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError('Money value must be finite.')
  const minor = Math.round(value * 100)
  if (!Number.isSafeInteger(minor)) throw new RangeError('Money value exceeds the safe frontend transport range.')
  return minor.toString()
}

/** Numeric boundary for percentages, chart coordinates, and form previews. */
export function boundedDecimalToNumber(value: string, bounds: { min: number; max: number }): number {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) throw new TypeError('Value must be a plain decimal string.')
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < bounds.min || numeric > bounds.max) {
    throw new RangeError('Decimal value exceeds the allowed UI calculation range.')
  }
  return numeric
}

/** Exact minor-unit parser for API boundaries; never passes through Number. */
export function parseMinorUnitInput(raw: string, opts: { allowNegative?: boolean } = {}): MinorMoneyParseResult {
  const trimmed = raw.trim().replace(/,/g, '')
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  if (!unsigned || (negative && !opts.allowNegative) || !/^\d+(?:\.\d{0,2})?$/.test(unsigned)) {
    return { ok: false, error: negative ? 'Amount can’t be negative.' : 'Enter a valid amount.' }
  }
  const [whole, fraction = ''] = unsigned.split('.')
  const value = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  return { ok: true, value: negative ? -value : value }
}

export function parseMoneyInput(raw: string, opts: { allowNegative?: boolean } = {}): MoneyParseResult {
  const allowNegative = opts.allowNegative ?? false
  const trimmed = raw.trim()

  if (trimmed === '') {
    return { ok: false, error: 'Enter an amount.' }
  }
  if (/e/i.test(trimmed)) {
    return { ok: false, error: 'Scientific notation isn’t supported — enter a plain number.' }
  }
  if (/[^0-9,.-]/.test(trimmed)) {
    return { ok: false, error: 'Enter a valid amount.' }
  }

  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  if (unsigned === '' || unsigned.includes('-')) {
    return { ok: false, error: 'Enter a valid amount.' }
  }
  if (negative && !allowNegative) {
    return { ok: false, error: 'Amount can’t be negative.' }
  }

  const parts = unsigned.split('.')
  if (parts.length > 2) {
    return { ok: false, error: 'Use a single decimal point.' }
  }
  const [wholeRaw, fraction = ''] = parts
  if (fraction.length > 2) {
    return { ok: false, error: 'Amounts can have at most 2 decimal places.' }
  }
  if (wholeRaw.includes(',') && !/^\d{1,3}(,\d{3})*$/.test(wholeRaw)) {
    return { ok: false, error: 'Enter a valid amount.' }
  }
  const whole = wholeRaw.replace(/,/g, '')
  if (whole !== '' && !/^\d+$/.test(whole)) {
    return { ok: false, error: 'Enter a valid amount.' }
  }
  if (whole === '' && fraction === '') {
    return { ok: false, error: 'Enter a valid amount.' }
  }

  const numeric = Number(`${whole || '0'}.${fraction || '0'}`)
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: 'Enter a valid amount.' }
  }

  return { ok: true, value: negative ? -numeric : numeric }
}
