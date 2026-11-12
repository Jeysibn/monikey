import { useMemo, useState } from 'react'

import { ChartFrame, type LegendItem } from '@/components/charts/ChartFrame'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PlanVsActual } from '@/components/dashboard/PlanVsActual'
import { ErrorBlock } from '@/components/ErrorBlock'
import { MonthSelect } from '@/components/MonthSelect'
import type { DataSource } from '@/dataSource'
import { EXPENSE_COLOR, INCOME_COLOR } from '@/lib/chartColors'
import { formatDateLong, monthShortName, reportingRange } from '@/lib/dashboardRanges'
import { monthLabel, monthOptions } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import { useResource } from '@/useResource'

/*
 * Reporting Month (spec 4.1 A): everything here is a calendar-month accounting figure and depends ONLY on the
 * month picked in this section; the Analysis range below can never change it. It asks for the months ending at
 * the reporting month (all accounts) and reads the reporting month as the last row. The current month is month
 * to date and says so. Surplus is income minus expenses for the month; it is not account cash flow.
 */
export function ReportingSection({ today, source, version }: { today: string; source: DataSource; version: number }) {
  const [month, setMonth] = useState(today.slice(0, 7))
  const range = useMemo(() => reportingRange(month, today), [month, today])
  const report = useResource(`reporting:${range.startDate}:${range.endDate}`, (signal) => source.loadAnalytics({ ...range, accountId: null }, signal), version)
  const data = report.data && report.data.startDate === range.startDate && report.data.endDate === range.endDate ? report.data : undefined
  const row = data?.months.at(-1)
  const label = monthLabel(month)
  const mtd = row ? !row.complete : false
  const through = range.endDate

  const legend: LegendItem[] = [
    { label: 'Income', color: INCOME_COLOR },
    { label: 'Expenses', color: EXPENSE_COLOR },
    ...(mtd ? [{ label: `${label} is month to date`, color: '#9AA3AF', hatched: true }] : []),
  ]
  const deficit = row ? row.surplus < 0 : false

  return (
    <section aria-labelledby="dashboard-reporting-title" className="grid gap-4 md:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="dashboard-reporting-title" className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] md:text-xl">Monthly financial summary</h2>
          <p className="text-sm text-muted-foreground">Calendar months only. It follows the month you pick here, not the analysis range or account filter below.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelect id="dashboard-month" value={month} options={monthOptions(today, 24)} onChange={setMonth} />
          {/* The monthly figures always cover every account; the account filter below belongs to the analysis only. */}
          <span data-scope="all-accounts" className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold">All accounts</span>
          {mtd && <span className="rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-secondary-foreground">Month to date, through {formatDateLong(through)}</span>}
        </div>
      </div>

      {report.error && !data ? (
        <ErrorBlock mascot what="the monthly summary" updatedAt={report.updatedAt} onRetry={report.retry} focusAfter="#dashboard-reporting-title" />
      ) : !data || !row ? (
        <div role="status" aria-label="Loading the monthly summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" />)}
        </div>
      ) : (
        <>
          {report.stale && <p role="status" className="text-sm text-muted-foreground">Updating the monthly summary…</p>}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total income" tone="income" value={formatPeso(row.income)} caption={`Income recorded in ${label}${mtd ? ' so far' : ''}`} />
            <KpiCard label="Total expenses" value={formatPeso(row.expenses)} caption="Includes card purchases. Card payments and transfers are not expenses." />
            <KpiCard label={deficit ? 'Period deficit' : 'Period surplus'} tone={deficit ? 'debt' : 'plain'} value={formatPeso(row.surplus)} caption="Income minus expenses for the month. Not your account cash flow." />
            <KpiCard
              label="Expense-to-income ratio"
              value={row.expenseToIncomePercent === null ? 'Not available' : `${row.expenseToIncomePercent}%`}
              caption={row.expenseToIncomePercent === null ? `No income recorded in ${label}, so there is no ratio.` : 'Expenses as a share of income this month.'}
            />
          </div>

          <ChartFrame
            title="Income vs expenses by month"
            description={`The ${data.months.length} months up to ${label}. Whole calendar months, side by side.`}
            legend={legend}
            table={{
              caption: `Monthly income and expenses up to ${label}`,
              columns: ['Month', 'Income', 'Expenses', 'Surplus or deficit', 'Expenses ÷ income'],
              rows: data.months.map((m) => [`${monthLabel(m.month)}${m.complete ? '' : ' (month to date)'}`, formatPeso(m.income), formatPeso(m.expenses), formatPeso(m.surplus), m.expenseToIncomePercent === null ? 'n/a' : `${m.expenseToIncomePercent}%`]),
            }}
          >
            <ColumnChart
              ariaLabel={`Income and expenses for each of the ${data.months.length} months up to ${label}`}
              labels={data.months.map((m) => `${monthLabel(m.month)}${m.complete ? '' : ' (month to date)'}`)}
              axisLabels={data.months.map((m) => monthShortName(m.month))}
              partial={data.months.map((m) => !m.complete)}
              series={[
                { key: 'income', label: 'Income', color: INCOME_COLOR, values: data.months.map((m) => m.income) },
                { key: 'expenses', label: 'Expenses', color: EXPENSE_COLOR, values: data.months.map((m) => m.expenses) },
              ]}
            />
          </ChartFrame>

          <PlanVsActual row={data.kakeibo.at(-1)} monthName={label} monthToDate={mtd} />
        </>
      )}
    </section>
  )
}
