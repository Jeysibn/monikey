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
