import { useState } from 'react'
import { Card, CardTitle } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { Sparkline } from '../components/Sparkline'
import { MoneyPosition } from '../components/MoneyPosition'
import { Link } from 'react-router-dom'
import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import { formatDateLabel, formatTimeLabel } from '../utils/date'
import './Dashboard.css'

type ExpensesPeriod = 'daily' | 'weekly' | 'monthly'
const PERIOD_LABEL: Record<ExpensesPeriod, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const PERIOD_TITLE: Record<ExpensesPeriod, string> = { daily: 'this week', weekly: 'this month', monthly: 'this year' }

export function Dashboard() {
  const finance = useFinance()
  const { accounts, creditCards, portfolio } = finance.state
  const previewAccounts = accounts.slice(0, 4)
  const activeGoalsPreview = finance.activeGoals
  const completedCount = finance.completedGoals.length
  const recent = finance.state.transactions.slice(0, 5)
  const [period, setPeriod] = useState<ExpensesPeriod>('daily')
  const expensesByDay = finance.expensesTrend(period)
  const maxDay = Math.max(1, ...expensesByDay.map((d) => d.amount))

  return (
    <div className="dashboard">
      <MoneyPosition />

      <div className="dash-grid">
        <Card className="area-balance balance-card">
          <div className="eyebrow">Available Cash</div>
          <div className="bal-amount num">{formatMoney(finance.totalAvailableCash, { withCents: true })}</div>
          <div className="faint">
            Across {accounts.length} cash sources
            {typeof finance.availableCashMonthlyChangePct === 'number' && (
              <>
                {' · '}
                <span className={finance.availableCashMonthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                  {finance.availableCashMonthlyChangePct >= 0 ? '+' : ''}
                  {finance.availableCashMonthlyChangePct}% this month
                </span>
              </>
            )}
          </div>

          <div className="flow-row">
            <div>
              <div className="flow-amt num">{formatMoney(finance.netCashFlow)}</div>
              <div className="eyebrow">Net Cash Flow · this month</div>
            </div>
            <span className="badge">Budget used {finance.budgetUsedPct}%</span>
          </div>

          <div className="acct-preview">
            <div className="acct-preview-head">
              <span style={{ fontWeight: 600 }}>Accounts</span>
              <span className="faint">
                {previewAccounts.length} of {accounts.length} shown
              </span>
            </div>
            {previewAccounts.map((a) => (
              <div className="bal-acct-row" key={a.id}>
                <div className="bal-acct-mid">
                  <div className="bal-acct-name">
                    {a.name}
                    {a.lastFour ? ` ••${a.lastFour}` : ''}
                  </div>
                  <div className="bal-acct-type faint">{a.institution ?? a.type}</div>
                </div>
                <div className="bal-acct-amt num">{formatMoney(a.balance, { withCents: false })}</div>
              </div>
            ))}
            <Link to="/accounts" className="see-all">
              View all accounts →
            </Link>
          </div>
        </Card>

        <Card className="area-expenses">
          <CardTitle
            action={
              <div className="expenses-head-right">
                <div className="seg" role="group" aria-label="Expenses period">
                  {(['daily', 'weekly', 'monthly'] as ExpensesPeriod[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={period === p}
                      className={`pill seg-pill${period === p ? ' pill--active' : ''}`}
                      onClick={() => setPeriod(p)}
                    >
                      {PERIOD_LABEL[p]}
                    </button>
                  ))}
                </div>
                {period === 'daily' && (
                  <span className="num" style={{ fontSize: 14 }}>
                    {formatMoney(finance.expensesToday, { withCents: false })} today
                  </span>
                )}
              </div>
            }
          >
            Expenses · {PERIOD_TITLE[period]}
          </CardTitle>
          <div className="expenses-line">
            <Sparkline
              key={period}
              values={expensesByDay.map((d) => d.amount)}
              width={700}
              height={130}
              strokeWidth={2.8}
              className="expenses-spark"
            />
            <div className="months">
              {expensesByDay.map((d, i) => (
                <span key={d.day} className={i === expensesByDay.length - 1 ? 'num expenses-line-today' : undefined}>
                  {d.day}
                </span>
              ))}
            </div>
            <ul className="visually-hidden">
              {expensesByDay.map((d) => (
                <li key={d.day}>
                  {d.day}: {formatMoney(d.amount, { withCents: false })}, {Math.round((d.amount / maxDay) * 100)}% of the highest point shown
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="area-budget">
          <CardTitle action={<span className="num" style={{ fontSize: 14 }}>{formatMoney(finance.state.totalBudgetAllocated, { withCents: false })}</span>}>
            Budget · this month
          </CardTitle>
          <div className="faint" style={{ marginTop: -4, marginBottom: 8 }}>
            {formatMoney(finance.totalBudgetRemaining, { withCents: false })} remaining
          </div>
          <ProgressBar pct={finance.budgetUsedPct} label="Total budget used" />
          <ul className="mini-list">
            <li>
              On track <span className="num">{finance.budgetOnTrackCount} categories</span>
            </li>
            <li>
              Near limit <span className="num">{finance.budgetNearLimitCount} categories</span>
            </li>
            <li>
              Over budget <span className="num">{finance.budgetOverCount} categories</span>
            </li>
            <li>
              Unallocated <span className="num">{formatMoney(finance.budgetUnallocated, { withCents: false })}</span>
            </li>
          </ul>
          <Link to="/budget" className="see-all">
            View budget →
          </Link>
        </Card>

        <Card className="area-goals">
          <CardTitle action={<span className="faint">{activeGoalsPreview.length} active</span>}>Goals</CardTitle>
          <ul className="mini-list mini-list--goals">
            {activeGoalsPreview.map((g) => (
              <li key={g.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <div className="faint" style={{ fontSize: 10.5 }}>
                    {g.status === 'behind_pace' ? 'Behind pace' : g.status === 'on_track' ? 'On track' : 'Just started'}
                  </div>
                </div>
                <span className="num">{finance.goalProgressPct(g)}%</span>
              </li>
            ))}
          </ul>
          <Link to="/goals" className="see-all" style={{ display: 'block', textAlign: 'left' }}>
            {completedCount} goals completed · View all →
          </Link>
        </Card>

        <Card className="area-spend">
          <CardTitle action={<span className="faint">this month</span>}>Spend Mix</CardTitle>
          <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
            {formatMoney(finance.spendMixTotal, { withCents: false })}
          </div>
          <ul className="mini-list">
            {finance.spendMix.map((s) => (
              <li key={s.categoryId}>
                <span>
                  <span className="swatch" style={{ background: s.color }} /> {s.category}
                </span>
                <span className="num">{formatMoney(s.amount, { withCents: false })}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="area-ai">
          <CardTitle action={<span className="faint">preview</span>}>AI Assistant Preview</CardTitle>
          <div className="ai-chat">
            <div className="ai-msg ai-msg--user">What&apos;s my highest expense?</div>
            <div className="ai-msg ai-msg--bot">Your highest is Shopping. Need details?</div>
          </div>
          <div className="faint" style={{ marginTop: 8, fontSize: 11 }}>
            Sample conversation only — a real AI assistant is planned for a future release.
          </div>
          <button type="button" className="ai-input" disabled>
            <span className="faint">Ask a question — coming soon</span>
          </button>
        </Card>

        <Card className="area-credit">
          <CardTitle action={<span className="faint">{creditCards.length} cards · {formatMoney(finance.totalCreditOwed, { withCents: false })} owed</span>}>
            Credit Cards
          </CardTitle>
          <div className="cc-row">
            {creditCards.map((c) => (
              <div className="cc-item" key={c.id}>
                <div className={`cc-plastic cc-plastic--${c.network}`}>
                  <div className="cc-chip" />
                  <div className="cc-num">•••• •••• •••• {c.lastFour}</div>
                </div>
                <div className="cc-info">
                  <div style={{ fontWeight: 600 }}>
                    {c.name} ••{c.lastFour}
                  </div>
                  <div className="faint">
                    Due {c.dueDate} · min {formatMoney(c.minPayment, { withCents: false })}
                  </div>
                  <ProgressBar
                    pct={(c.balance / c.limit) * 100}
                    color="var(--amber)"
                    label={`${c.name} used`}
                    valueText={`${Math.round((c.balance / c.limit) * 100)}% used, ${formatMoney(c.balance, { withCents: false })} of ${formatMoney(c.limit, { withCents: false })}`}
                  />
                  <div className="faint" style={{ fontSize: 10.5 }}>
                    {formatMoney(c.balance, { withCents: false })} used of {formatMoney(c.limit, { withCents: false })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="area-portfolio">
          <CardTitle action={<Link to="/investments" className="see-all">See all</Link>}>My Portfolio</CardTitle>
          <div className="faint" style={{ marginTop: -6, marginBottom: 6, fontSize: 10.5 }}>
            Sample data
          </div>
          <div className="portfolio-grid">
            {portfolio.map((h) => (
              <div className="portfolio-tile" key={h.ticker}>
                <div className="num" style={{ fontWeight: 700 }}>
                  {formatMoney(h.price, { withCents: true })}
                </div>
                <div className={h.changePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'} style={{ fontSize: 10.5 }}>
                  {h.changePct >= 0 ? '+' : ''}
                  {h.changePct}%
                </div>
                <Sparkline
                  values={h.history}
                  width={120}
                  height={24}
                  color={h.changePct >= 0 ? 'var(--teal)' : 'var(--red)'}
                  strokeWidth={2}
                  className="portfolio-spark"
                />
                <div className="portfolio-foot">
                  <span title={h.name}>{h.ticker}</span>
                  <span className="faint">Units {h.units}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="area-recent">
          <CardTitle action={<span className="faint">Most recent</span>}>Recent Transactions</CardTitle>
          <table className="tx-table">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="faint" style={{ fontSize: 10.5 }}>
                      {finance.transactionSourceLabel(t)} · {formatDateLabel(t.date)}
                      {t.time ? ` · ${formatTimeLabel(t.time)}` : ''}
                    </div>
                    {finance.transferFeeReconciliationLabel(t) && (
                      <div className="faint" style={{ fontSize: 10.5 }}>
                        {finance.transferFeeReconciliationLabel(t)}
                      </div>
                    )}
                  </td>
                  <td>
                    {t.categoryId ? (
                      <span
                        className="tx-tag"
                        style={{ color: finance.categoryColor(t.categoryId), background: `color-mix(in oklch, ${finance.categoryColor(t.categoryId)} 16%, transparent)` }}
                      >
                        {finance.categoryName(t.categoryId)}
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    <span className="tx-acct">
                      <span className="tx-acct-dot" style={{ background: finance.transactionAccountDotColor(t) }} />
                      <span className="faint">{finance.transactionAccountLabel(t)}</span>
                    </span>
                  </td>
                  <td className={`num tx-amt tx-amt--${t.amount < 0 ? 'out' : 'in'}`}>{formatMoney(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
