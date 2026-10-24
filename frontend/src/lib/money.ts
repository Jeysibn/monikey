import type { Centavos } from '../types.ts'

/*
 * The only place peso amounts are turned into text.
 * Amounts are whole centavos. The minus sign is the true minus (U+2212) and it goes before the peso
 * sign, e.g. "−₱385.00". Components also set `font-variant-numeric: tabular-nums` (see index.css).
 */
const MINUS = '−'

export type AmountKind = 'income' | 'expense' | 'payment' | 'debt' | 'plain'

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "₱33,146.25". Negative amounts print as "−₱1,200.00"; zero prints as "₱0.00". */
export function formatPeso(centavos: Centavos): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError(`Money must be whole centavos, got ${centavos}`)
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
