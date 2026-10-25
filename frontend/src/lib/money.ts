import type { Centavos } from '../types.ts'

/*
 * The only place peso amounts are turned into text.
 * Amounts are whole centavos. The minus sign is the true minus (U+2212) and it goes before the peso
 * sign, e.g. "−₱385.00". Components also set `font-variant-numeric: tabular-nums` (see index.css).
 */
const MINUS = '−'

/**
 * The largest amount the client will hold: 2^52 − 1 centavos = ₱45,035,996,273,704.95. Any two accepted amounts can
 * be added or subtracted without leaving the range where integers are exact (at most 2^53 − 2, a safe integer), so the display-only
 * arithmetic (previews, estimates) is always exact. A value outside this range is a contract error, never rounded.
 */
export const MAX_MONEY_CENTAVOS = 2 ** 52 - 1
export const isMoney = (centavos: number): boolean => Number.isSafeInteger(centavos) && Math.abs(centavos) <= MAX_MONEY_CENTAVOS

export type AmountKind = 'income' | 'expense' | 'payment' | 'debt' | 'plain'

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "₱33,146.25". Negative amounts print as "−₱1,200.00"; zero prints as "₱0.00". */
export function formatPeso(centavos: Centavos): string {
  if (!isMoney(centavos)) {
    throw new RangeError(`Money must be whole centavos within ±${MAX_MONEY_CENTAVOS}, got ${centavos}`)
  }
  const abs = Math.abs(centavos)
  const text = `₱${groupThousands(Math.trunc(abs / 100))}.${String(abs % 100).padStart(2, '0')}`
  return centavos < 0 ? MINUS + text : text
}

/**
 * Income gets "+", an expense gets "−", and everything else (card payments, debt, plain figures)
 * has no sign. Zero never gets a sign: a zero is neither a gain nor a loss ("₱0.00").
 * Pass the positive amount stored on the transaction.
 */
export function formatSigned(centavos: Centavos, kind: AmountKind): string {
  if (centavos === 0) return formatPeso(0)
  if (kind === 'income') return '+' + formatPeso(Math.abs(centavos))
  if (kind === 'expense') return MINUS + formatPeso(Math.abs(centavos))
  return formatPeso(centavos)
}
