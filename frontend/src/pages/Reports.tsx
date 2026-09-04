import { useMemo, useState, type ReactNode } from 'react'
import { Card, CardTitle } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { Sparkline } from '../components/Sparkline'
import { useFinance } from '../hooks/useFinance'
import { netCashFlow, totalExpenses, totalIncome } from '../state/financeSelectors'
import type { ExpensesTrendUnit } from '../state/financeSelectors'
import {
  accountBalanceTrendSample,
  debtTrendSample,
  netWorthNow,
  netWorthTrendSample,
  portfolioSummary,
  reportPeriodLabel,
  reportingPeriodForView,
  savingsRate,
  type IllustrativeTrendPoint,
  type ReportView,
} from '../state/reportsSelectors'
import { formatMoney } from '../utils/currency'
import { formatGoalDate } from '../utils/date'
import './Reports.css'

const VIEWS: ReportView[] = ['monthly', 'quarterly', 'yearly']
const VIEW_LABEL: Record<ReportView, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }
// Which expense-trend bucket size best matches each report view — reuses the
// same aggregation the Dashboard chart is built from (no separate quarterly
// bucketing logic to keep in sync).
const TREND_UNIT_FOR_VIEW: Record<ReportView, ExpensesTrendUnit> = {
  monthly: 'daily',
  quarterly: 'weekly',
  yearly: 'monthly',
}

/** Plain-div bar chart for an illustrative or real trend — matches the app's no-charting-library convention (see Budget.tsx's `.bva-bars`). */
function TrendBarChart({
  points,
  color,
  formatValue,
}: {
  points: IllustrativeTrendPoint[]
  color: string
  formatValue: (v: number) => string
}) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)))
  return (
    <div className="rp-trend-bars">
      {points.map((p, i) => (
        <div className="rp-trend-col" key={`${p.label}-${i}`}>
          <div className="rp-trend-track">
            <div
              className="rp-trend-bar"
              style={{ height: `${Math.max(4, Math.round((Math.abs(p.value) / max) * 100))}%`, background: color }}
            />
          </div>
          <div className="faint rp-trend-label">{p.label}</div>
          <div className="visually-hidden">{formatValue(p.value)}</div>
        </div>
      ))}
    </div>
  )
}

function IllustrativeNote({ children }: { children: ReactNode }) {
  return <p className="rp-illustrative-note">{children}</p>
}

export function Reports() {
  const finance = useFinance()
  const { state, todayIso } = finance
  const [view, setView] = useState<ReportView>('monthly')

  const period = useMemo(() => reportingPeriodForView(todayIso, view), [todayIso, view])
  const periodLabel = reportPeriodLabel(todayIso, view)

  const income = totalIncome(state, period)
  const expenses = totalExpenses(state, period)
  const netFlow = netCashFlow(state, period)
  const savingsRatePct = savingsRate(state, period)
  const hasIncome = income > 0

  const trendUnit = TREND_UNIT_FOR_VIEW[view]
  const trendPoints = finance.expensesTrend(trendUnit)
  const trendTitle = finance.expensesTrendTitle(trendUnit)
  const trendRange = finance.expensesTrendRangeLabel(trendPoints)
  const trendMax = Math.max(1, ...trendPoints.map((p) => p.amount))

  const { categories, budgetCategories, portfolio, creditCards } = state
  const overOrNearBudget = budgetCategories
    .filter((c) => finance.budgetStatus(c.allocated, c.spent) !== 'safe' && finance.budgetStatus(c.allocated, c.spent) !== 'on_track')
    .map((c) => ({ ...c, name: categories.find((cc) => cc.id === c.id)?.name ?? c.id }))

  const netWorth = netWorthNow(state)
  const netWorthTrend = netWorthTrendSample(state, todayIso)
  const balanceTrend = accountBalanceTrendSample(state, todayIso)
  const debtTrend = debtTrendSample(state, todayIso)
  const invest = portfolioSummary(state)

  return (
    <div className="reports-page">
      <div className="page-head">
        <h1 className="page-title">Reports</h1>
        <div className="reports-actions">
          <button type="button" className="btn btn--ghost" disabled title="Coming soon">
            Export CSV
            <span className="coming-soon-tag">Coming soon</span>
          </button>
          <button type="button" className="btn btn--ghost" disabled title="Coming soon">
            Export PDF
            <span className="coming-soon-tag">Coming soon</span>
          </button>
        </div>
      </div>

      <div className="view-toggle" role="group" aria-label="Report period">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            className={`pill${view === v ? ' pill--active' : ''}`}
            onClick={() => setView(v)}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
        <button type="button" className="pill" disabled title="Coming soon" aria-disabled="true">
          Custom
          <span className="coming-soon-tag">Coming soon</span>
        </button>
      </div>
      <div className="faint rp-period-caption">{periodLabel}</div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Income</div>
          <div className="num kpi-val">{formatMoney(income, { withCents: false })}</div>
          <div className="budget-meta faint">{periodLabel}</div>
        </Card>
        <Card>
          <div className="eyebrow">Expenses</div>
          <div className="num kpi-val">{formatMoney(expenses, { withCents: false })}</div>
          <div className="budget-meta faint">{periodLabel}</div>
        </Card>
        <Card>
          <div className="eyebrow">Net Cash Flow</div>
          <div className="num kpi-val">{formatMoney(netFlow, { withCents: false })}</div>
          <div className={netFlow >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>{netFlow >= 0 ? 'Positive' : 'Negative'} for {periodLabel}</div>
        </Card>
        <Card>
          <div className="eyebrow">Savings Rate</div>
          <div className="num kpi-val">{hasIncome ? `${savingsRatePct}%` : '—'}</div>
          <div className={!hasIncome ? 'faint' : savingsRatePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
            {hasIncome ? 'Of income kept' : 'No income recorded this period'}
          </div>
        </Card>
      </div>

      <div className="reports-grid">
        <Card className="rp-span-2">
          <CardTitle action={<span className="budget-meta faint">{trendRange}</span>}>Expenses · {trendTitle}</CardTitle>
          <div className="rp-expenses-line">
            <Sparkline key={trendUnit} values={trendPoints.map((p) => p.amount)} width={700} height={120} strokeWidth={2.6} className="rp-spark" />
            <div className="rp-trend-axis">
              {trendPoints.map((p) => (
                <span key={p.startIso} title={`${p.day}: ${p.rangeLabel}`}>
                  {p.day}
                </span>
              ))}
            </div>
          </div>
          <ul className="visually-hidden">
            {trendPoints.map((p) => (
              <li key={p.startIso}>
                {p.day} ({p.rangeLabel}): {formatMoney(p.amount, { withCents: false })}, {Math.round((p.amount / trendMax) * 100)}% of the
                highest point shown
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle action={<span className="num" style={{ fontSize: 14 }}>{finance.budgetUsedPct}% used</span>}>Budget Performance</CardTitle>
          <ProgressBar pct={finance.budgetUsedPct} label="Overall budget used" />
          <ul className="mini-list">
            <li>
              Spent so far <span className="num">{formatMoney(finance.totalBudgetSpent, { withCents: false })}</span>
            </li>
            <li>
              Remaining <span className="num">{formatMoney(finance.totalBudgetRemaining, { withCents: false })}</span>
            </li>
            <li>
              On track <span className="num">{finance.budgetOnTrackCount} categories</span>
            </li>
            <li>
              Near limit <span className="num">{finance.budgetNearLimitCount} categories</span>
            </li>
            <li>
              Over budget <span className="num">{finance.budgetOverCount} categories</span>
            </li>
          </ul>
          {overOrNearBudget.length > 0 && (
            <div className="rp-flagged">
              <div className="budget-meta">Needs attention</div>
              {overOrNearBudget.map((c) => (
                <div className="rp-flagged-row" key={c.id}>
                  <span>{c.name}</span>
                  <span className="num">
                    {formatMoney(c.spent, { withCents: false })} / {formatMoney(c.allocated, { withCents: false })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle action={<span className="faint">{finance.activePeriodLabel}</span>}>Top Categories</CardTitle>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>
            {formatMoney(finance.spendMixTotal, { withCents: false })}
          </div>
          <ul className="mini-list rp-cat-list">
            {finance.spendMix.map((s) => (
              <li key={s.categoryId} className="rp-cat-row">
                <div className="rp-cat-row-top">
                  <span>
                    <span className="swatch" style={{ background: s.color }} /> {s.category}
                  </span>
                  <span className="num">
                    {formatMoney(s.amount, { withCents: false })} · {s.pct}%
                  </span>
                </div>
                <ProgressBar pct={s.pct} color={s.color} label={`${s.category} share of spend`} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle action={<span className="faint">Now</span>}>Net Worth</CardTitle>
          <div className="num kpi-val">{formatMoney(netWorth.netWorth, { withCents: false })}</div>
          <ul className="mini-list">
            <li>
              Assets <span className="num">{formatMoney(netWorth.assets, { withCents: false })}</span>
            </li>
            <li>
              Liabilities <span className="num">{formatMoney(netWorth.liabilities, { withCents: false })}</span>
            </li>
          </ul>
          <IllustrativeNote>Illustrative 6-month trend — Monikey does not yet track historical net worth; only today&apos;s figure is real.</IllustrativeNote>
          <TrendBarChart points={netWorthTrend} color="var(--cyan)" formatValue={(v) => formatMoney(v, { withCents: false })} />
        </Card>

        <Card>
          <CardTitle action={<span className="faint">Now</span>}>Account Balance Trend</CardTitle>
          <div className="num kpi-val">{formatMoney(finance.totalAvailableCash, { withCents: false })}</div>
          <div className="budget-meta faint">Across {state.accounts.length} cash sources</div>
          <IllustrativeNote>Illustrative 6-month trend — account balance history isn&apos;t tracked yet; only today&apos;s total is real.</IllustrativeNote>
          <TrendBarChart points={balanceTrend} color="var(--teal)" formatValue={(v) => formatMoney(v, { withCents: false })} />
        </Card>

        <Card>
          <CardTitle action={<span className="faint">Now</span>}>Debt Trend</CardTitle>
          <div className="num kpi-val">{formatMoney(finance.totalCreditOwed, { withCents: false })}</div>
          <ul className="mini-list">
            {creditCards.map((c) => (
              <li key={c.id}>
                {c.name} ••{c.lastFour}
                <span className="num">{formatMoney(c.balance, { withCents: false })}</span>
              </li>
            ))}
          </ul>
          <IllustrativeNote>Illustrative 6-month trend — card balance history isn&apos;t tracked yet; only today&apos;s balances are real.</IllustrativeNote>
          <TrendBarChart points={debtTrend} color="var(--amber)" formatValue={(v) => formatMoney(v, { withCents: false })} />
        </Card>

        <Card>
          <CardTitle action={<span className="faint">{finance.activeGoals.length} active</span>}>Goal Progress</CardTitle>
          <ul className="mini-list rp-goal-list">
            {finance.activeGoals.map((g) => (
              <li key={g.id} className="rp-goal-row">
                <div className="rp-goal-row-top">
                  <span style={{ fontWeight: 600 }}>{g.name}</span>
                  <span className="num">{finance.goalProgressPct(g)}%</span>
                </div>
                <ProgressBar pct={finance.goalProgressPct(g)} label={`${g.name} progress`} />
                <div className="budget-meta faint">
                  {formatMoney(g.currentAmount, { withCents: false })} of {formatMoney(g.targetAmount, { withCents: false })} · target{' '}
                  {formatGoalDate(g.targetDate)}
                </div>
              </li>
            ))}
            {finance.activeGoals.length === 0 && <li className="faint">No active goals.</li>}
          </ul>
        </Card>

        <Card className="rp-span-2">
          <CardTitle action={<span className="faint">{formatMoney(invest.totalValue, { withCents: false })} total</span>}>
            Investment Performance
          </CardTitle>
          <div className="budget-meta faint" style={{ marginTop: -4, marginBottom: 6 }}>
            Sample portfolio data ·{' '}
            <span className={invest.weightedChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
              {invest.weightedChangePct >= 0 ? '+' : ''}
              {invest.weightedChangePct}% value-weighted
            </span>
          </div>
          <div className="rp-portfolio-grid">
            {portfolio.map((h) => (
              <div className="rp-portfolio-tile" key={h.ticker}>
                <div className="num" style={{ fontWeight: 700 }}>
                  {formatMoney(h.price, { withCents: true })}
                </div>
                <div className={h.changePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                  {h.changePct >= 0 ? '+' : ''}
                  {h.changePct}%
                </div>
                <Sparkline values={h.history} width={120} height={24} color={h.changePct >= 0 ? 'var(--teal)' : 'var(--red)'} strokeWidth={2} />
                <div className="rp-portfolio-foot">
                  <span title={h.name}>{h.ticker}</span>
                  <span className="faint">Units {h.units}</span>
                </div>
              </div>
            ))}
            {portfolio.length === 0 && <div className="faint">No holdings yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  )
}
