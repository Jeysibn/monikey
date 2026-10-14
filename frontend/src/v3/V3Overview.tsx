import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useFinance } from '../hooks/useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { accountLabel } from '../state/financeSelectors'
import { reportingPeriodForView, reportPeriodLabel, type ReportView } from '../state/reportsSelectors'
import { formatDateLabel } from '../utils/date'
import { formatMinorUnits } from '../utils/currency'
import { exactMinor } from '../utils/money'
import { V3AccountCard } from './V3AccountCard'
import { V3Workspace } from './V3Shell'
import { budgetRows, budgetSnapshot, favoriteAccounts, positionMinor, recentActivity, type HistoryPoint } from './overviewModel'
import { useBudgetPerformance,  useNetTrackedHistory, usePeriodReport } from './useOverviewReports'
import './V3Overview.css'

type Tab = 'summary' | 'insights'
const TABS: { id: Tab; label: string }[] = [{ id: 'summary', label: 'Summary' }, { id: 'insights', label: 'Insights' }]
const VIEWS: { id: ReportView; label: string }[] = [{ id: 'monthly', label: 'Monthly' }, { id: 'quarterly', label: 'Quarterly' }, { id: 'yearly', label: 'Yearly' }]

const money = (minor: bigint) => formatMinorUnits(minor, { withCents: true })

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ summary: null, insights: null })
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === value)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    const id = TABS[next]!.id
    onChange(id)
    refs.current[id]?.focus()
  }
  return (
    <div className="v3-ov-tabs" role="tablist" aria-label="Overview sections" onKeyDown={onKey}>
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[t.id] = el }}
          id={`v3-tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          aria-controls={`v3-panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          className="v3-ov-tab"
          onClick={() => onChange(t.id)}
        >{t.label}</button>
      ))}
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="v3-card v3-secondary v3-ov-empty">{children}</p>
}

function SummaryAccounts() {
  const { state } = useFinance()
  const favorites = favoriteAccounts(state)
  if (favorites.length === 0 && state.favoritesConfigured) return <><Empty>No favorite accounts selected. Choose up to four on the Accounts page.</Empty><Link to="/v3/accounts" className="v3-btn v3-btn--secondary v3-ov-wide-btn">Choose favorites</Link></>
  if (favorites.length === 0) return <Empty>No accounts yet. Add one from Accounts to see it here.</Empty>
  return (
    <>
      <ul className="v3-ov-cards" aria-label="Featured accounts">
        {favorites.map((f) => {
          if (f.kind === 'credit') {
            const owed = exactMinor(f.card.balanceMinor, f.card.balance)
            const limit = exactMinor(f.card.limitMinor, f.card.limit)
            return (
              <li key={f.card.id}>
                <Link to={`/v3/accounts?account=${f.card.id}`} className="v3-ov-card-link" aria-label={`${f.card.name} credit card, outstanding balance owed ${money(owed)}. Open account details`}>
                  <V3AccountCard kind="credit" name={f.card.name} figure={`Owed ${money(owed)}`} meta={`Outstanding debt · limit ${money(limit)}${f.card.lastFour ? ` · ••${f.card.lastFour}` : ''}`} />
                </Link>
              </li>
            )
          }
          const a = f.account
          const bal = exactMinor(a.balanceMinor, a.balance)
          return (
            <li key={a.id}>
              <Link to={`/v3/accounts?account=${a.id}`} className="v3-ov-card-link" aria-label={`${a.name}, balance ${money(bal)}. Open account details`}>
                <V3AccountCard kind={f.kind} name={a.name} figure={money(bal)} meta={[a.institution, a.lastFour ? `••${a.lastFour}` : ''].filter(Boolean).join(' · ') || undefined} />
              </Link>
            </li>
          )
        })}
      </ul>
      <Link to="/v3/accounts" className="v3-btn v3-btn--secondary v3-ov-wide-btn">All accounts</Link>
    </>
  )
}

function PositionCard() {
  const { state } = useFinance()
  const p = positionMinor(state)
  return (
    <div className="v3-card" data-testid="v3-position">
      <dl className="v3-ov-position">
        <div><dt className="v3-secondary">Liquid cash</dt><dd className="v3-figure v3-figure--md" data-testid="v3-liquid">{money(p.liquid)}</dd></div>
        <div><dt className="v3-secondary">Credit card debt</dt><dd className="v3-figure v3-figure--md v3-figure--negative" data-testid="v3-debt">{money(p.cardDebt)}</dd></div>
        <div className="v3-ov-position__net"><dt className="v3-label">Net tracked position</dt><dd className={`v3-figure v3-figure--lg ${p.net < 0n ? 'v3-figure--negative' : ''}`} data-testid="v3-net">{money(p.net)}</dd></div>
      </dl>
      <p className="v3-caption v3-secondary">Liquid bank, e-wallet and cash minus outstanding card debt. Investments and crypto are not included.</p>
    </div>
  )
}

function MonthlySnapshot() {
  const finance = useFinance()
  const { state, todayIso } = finance
  const period = reportingPeriodForView(todayIso, 'monthly')
  const report = usePeriodReport(state, period)
  const budget = budgetSnapshot(state)
  return (
    <div className="v3-card" data-testid="v3-monthly">
      <h3 className="v3-h3">{reportPeriodLabel(todayIso, 'monthly')}</h3>
      {report.status === 'loading' && <div className="v3-skeleton" role="status" aria-label="Loading monthly totals" />}
      {(report.status === 'error' || report.status === 'unavailable') && <p role="alert" className="v3-secondary">Monthly totals could not be loaded. Account balances above are unaffected.</p>}
      {report.status === 'ready' && (
        <dl className="v3-ov-position">
          <div><dt className="v3-secondary">All spending</dt><dd className="v3-figure v3-figure--md" data-testid="v3-spent">{money(report.data.spendingMinor)}</dd></div>
          <div><dt className="v3-secondary">Income</dt><dd className="v3-figure v3-figure--md">{money(report.data.incomeMinor)}</dd></div>
        </dl>
      )}
      {budget ? (
        <div>
          <div className="v3-ov-meter" role="progressbar" aria-label="Budgeted categories used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, budget.usedPct)} aria-valuetext={`${budget.usedPct}% of budget used`}>
            <span className={budget.over ? 'is-over' : ''} style={{ width: `${Math.min(100, budget.usedPct)}%` }} />
          </div>
          <p className="v3-secondary" data-testid="v3-budget-line">
            Budgeted categories: {money(budget.spent)} of {money(budget.allocated)} · {budget.over ? `${money(-budget.remaining)} over` : `${money(budget.remaining)} left`}
          </p>
        </div>
      ) : <p className="v3-secondary">No budget set for this month. Set one in Planning.</p>}
      <p className="v3-caption v3-secondary">All spending is every cleared expense this month. Budgeted categories count only categories with a budget, so the two can differ. Transfers, card repayments, reversed and pending items are excluded.</p>
    </div>
  )
}

function RecentActivity() {
  const { state } = useFinance()
  const rows = recentActivity(state, 6)
  if (rows.length === 0) return <Empty>No transactions yet.</Empty>
  return (
    <>
      <ul className="v3-card v3-ov-activity" aria-label="Recent transactions">
        {rows.map((t) => {
          const m = exactMinor(t.amountMinor, t.amount)
          const tone = t.type === 'income' ? 'v3-figure--positive' : ''
          return (
            <li key={t.id}>
              <Link to={`/v3/activity?tx=${t.id}`} className="v3-ov-activity__row">
                <span className="v3-ov-activity__main">
                  <span className="v3-ov-activity__title">{t.title}</span>
                  <span className="v3-caption v3-secondary">{formatDateLabel(t.date)} · {t.type === 'transfer' ? 'Transfer' : accountLabel(state, t.accountId)}{t.status === 'pending' ? ' · Pending' : ''}</span>
                </span>
                <span className={`v3-figure v3-ov-activity__amt ${tone}`}>{t.type === 'transfer' ? money(m < 0n ? -m : m) : `${m > 0n ? '+' : ''}${money(m)}`}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link to="/v3/activity" className="v3-btn v3-btn--secondary v3-ov-wide-btn">All activity</Link>
    </>
  )
}

function Summary() {
  return (
    <V3Workspace
      accounts={<SummaryAccounts />}
      position={<><PositionCard /><MonthlySnapshot /></>}
      activity={<RecentActivity />}
    />
  )
}

function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const nums = points.map((p) => Number(p.netMinor))
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const coords = nums.map((n, i) => `${(i / (nums.length - 1)) * 100},${40 - ((n - min) / span) * 36 - 2}`).join(' ')
  const first = points[0]!
  const last = points[points.length - 1]!
  const delta = last.netMinor - first.netMinor
  return (
    <div>
      <svg className="v3-ov-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Net tracked position from ${money(first.netMinor)} on ${first.date} to ${money(last.netMinor)} on ${last.date}`}>
        <polyline points={coords} fill="none" stroke="var(--v3-blue)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="v3-secondary" data-testid="v3-history-summary">
        {first.date}: {money(first.netMinor)} → {last.date}: {money(last.netMinor)} ({delta >= 0n ? '+' : ''}{money(delta)}) · {points.length} recorded days
      </p>
    </div>
  )
}

function Insights() {
  const finance = useFinance()
  const { state, todayIso } = finance
  const [view, setView] = useState<ReportView>('monthly')
  const period = useMemo(() => reportingPeriodForView(todayIso, view), [todayIso, view])
  const monthStart = useMemo(() => reportingPeriodForView(todayIso, 'monthly').start, [todayIso])
  const history = useNetTrackedHistory(period)
  const report = usePeriodReport(state, period)
  const remoteBudget = useBudgetPerformance(monthStart)
  const localRows = useMemo(() => budgetRows(state), [state])
  const budgetIsMonthly = view === 'monthly'
  const budget: Remote2 = remoteBudget
    ? remoteBudget.status === 'ready' ? { status: 'ready', rows: remoteBudget.data?.rows.map((r) => ({ ...r, color: state.categories.find((c) => c.id === r.categoryId)?.color ?? 'var(--v3-muted)' })) ?? [] } : remoteBudget
    : { status: 'ready', rows: localRows.map((r) => ({ categoryId: r.categoryId, name: r.name, allocated: r.allocated, spent: r.spent })) }
  return (
    <div className="v3-ov-insights">
      <div className="v3-ov-views" role="group" aria-label="Timeframe">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className="v3-btn v3-btn--secondary v3-ov-view" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
        <span className="v3-secondary" data-testid="v3-period-label">{reportPeriodLabel(todayIso, view)}</span>
      </div>

      <section className="v3-card" aria-labelledby="v3-ins-history" data-testid="v3-history">
        <h2 id="v3-ins-history" className="v3-h2">Net tracked position</h2>
        {history.status === 'unavailable' && <p className="v3-secondary">{history.message}</p>}
        {history.status === 'loading' && <div className="v3-skeleton" role="status" aria-label="Loading history" />}
        {history.status === 'error' && <p role="alert" className="v3-secondary">History could not be loaded. Current figures are unaffected.</p>}
        {history.status === 'ready' && history.data.length < 2 && <p className="v3-secondary">Not enough tracked history for {reportPeriodLabel(todayIso, view)} yet ({history.data.length} recorded {history.data.length === 1 ? 'day' : 'days'}).</p>}
        {history.status === 'ready' && history.data.length >= 2 && <HistoryChart points={history.data} />}
      </section>

      <section className="v3-card" aria-labelledby="v3-ins-cats" data-testid="v3-categories">
        <h2 id="v3-ins-cats" className="v3-h2">Spending by category</h2>
        {report.status === 'loading' && <div className="v3-skeleton" role="status" aria-label="Loading spending" />}
        {(report.status === 'error' || report.status === 'unavailable') && <p role="alert" className="v3-secondary">Spending could not be loaded.</p>}
        {report.status === 'ready' && (report.data.categories.length === 0 ? <p className="v3-secondary">No spending recorded for {reportPeriodLabel(todayIso, view)}.</p> : (
          <>
            <p className="v3-secondary" data-testid="v3-cat-total">All spending: {money(report.data.spendingMinor)} (cleared expenses, including uncategorized)</p>
            <ul className="v3-ov-bars">
              {report.data.categories.map((c) => (
                <li key={c.categoryId || 'uncategorized'}>
                  <div className="v3-ov-bars__head"><span><span className="v3-ov-dot" style={{ background: c.color }} aria-hidden="true" />{c.name}</span><span className="v3-figure">{money(c.amountMinor)} · {c.sharePct}%</span></div>
                  <div className="v3-ov-meter" aria-hidden="true"><span style={{ width: `${c.sharePct}%`, background: c.color }} /></div>
                </li>
              ))}
            </ul>
          </>
        ))}
      </section>

      <section className="v3-card" aria-labelledby="v3-ins-budget" data-testid="v3-bva">
        <h2 id="v3-ins-budget" className="v3-h2">Budgeted categories vs actual</h2>
        {!budgetIsMonthly ? <p className="v3-secondary">Budgets are monthly. Switch to Monthly to compare budget and actual spending.</p>
          : budget.status === 'loading' ? <div className="v3-skeleton" role="status" aria-label="Loading budget" />
          : budget.status !== 'ready' ? <p role="alert" className="v3-secondary">Budget comparison could not be loaded.</p>
          : budget.rows.length === 0 ? <p className="v3-secondary">No budget set for this month.</p> : (
            <>
              <p className="v3-secondary">Only categories with a budget are listed; their total can be lower than All spending.</p>
              <ul className="v3-ov-bars">
                {budget.rows.map((r) => {
                  const pct = r.allocated > 0n ? Number((r.spent * 100n) / r.allocated) : 0
                  const over = r.allocated > 0n && r.spent > r.allocated
                  return (
                    <li key={r.categoryId}>
                      <div className="v3-ov-bars__head"><span>{r.name}</span><span className="v3-figure">{money(r.spent)} / {money(r.allocated)}{over ? ' · over' : ''}</span></div>
                      <div className="v3-ov-meter" role="progressbar" aria-label={`${r.name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-valuetext={`${pct}% used`}><span className={over ? 'is-over' : ''} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
      </section>
    </div>
  )
}

type BudgetRowView = { categoryId: string; name: string; allocated: bigint; spent: bigint }
type Remote2 = { status: 'loading' } | { status: 'error' | 'unavailable'; message: string } | { status: 'ready'; rows: BudgetRowView[] }

export function V3Overview() {
  const [tab, setTab] = useState<Tab>('summary')
  const offline = useAsyncFinanceOptional()?.offline ?? false
  return (
    <>
      <div className="v3-page-head">
        <h1 className="v3-h1">Overview</h1>
        <Tabs value={tab} onChange={setTab} />
      </div>
      {offline && <p className="v3-card v3-ov-banner" role="status">You are offline. Showing the last synced figures; changes made now are queued, not posted.</p>}
      <div role="tabpanel" id={`v3-panel-${tab}`} aria-labelledby={`v3-tab-${tab}`} tabIndex={0} className="v3-ov-panel">
        {tab === 'summary' ? <Summary /> : <Insights />}
      </div>
    </>
  )
}
