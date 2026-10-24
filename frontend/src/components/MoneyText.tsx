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

export function MoneyText({
  centavos,
  kind = 'plain',
  className,
}: {
  centavos: Centavos
  kind?: AmountKind
  className?: string
}) {
  return <span className={cn('whitespace-nowrap', colour[kind], className)}>{formatSigned(centavos, kind)}</span>
}
