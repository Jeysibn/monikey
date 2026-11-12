import { useMemo, useState } from 'react'

import { CategoryBadge } from '@/components/CategoryBadge'
import { ChartFrame, type LegendItem } from '@/components/charts/ChartFrame'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { Donut } from '@/components/charts/Donut'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock } from '@/components/ErrorBlock'
import { Moki } from '@/components/Moki'
import type { DataSource } from '@/dataSource'
import { categoryMarkColor, envelopeColor, EXPENSE_COLOR, UNCLASSIFIED_COLOR } from '@/lib/chartColors'
import { formatShare } from '@/lib/chartMath'
import {
  ANALYSIS_PRESETS, analysisRange, daysBetween, firstDayOf, formatDateLong, formatDateShort, rangeProblem, sortRows, WEEKDAY_NAMES,
  type AnalysisPreset, type CategorySort,
} from '@/lib/dashboardRanges'
import { ENVELOPES, ENVELOPE_INFO } from '@/lib/kakeibo'
import { formatPeso } from '@/lib/money'
import { useResource } from '@/useResource'
import type { AccountsSnapshot } from '@/types'
import type { Resource } from '@/useResource'

/*
 * Analysis range (spec 4.1 B): the breakdowns that answer "where did it go" over any period. It depends ONLY on
 * the range and account chosen here (never on the Reporting Month above), and a bad range is explained and never
 * sent to the server. Every chart has a table with the same numbers. Daily and weekday figures count every
 * calendar day in the range, including days with nothing spent; weekday averages divide by how often that
 * weekday occurs. "Daily Kakeibo" is what was actually spent, not a daily budget.
 */
const SELECT = 'h-11 w-full min-w-0 cursor-pointer rounded-control border border-input bg-card px-3 text-[0.9375rem] text-foreground'

export function AnalysisSection({ today, source, version, accounts }: { today: string; source: DataSource; version: number; accounts: Resource<AccountsSnapshot> }) {
  const [preset, setPreset] = useState<AnalysisPreset>('this-month')
  const [custom, setCustom] = useState({ startDate: firstDayOf(today.slice(0, 7)), endDate: today })
  const [accountId, setAccountId] = useState<number | null>(null)
  const [sort, setSort] = useState<CategorySort>('high')

  const range = useMemo(() => analysisRange(preset, custom, today), [preset, custom, today])
  const problem = rangeProblem(range, today)
  const report = useResource(
    problem ? null : `analysis:${range.startDate}:${range.endDate}:${accountId}`,
    (signal) => source.loadAnalytics({ ...range, accountId, detail: true }, signal),
    version,
  )
  const data = !problem && report.data && report.data.startDate === range.startDate && report.data.endDate === range.endDate && report.data.accountId === accountId ? report.data : undefined
  const accountName = accountId === null ? null : accounts.data?.accounts.find((a) => a.id === accountId)?.name ?? null

  const categoryRows = useMemo(() => (data ? sortRows(data.categories.map((c, i) => ({ ...c, amount: c.expenses, color: categoryMarkColor(c.colorKey, i) })), sort) : []), [data, sort])
  const totalSpent = data?.totals.expenses ?? 0

  return (
    <section aria-labelledby="dashboard-analysis-title" className="grid gap-4 md:gap-5">
      <div>
        <h2 id="dashboard-analysis-title" className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] md:text-xl">Spending analysis</h2>
        <p className="text-sm text-muted-foreground">Any period you choose. It does not change the monthly summary above.</p>
      </div>

      <div className="grid gap-3 rounded-card border border-border bg-card p-4 md:p-5">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Date range
            <select aria-label="Analysis date range" value={preset} onChange={(e) => setPreset(e.target.value as AnalysisPreset)} className={SELECT}>
              {ANALYSIS_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Account
            <select aria-label="Filter the analysis by account" value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)} className={SELECT}>
              <option value="">All accounts</option>
              {(accounts.data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Start date
              <input type="date" aria-label="Analysis start date" value={custom.startDate} max={custom.endDate || today} onChange={(e) => setCustom((c) => ({ ...c, startDate: e.target.value }))} className={SELECT} />
            </label>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              End date
              <input type="date" aria-label="Analysis end date" value={custom.endDate} max={today} onChange={(e) => setCustom((c) => ({ ...c, endDate: e.target.value }))} className={SELECT} />
            </label>
          </div>
        )}
        {problem ? (
          <p role="alert" className="text-sm font-medium text-error-ink">{problem}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {formatDateLong(range.startDate)} to {formatDateLong(range.endDate)} · {daysBetween(range.startDate, range.endDate)} days (Manila dates, both included)
            {accountName ? ` · ${accountName} only` : ''}
          </p>
        )}
      </div>

      {problem ? null : report.error && !data ? (
        <ErrorBlock mascot what="the spending analysis" updatedAt={report.updatedAt} onRetry={report.retry} focusAfter="#dashboard-analysis-title" />
      ) : !data || !data.daily || !data.weekdays || !data.insights ? (
        <div role="status" aria-label="Loading the spending analysis" className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" />)}
        </div>
      ) : (
        <>
          {report.stale && <p role="status" className="text-sm text-muted-foreground">Updating the analysis…</p>}
          {totalSpent === 0 ? (
            <EmptyState
              message="No spending recorded in this date range. Pick a longer range, or add an expense."
              illustration={<Moki pose="presenting" size="medium" />}
            />
          ) : (
          <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
            <ChartFrame
              title="Spending by category"
              description="Where your expenses went in this range. Archived categories are included."
              actions={
                <label className="text-sm">
                  <span className="sr-only">Sort categories</span>
                  <select aria-label="Sort categories by" value={sort} onChange={(e) => setSort(e.target.value as CategorySort)} className="h-11 cursor-pointer rounded-control border border-input bg-card px-3 text-[0.9375rem]">
                    <option value="high">Highest first</option>
                    <option value="low">Lowest first</option>
                    <option value="az">Name A–Z</option>
                  </select>
                </label>
              }
              table={{ caption: 'Spending by category', columns: ['Category', 'Spent', 'Share'], rows: categoryRows.map((c) => [`${c.name}${c.archived ? ' (archived)' : ''}`, formatPeso(c.amount), formatShare(totalSpent === 0 ? 0 : c.amount / totalSpent)]) }}
              empty={categoryRows.length === 0 ? 'No expenses recorded in this date range.' : undefined}
            >
              <div className="grid items-center gap-4 min-[520px]:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[auto_minmax(0,1fr)]">
                <Donut values={categoryRows.map((c) => c.amount)} colors={categoryRows.map((c) => c.color)} centerLabel="Total spent" total={totalSpent} />
                <ul className="m-0 grid min-w-0 list-none gap-2 p-0" aria-label="Categories">
                  {categoryRows.map((c) => (
                    <li key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5">
                      <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: c.color }} />
                      <span className="flex min-w-0 items-center gap-2">
                        <CategoryBadge iconKey={c.iconKey} colorKey={c.colorKey} size="sm" />
                        <span className="min-w-0 truncate font-medium">{c.name}{c.archived && <span className="ml-1.5 text-xs font-normal text-muted-foreground">archived</span>}</span>
                      </span>
                      <span className="text-right text-sm tabular-nums">{formatPeso(c.amount)}<span className="ml-1.5 text-muted-foreground">{formatShare(totalSpent === 0 ? 0 : c.amount / totalSpent)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartFrame>

            <ChartFrame
              title="Daily spending"
              description="Every day in the range, including days with nothing spent."
              legend={[{ label: 'Spent that day', color: EXPENSE_COLOR }]}
              table={{ caption: 'Spending for each day in the range', columns: ['Date', 'Spent'], rows: data.daily.map((d) => [formatDateLong(d.date), formatPeso(d.expenses)]) }}
            >
              <ColumnChart
                ariaLabel={`Spending for each of the ${data.daily.length} days from ${formatDateLong(range.startDate)} to ${formatDateLong(range.endDate)}`}
                labels={data.daily.map((d) => formatDateLong(d.date))}
                axisLabels={data.daily.map((d) => (data.daily!.length <= 31 ? String(Number(d.date.slice(8))) : formatDateShort(d.date)))}
                series={[{ key: 'spent', label: 'Spent', color: EXPENSE_COLOR, values: data.daily.map((d) => d.expenses) }]}
              />
            </ChartFrame>

            <ChartFrame
              title="Spending by weekday"
              description="The average for each weekday. A weekday's total is divided by how many of that weekday are in the range, days with no spending included."
              legend={[{ label: 'Average spent', color: EXPENSE_COLOR }]}
              table={{ caption: 'Average spending by weekday', columns: ['Weekday', 'Average', 'Total', 'Days in range'], rows: data.weekdays.map((w) => [WEEKDAY_NAMES[w.weekday - 1]!, formatPeso(w.average), formatPeso(w.total), String(w.occurrences)]) }}
            >
              <ColumnChart
                ariaLabel="Average spending for each weekday in the range"
                labels={data.weekdays.map((w) => `${WEEKDAY_NAMES[w.weekday - 1]} (${w.occurrences} in range)`)}
                axisLabels={data.weekdays.map((w) => WEEKDAY_NAMES[w.weekday - 1]!.slice(0, 3))}
                series={[{ key: 'average', label: 'Average', color: EXPENSE_COLOR, values: data.weekdays.map((w) => w.average) }]}
              />
            </ChartFrame>

            <ChartFrame
              title="Daily Kakeibo spending"
              description="What was actually spent each day, by envelope. This is spending, not a daily budget."
              legend={[...ENVELOPES.map((key): LegendItem => ({ label: ENVELOPE_INFO[key].label, color: envelopeColor(key) })), { label: 'Not classified', color: UNCLASSIFIED_COLOR }]}
              table={{
                caption: 'Daily spending by Kakeibo envelope',
                columns: ['Date', ...ENVELOPES.map((key) => ENVELOPE_INFO[key].label), 'Not classified', 'Total'],
                rows: data.daily.map((d) => [formatDateLong(d.date), formatPeso(d.needs), formatPeso(d.wants), formatPeso(d.culture), formatPeso(d.unexpected), formatPeso(d.unclassified), formatPeso(d.expenses)]),
              }}
            >
              <ColumnChart
                stacked
                ariaLabel={`Daily spending by Kakeibo envelope from ${formatDateLong(range.startDate)} to ${formatDateLong(range.endDate)}`}
                labels={data.daily.map((d) => formatDateLong(d.date))}
                axisLabels={data.daily.map((d) => (data.daily!.length <= 31 ? String(Number(d.date.slice(8))) : formatDateShort(d.date)))}
                series={[
                  ...ENVELOPES.map((key) => ({ key, label: ENVELOPE_INFO[key].label, color: envelopeColor(key), values: data.daily!.map((d) => d[key]) })),
                  { key: 'unclassified', label: 'Not classified', color: UNCLASSIFIED_COLOR, values: data.daily.map((d) => d.unclassified) },
                ]}
              />
            </ChartFrame>
          </div>
          )}

          <section aria-labelledby="dashboard-insights-title" className="grid gap-3">
            <h3 id="dashboard-insights-title" className="text-base font-semibold">More insights</h3>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Average daily spending" value={formatPeso(data.insights.averageDailySpending)} caption={`All ${data.insights.days} days, including days with no spending.`} />
              <KpiCard label="Expense transactions" value={String(data.insights.expenseTransactions)} caption="Expense entries only, not income, payments or transfers." />
              <KpiCard
                label="Highest spending day"
                value={data.insights.highestDay ? formatPeso(data.insights.highestDay.expenses) : 'No spending'}
                caption={data.insights.highestDay ? formatDateLong(data.insights.highestDay.date) : 'Nothing was spent in this range.'}
              />
              <KpiCard label="Days with no spending" value={`${data.insights.zeroSpendDays} of ${data.insights.days}`} caption="Calendar days with ₱0.00 of expenses." />
            </div>
            {categoryRows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Top category: <span className="font-semibold text-foreground">{sortRows(categoryRows, 'high')[0]!.name}</span> ({formatPeso(sortRows(categoryRows, 'high')[0]!.amount)}).
              </p>
            )}
          </section>
        </>
      )}
    </section>
  )
}
