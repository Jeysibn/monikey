import { TriangleAlert } from 'lucide-react'

import { Moki } from '@/components/Moki'
import { MoneyText } from '@/components/MoneyText'
import { monthLabel } from '@/lib/finance'
import { planProgress } from '@/lib/kakeibo'
import { formatPeso } from '@/lib/money'
import type { KakeiboMonth } from '@/types'

/*
 * The focal summary of a planned month (spec section 6.2): how much is set aside for the four envelopes, how much
 * of it has been spent in those envelopes, and what is left, with one progress bar. These cover the envelopes only.
 * The footnote says so in words: the savings target is a goal and not money saved, and expenses that have no
 * envelope are still part of the month's total expenses even though they are not in these figures.
 * It shows the server's per-envelope figures added up in whole centavos (see `planProgress`).
 */
export function PlanHero({ report }: { report: KakeiboMonth }) {
  const progress = planProgress(report)
  if (!progress || !report.plan) return null
  const label = monthLabel(report.month)
  const over = progress.remaining < 0
  const savings = report.plan.savingsTarget
  return (
    <section aria-labelledby="kakeibo-hero-title" className="min-w-0 rounded-card bg-hero p-5 text-white md:px-7 md:py-6">
      <p className="text-xs font-semibold tracking-wide text-hero-muted uppercase">Your {label} spending plan</p>
      <h2 id="kakeibo-hero-title" className="sr-only">
        Spending plan summary for {label}
      </h2>
      <p className="mt-1.5">
        <MoneyText wrap centavos={progress.allocated} className="block text-[2rem] leading-[1.1] font-bold tracking-[-0.02em] md:text-[2.25rem]" />
      </p>
      <p className="text-sm text-hero-muted">Set aside for the four envelopes</p>

      {progress.percent !== null && (
        <div
          role="img"
          aria-label={`${formatPeso(progress.classifiedSpent)} of ${formatPeso(progress.allocated)} spent in the envelopes`}
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/20"
        >
          <div className="h-full rounded-full bg-white" style={{ width: `${progress.percent}%` }} />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
        <div className="min-w-0 rounded-control border border-hero-line px-3.5 py-2.5">
          <dt className="text-[0.8125rem] text-hero-muted">Spent in envelopes</dt>
          <dd>
            <MoneyText wrap centavos={progress.classifiedSpent} className="block text-lg font-semibold" />
          </dd>
        </div>
        <div className="min-w-0 rounded-control border border-hero-line px-3.5 py-2.5">
          <dt className="text-[0.8125rem] text-hero-muted">{over ? 'Over the envelopes' : 'Left in envelopes'}</dt>
          <dd>
            <MoneyText wrap centavos={over ? -progress.remaining : progress.remaining} className="block text-lg font-semibold" />
          </dd>
        </div>
      </dl>

      {progress.overCount > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-sm font-medium text-hero-debt">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {progress.overCount === 1 ? '1 envelope is' : `${progress.overCount} envelopes are`} over its limit.
        </p>
      )}
      <p className="mt-3 text-[0.8125rem] leading-snug text-hero-muted">
        Your {formatPeso(savings)} savings target is a goal, not money already saved. Expenses without an envelope
        ({formatPeso(report.unclassifiedExpenses)}) are not in these figures but are still part of your total
        expenses of {formatPeso(report.totalExpenses)}.
      </p>
    </section>
  )
}

/*
 * A calm line under the plan summary, outside the figures: Moki gives a thumbs-up while every envelope is within
 * its limit, and a plain presenting pose, with no alarm wording, when some are over. Nothing when nothing is spent yet.
 */
export function PlanMood({ report }: { report: KakeiboMonth }) {
  const progress = planProgress(report)
  if (!progress || progress.classifiedSpent === 0) return null
  const over = progress.overCount > 0
  return (
    <p data-plan-mood={over ? 'over' : 'within'} className="mt-3 flex items-center gap-3 rounded-card border border-border bg-card px-3 py-2 text-[0.9375rem]">
      <Moki pose={over ? 'presenting' : 'thumbsUp'} size="toast" />
      <span className="min-w-0">
        {over
          ? 'Some envelopes are over their limit. Nothing is lost: the figures above show where, and you can adjust the plan any time.'
          : 'Every envelope is within its limit so far. Nice and steady.'}
      </span>
    </p>
  )
}
