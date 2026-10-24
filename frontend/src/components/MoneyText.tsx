import { cn } from 'cn'

import { formatSigned, type AmountKind } from '@/lib/money'
import type { Centavos } from '@/types'

/*
 * Shows one peso amount. Formatting lives in lib/money.ts; this only adds the colour for the kind:
 * income green, debt orange, everything else stays in ink (spending is never red).
 * `font-variant-numeric: tabular-nums` comes from the base style in index.css.
 */
const colour: Record<AmountKind, string> = {
  income: 'text-income',
  debt: 'text-debt',
  expense: '',
  payment: '',
  plain: '',
}

/*
 * Very large amounts (the database allows up to ₱9,999,999,999.99) must not push a screen sideways on a
 * 320px phone. Past 12 characters the figure gets smaller in steps, and only then may it break between
 * digits as a last resort. The figure never goes below 0.75rem (12px at the default size), so even the
 * largest amount stays readable. Ordinary amounts are never touched: they stay on one line at full size.
 */
const fitScale = (length: number): number => (length <= 12 ? 1 : length <= 14 ? 0.85 : length <= 16 ? 0.72 : 0.6)

export function MoneyText({
  centavos,
  kind = 'plain',
  className,
  wrap = false,
}: {
  centavos: Centavos
  kind?: AmountKind
  className?: string
  wrap?: boolean // may break between digits when even the smallest size cannot fit (big text settings); for figures that own a whole row
}) {
  const text = formatSigned(centavos, kind)
  const scale = fitScale(text.length)
  if (scale === 1 && !wrap) return <span className={cn('whitespace-nowrap', colour[kind], className)}>{text}</span>
  return (
    <span className={cn('[overflow-wrap:anywhere]', colour[kind], className)}>
      <span style={scale < 1 ? { fontSize: `max(0.75rem, ${scale}em)` } : undefined}>{text}</span>
    </span>
  )
}
