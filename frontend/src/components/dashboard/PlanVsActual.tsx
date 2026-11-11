import { TriangleAlert } from 'lucide-react'

import { ChartFrame } from '@/components/charts/ChartFrame'
import { ENVELOPES, ENVELOPE_INFO } from '@/lib/kakeibo'
import { envelopeColor, UNCLASSIFIED_COLOR } from '@/lib/chartColors'
import { formatPeso } from '@/lib/money'
import type { AnalyticsReport, KakeiboEnvelope } from '@/types'

/*
 * Monthly Kakeibo, plan versus actual, for the Reporting Month (spec 4.3): for each of the four envelopes the
 * planned limit (a tick on the track) and what was actually spent (the bar), in words as well as length: "Spent",
 * "Limit", "Remaining" or "Over by". Plan and actual are different things and are labelled as such. Expenses with
 * no envelope are shown apart and still count in total expenses. For the current month the actuals are "so far".
 * Remaining is the server's per-envelope arithmetic, repeated here only as whole-centavo subtraction for display.
 */
type Row = AnalyticsReport['kakeibo'][number]

export function PlanVsActual({ row, monthName, monthToDate }: { row: Row | undefined; monthName: string; monthToDate: boolean }) {
  if (!row) return null
  const saved = row.planStatus === 'saved' && row.limits !== null
  const scale = Math.max(1, ...ENVELOPES.flatMap((key) => [row.actuals[key], saved ? row.limits![key] : 0]))
  const totalSpent = ENVELOPES.reduce((sum, key) => sum + row.actuals[key], 0)
  const noneSpent = totalSpent === 0 && row.unclassified === 0
  const so = monthToDate ? ' so far' : ''
  const status =
    row.planStatus === 'saved' ? null
    : row.planStatus === 'legacy_unknown' ? `The ${monthName} plan predates plan tracking and has not been confirmed, so no comparison is shown. Actual spending is below.`
    : `No plan was saved for ${monthName}. Actual spending by envelope is shown without limits.`

  const tableRows = [
    ...ENVELOPES.map((key) => {
      const limit = saved ? row.limits![key] : null
      return [ENVELOPE_INFO[key].label, limit === null ? 'Not planned' : formatPeso(limit), formatPeso(row.actuals[key]), limit === null ? '—' : formatPeso(limit - row.actuals[key])]
    }),
    ['Not classified', 'Not planned', formatPeso(row.unclassified), '—'],
  ]

  return (
    <ChartFrame
      title={`Kakeibo: plan vs actual${monthToDate ? ' (so far)' : ''}`}
      description={`${monthName}. The plan is a monthly limit per envelope; actual is what was recorded${monthToDate ? ' so far this month' : ''}.`}
      table={{ caption: `Kakeibo plan versus actual for ${monthName}`, columns: ['Envelope', 'Planned limit', `Actual${so}`, 'Remaining'], rows: tableRows }}
      empty={noneSpent && !saved ? `No expenses recorded in ${monthName} and no saved plan.` : undefined}
    >
      {status && <p className="rounded-control bg-surface-raised px-3.5 py-2.5 text-sm text-muted-foreground">{status}</p>}
      <ul className="m-0 grid list-none gap-4 p-0">
        {ENVELOPES.map((key: KakeiboEnvelope) => {
          const limit = saved ? row.limits![key] : null
          const spent = row.actuals[key]
          const over = limit !== null && spent > limit
          return (
            <li key={key} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: envelopeColor(key) }} />
                  {ENVELOPE_INFO[key].label}
                </span>
                <span className="text-sm tabular-nums">
                  <span className="sr-only">Spent </span>{formatPeso(spent)}
                  {limit !== null ? <span className="text-muted-foreground"> of {formatPeso(limit)}</span> : <span className="text-muted-foreground"> · no limit</span>}
                </span>
              </div>
              <div aria-hidden="true" className="relative mt-1.5 h-3 rounded-full bg-secondary">
                <div className="h-3 rounded-full" style={{ width: `${Math.min(100, (spent / scale) * 100)}%`, backgroundColor: over ? 'var(--debt)' : envelopeColor(key), minWidth: spent > 0 ? 3 : 0 }} />
                {limit !== null && <span className="absolute top-[-3px] h-[18px] w-0.5 bg-foreground" style={{ left: `calc(${Math.min(100, (limit / scale) * 100)}% - 1px)` }} />}
              </div>
              {limit !== null && (
                <p className={over ? 'mt-1 flex items-center gap-1 text-sm font-medium text-debt-ink' : 'mt-1 text-sm text-muted-foreground'}>
                  {over ? (
                    <><TriangleAlert aria-hidden="true" className="size-4" />Over by {formatPeso(spent - limit)}</>
                  ) : (
                    <>Remaining {formatPeso(limit - spent)}</>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="flex flex-wrap items-center justify-between gap-x-3 rounded-control bg-surface-raised px-3.5 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: UNCLASSIFIED_COLOR }} />
          Not classified
        </span>
        <span className="tabular-nums">{formatPeso(row.unclassified)}</span>
        <span className="w-full text-[0.8125rem] text-muted-foreground">Still counted in total expenses; these have no envelope yet.</span>
      </p>
      <p className="text-[0.8125rem] text-muted-foreground">A black tick marks each planned limit. Savings targets are goals, not spending, and are not shown here.</p>
    </ChartFrame>
  )
}
