import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorBlock } from '@/components/ErrorBlock'
import { PageHeader } from '@/components/PageHeader'
import { CategoryIcon } from '@/lib/categoryIcons'
import { formatPeso } from '@/lib/money'
import { useResource, type Resource } from '@/useResource'
import type { DataSource } from '@/dataSource'
import type { AccountsSnapshot, AnalyticsReport, KakeiboEnvelope } from '@/types'

type Period = 'month' | '3' | '6' | '12' | 'custom'
const ENVELOPES: { key: KakeiboEnvelope; label: string; color: string }[] = [
  { key: 'needs', label: 'Needs', color: 'bg-primary' },
  { key: 'wants', label: 'Wants', color: 'bg-income' },
  { key: 'culture', label: 'Culture', color: 'bg-debt' },
  { key: 'unexpected', label: 'Unexpected', color: 'bg-muted-foreground' },
]

function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function initialRange(today: string, period: Period, customStart: string, customEnd: string) {
  if (period === 'custom') return { startDate: customStart, endDate: customEnd }
  const count = period === 'month' ? 1 : Number(period)
  return { startDate: `${shiftMonth(today.slice(0, 7), 1 - count)}-01`, endDate: today }
}

function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatPeso(value)}</span>
}

function SummaryCard({ title, value, previous, kind }: { title: string; value: number; previous: number | null; kind: 'income' | 'expense' | 'net' }) {
  const delta = previous === null ? null : value - previous
  return <Card><CardContent className="p-2.5 md:p-5"><p className="text-sm text-muted-foreground">{title}</p><p className={`mt-1 text-xl font-semibold tracking-tight md:text-2xl ${kind === 'income' ? 'text-income-ink' : ''}`}><Money value={value} /></p>{delta !== null && <p className="mt-1 text-xs text-muted-foreground">{delta >= 0 ? 'Up' : 'Down'} <Money value={Math.abs(delta)} /> vs previous period</p>}</CardContent></Card>
}

function MonthlyChart({ data }: { data: AnalyticsReport['months'] }) {
  const max = Math.max(1, ...data.flatMap((row) => [row.income, row.expenses]))
  const hasRecords = data.some((row) => row.income !== 0 || row.expenses !== 0)
  return <div>
    {!hasRecords ? <p className="py-8 text-center text-sm text-muted-foreground">No income or expense records in this date range.</p> : <div className="space-y-3" role="img" aria-label="Monthly income and expenses bar comparison. Exact values are listed below.">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-income" />Income</span><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-primary" />Expenses</span></div>
      {data.map((row) => <div key={row.month} className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-3"><span className="text-xs text-muted-foreground">{row.month}</span><div className="space-y-1.5"><div className="h-3 rounded-full bg-secondary"><div className="h-3 rounded-full bg-income" style={{ width: `${row.income ? Math.max(2, row.income / max * 100) : 0}%` }} /></div><div className="h-3 rounded-full bg-secondary"><div className="h-3 rounded-full bg-primary" style={{ width: `${row.expenses ? Math.max(2, row.expenses / max * 100) : 0}%` }} /></div></div></div>)}
    </div>}
    {hasRecords && <div className="sr-only"><table><caption>Monthly income and expenses</caption><thead><tr><th>Month</th><th>Income</th><th>Expenses</th></tr></thead><tbody>{data.map((row) => <tr key={row.month}><th>{row.month}</th><td>{formatPeso(row.income)}</td><td>{formatPeso(row.expenses)}</td></tr>)}</tbody></table></div>}
  </div>
}

function ExpenseTrend({ data }: { data: AnalyticsReport['months'] }) {
  const max = Math.max(1, ...data.map((row) => row.expenses))
  const hasExpenses = data.some((row) => row.expenses > 0)
  const points = data.map((row, index) => `${data.length < 2 ? 50 : 8 + index * (84 / (data.length - 1))},${92 - row.expenses / max * 80}`).join(' ')
  return <div>
    {!hasExpenses ? <p className="py-8 text-center text-sm text-muted-foreground">No expense records in this date range.</p> : <>
      <svg viewBox="0 0 100 100" className="h-32 w-full overflow-visible" role="img" aria-label="Monthly expense trend. Exact values are listed below.">
        <line x1="5" y1="92" x2="95" y2="92" stroke="currentColor" className="text-border" strokeWidth="1" />
        {data.length > 1 && <polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {data.map((row, index) => <circle key={row.month} cx={data.length < 2 ? 50 : 8 + index * (84 / (data.length - 1))} cy={92 - row.expenses / max * 80} r="2.5" fill="currentColor" className="text-primary"><title>{row.month}: {formatPeso(row.expenses)}</title></circle>)}
      </svg>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>{data.map((row) => <div key={row.month} className="min-w-0 text-center"><p className="truncate text-[0.65rem] text-muted-foreground">{row.month}</p><p className="truncate text-[0.65rem] tabular-nums">{formatPeso(row.expenses)}</p></div>)}</div>
    </>}
  </div>
}

export function DashboardView({ today, source, accounts, version, onAdd, addState }: {
  today: string
  source: DataSource
  accounts: Resource<AccountsSnapshot>
  version: number
  onAdd: () => void
  addState: 'ready' | 'loading' | 'no-accounts'
}) {
  const [period, setPeriod] = useState<Period>('6')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [customStart, setCustomStart] = useState(`${shiftMonth(today.slice(0, 7), -5)}-01`)
  const [customEnd, setCustomEnd] = useState(today)
  const range = useMemo(() => initialRange(today, period, customStart, customEnd), [today, period, customStart, customEnd])
  const valid = range.startDate <= range.endDate && (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000 < 366
  const report = useResource(valid ? `analytics:${range.startDate}:${range.endDate}:${accountId}` : null, (signal) => source.loadAnalytics({ ...range, accountId }, signal), version)
  const data = report.data
  const maxCategory = Math.max(1, ...(data?.categories.map((category) => category.expenses) ?? []))
  const classifiedTotal = Math.max(0, (data?.totals.expenses ?? 0) - (data?.kakeiboTotals.unclassified ?? 0))

  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus()
  }, [])

  return <div className="space-y-5 md:space-y-6">
    <PageHeader title="Dashboard" onAdd={onAdd} addState={addState}><p className="w-full text-sm text-muted-foreground md:w-auto md:max-w-72">Explore income, spending and Kakeibo patterns from your recorded transactions.</p></PageHeader>
    <Card><CardContent className="grid grid-cols-2 items-end gap-3 p-3 md:grid-cols-[1fr_1fr_1fr] md:p-5">
      <label className="grid gap-1.5 text-sm font-medium">Date range<select aria-label="Date range" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="month">This month</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="custom">Custom range</option></select></label>
      <label className="grid gap-1.5 text-sm font-medium">Account<select aria-label="Filter analytics by account" value={accountId ?? ''} onChange={(event) => setAccountId(event.target.value ? Number(event.target.value) : null)} className="min-h-11 rounded-control border border-input bg-background px-3"><option value="">All accounts</option>{(accounts.data?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      {period === 'custom' ? <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-1"><label className="grid gap-1 text-sm">From<input aria-label="Start date" type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} className="min-h-11 min-w-0 rounded-control border border-input bg-background px-2" /></label><label className="grid gap-1 text-sm">Through<input aria-label="End date" type="date" value={customEnd} min={customStart} max={today} onChange={(event) => setCustomEnd(event.target.value)} className="min-h-11 min-w-0 rounded-control border border-input bg-background px-2" /></label></div> : <p className="col-span-2 text-sm text-muted-foreground md:col-span-1 md:pb-3">{range.startDate} through {range.endDate} (Manila dates)</p>}
    </CardContent></Card>
    {!valid && <p role="alert" className="text-sm text-destructive">Choose a valid date range of up to 366 days.</p>}
    {report.error && <ErrorBlock what="Dashboard analytics" updatedAt={report.updatedAt} onRetry={report.retry} />}
    {report.loading && !data && <div className="grid gap-3 md:grid-cols-3" role="status" aria-label="Loading analytics"><div className="h-28 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" /><div className="h-28 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" /><div className="h-28 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" /></div>}
    {report.stale && data && <p role="status" className="text-sm text-muted-foreground">Updating analytics…</p>}
    {data && <>
      <section aria-label="Financial summary" className="grid gap-3 sm:grid-cols-3"><SummaryCard title="Income" value={data.totals.income} previous={data.previousTotals?.income ?? null} kind="income" /><SummaryCard title="Expenses" value={data.totals.expenses} previous={data.previousTotals?.expenses ?? null} kind="expense" /><SummaryCard title="Net cash flow" value={data.totals.netCashFlow} previous={data.previousTotals?.netCashFlow ?? null} kind="net" /></section>
      <p className="-mt-3 text-xs text-muted-foreground">Cash flow excludes transfers and card repayments. Card purchases count once.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Income and expenses by month</CardTitle></CardHeader><CardContent><MonthlyChart data={data.months} /></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Expense trend</CardTitle></CardHeader><CardContent><ExpenseTrend data={data.months} /></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Top spending categories</CardTitle></CardHeader><CardContent>{data.categories.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No expense records in this date range.</p> : <><ul className="space-y-3">{data.categories.slice(0, 8).map((category) => <li key={category.id}><div className="w-full text-left"><span className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><CategoryIcon iconKey={category.iconKey} /><span className="truncate">{category.name}{category.archived ? ' · archived' : ''}</span></span><Money value={category.expenses} className="shrink-0" /></span><span className="block h-2 rounded-full bg-secondary"><span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.max(1.5, category.expenses / maxCategory * 100)}%` }} /></span></div></li>)}</ul>{data.categories.length > 8 && <p className="mt-3 text-xs text-muted-foreground">Showing the 8 highest categories.</p>}</>}</CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Kakeibo envelopes</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-muted-foreground">Actual expense classifications in this period{accountId !== null ? ' for the selected account' : ''}.</p><ul className="space-y-3">{ENVELOPES.map(({ key, label, color }) => { const amount = data.kakeiboTotals[key]; return <li key={key}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><Money value={amount} /></div><div className="h-2 rounded-full bg-secondary"><div className={`h-2 rounded-full ${color}`} style={{ width: `${classifiedTotal ? amount / classifiedTotal * 100 : 0}%` }} /></div></li>})}</ul><p className="mt-3 text-xs text-muted-foreground">Unclassified: {formatPeso(data.kakeiboTotals.unclassified)}</p><div className="mt-5 border-t border-border pt-4"><h3 className="mb-3 text-sm font-semibold">Plan vs actual</h3>{accountId !== null ? <p className="text-sm text-muted-foreground">Kakeibo limits cover all accounts. Clear the account filter to compare saved plans with actual spending.</p> : data.kakeibo.every((month) => month.planStatus !== 'saved') ? <p className="text-sm text-muted-foreground">No saved Kakeibo plans in this period.</p> : <div className="space-y-4">{data.kakeibo.filter((month) => month.planStatus === 'saved').map((month) => <section key={month.month} aria-label={`Kakeibo ${month.month}`}><h4 className="mb-2 text-xs font-semibold">{month.month}</h4><div className="space-y-2">{ENVELOPES.map(({ key, label, color }) => { const limit = month.limits?.[key] ?? 0; const actual = month.actuals[key]; const over = actual > limit; return <div key={key}><div className="mb-1 flex justify-between gap-2 text-xs"><span>{label}</span><span className="tabular-nums">{formatPeso(actual)} / {formatPeso(limit)}</span></div><div className="h-2 rounded-full bg-secondary"><div className={`h-2 rounded-full ${over ? 'bg-debt' : color}`} style={{ width: `${limit ? Math.min(100, actual / limit * 100) : actual ? 100 : 0}%` }} /></div>{over && <p className="mt-1 text-xs text-debt">Over plan by {formatPeso(actual - limit)}</p>}</div>})}</div><p className="mt-2 text-xs text-muted-foreground">Unclassified expenses: {formatPeso(month.unclassified)}</p></section>)}</div>}</div></CardContent></Card>
      </div>
    </>}
  </div>
}
