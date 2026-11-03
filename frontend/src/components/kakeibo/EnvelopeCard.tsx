import { BookOpen, House, Sparkles, TriangleAlert, Umbrella, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'

import { MoneyText } from '@/components/MoneyText'
import { ENVELOPE_INFO, envelopeProgress } from '@/lib/kakeibo'
import { formatPeso } from '@/lib/money'
import type { KakeiboEnvelope, KakeiboEnvelopeReport } from '@/types'

/*
 * One Kakeibo envelope: what it is for, what was spent, the limit, and what remains, all as the server
 * reported them. The bar shows the share of the limit spent; it is never coloured red (spending is not a
 * fault), and an envelope over its limit says so in words, with an icon, and keeps the negative remainder.
 * A zero limit or a month with no plan gets no bar, because there is no share to show.
 */
const ICON: Record<KakeiboEnvelope, LucideIcon> = { needs: House, wants: Sparkles, culture: BookOpen, unexpected: Umbrella }

export function EnvelopeCard({ envelope, report, className }: { envelope: KakeiboEnvelope; report: KakeiboEnvelopeReport; className?: string }) {
  const { label, meaning } = ENVELOPE_INFO[envelope]
  const Icon = ICON[envelope]
  const { state, percent } = envelopeProgress(report)
  const titleId = `envelope-${envelope}-title`

  return (
    <article aria-labelledby={titleId} className={cn('min-w-0 rounded-card border border-border bg-card p-5', className)}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="text-base leading-tight font-semibold">{label}</h3>
          <p className="truncate text-sm text-muted-foreground">{meaning}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-[0.8125rem] font-medium text-muted-foreground">Spent</dt>
          <dd>
            <MoneyText wrap centavos={report.spent} className="block text-[1.3125rem] leading-[1.2] font-semibold tracking-[-0.015em]" />
          </dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="text-[0.8125rem] font-medium text-muted-foreground">{state === 'no-plan' ? 'Limit' : 'Remaining'}</dt>
          <dd>
            {report.remaining === null ? (
              <span className="block text-[0.9375rem] leading-[1.9] text-muted-foreground">Not planned</span>
            ) : (
              <MoneyText
                wrap
                centavos={report.remaining}
                className={cn('block text-[1.3125rem] leading-[1.2] font-semibold tracking-[-0.015em]', state === 'over' && 'text-debt')}
              />
            )}
          </dd>
        </div>
      </dl>

      {percent !== null && report.limit !== null && (
        <div
          role="img"
          aria-label={`${formatPeso(report.spent)} of ${formatPeso(report.limit)} spent`}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary"
        >
          <div className={cn('h-full rounded-full', state === 'over' ? 'bg-debt' : 'bg-primary')} style={{ width: `${percent}%` }} />
        </div>
      )}

      {state !== 'no-plan' && <p className={cn('mt-2.5 text-sm leading-snug', state === 'over' ? 'font-medium text-debt-ink' : 'text-muted-foreground')}>
        {state === 'no-limit' && (report.spent > 0 ? 'Spent without a limit set (₱0.00 planned).' : 'No limit set (₱0.00 planned).')}
        {state === 'within' && report.limit !== null && `${percent}% of ${formatPeso(report.limit)}`}
        {state === 'at-limit' && report.limit !== null && `Limit of ${formatPeso(report.limit)} reached.`}
        {state === 'over' && report.limit !== null && report.remaining !== null && (
          <>
            <TriangleAlert aria-hidden="true" className="mr-1 inline size-4 align-[-3px]" />
            {formatPeso(-report.remaining)} over the {formatPeso(report.limit)} limit.
          </>
        )}
      </p>}
    </article>
  )
}
