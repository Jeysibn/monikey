import type { ReactNode } from 'react'
import { cn } from 'cn'

import { Card } from '@/components/ui/card'

/*
 * One headline figure on the Dashboard: a label, the figure, and one line saying exactly what it counts.
 * The figure's tone is words and ink (never red for spending); a deficit says "Deficit" in its label.
 */
export function KpiCard({ label, value, caption, tone = 'plain' }: { label: string; value: ReactNode; caption: string; tone?: 'plain' | 'income' | 'debt' }) {
  return (
    <Card className="grid min-w-0 content-start gap-1 p-4 md:p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-[1.5rem] leading-[1.15] font-semibold tracking-[-0.015em] tabular-nums md:text-[1.75rem]', tone === 'income' && 'text-income', tone === 'debt' && 'text-debt')}>{value}</p>
      <p className="text-[0.8125rem] leading-snug text-muted-foreground">{caption}</p>
    </Card>
  )
}
