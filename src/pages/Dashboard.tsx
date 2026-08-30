import { Card, CardTitle } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { Sparkline } from '../components/Sparkline'
import { Link } from 'react-router-dom'
import {
  accountColor,
  accounts,
  budgetDaysRemaining,
  budgetNearLimitCount,
  budgetOverCount,
  budgetUnallocated,
  budgetUsedPct,
  categoryColor,
  creditCards,
  expensesByDay,
  expensesToday,
  formatMoney,
  goals,
  netCashFlow,
  portfolio,
  spendMix,
  spendMixTotal,
  totalAvailableCash,
  totalBudgetAllocated,
  totalBudgetRemaining,
  totalCreditOwed,
  transactions,
} from '../data/mockData'
import './Dashboard.css'

export function Dashboard() {
  const previewAccounts = accounts.slice(0, 4)
  const activeGoalsPreview = goals.filter((g) => g.active)
  const completedCount = goals.filter((g) => !g.active).length
  const recent = transactions.slice(0, 5)

  return (
    <div className="dashboard">
      <div className="dash-grid">
        <Card className="area-balance balance-card">
          <div className="eyebrow">Available Cash</div>
          <div className="bal-amount num">{formatMoney(totalAvailableCash, { withCents: true })}</div>
          <div className="faint">Across {accounts.length} cash sources</div>

          <div className="flow-row">
            <div>
              <div className="flow-amt num">{formatMoney(netCashFlow)}</div>
              <div className="eyebrow">Net Cash Flow</div>
            </div>
            <span className="badge">Budget used {budgetUsedPct}%</span>
          </div>

          <div className="acct-preview">
            <div className="acct-preview-head">
              <span style={{ fontWeight: 600 }}>Accounts</span>
              <span className="faint">
                {previewAccounts.length} of {accounts.length} shown
              </span>
            </div>
            {previewAccounts.map((a) => (
              <div className="acct-row" key={a.id}>
                <div className="acct-mid">
                  <div className="acct-name">
                    {a.name}
                    {a.lastFour ? ` ••${a.lastFour}` : ''}
                  </div>
                  <div className="acct-type faint">{a.institution ?? a.type}</div>
                </div>
                <div className="acct-amt num">{formatMoney(a.balance, { withCents: false })}</div>
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
              <span className="num" style={{ fontSize: 14 }}>
                {formatMoney(expensesToday, { withCents: false })} today
              </span>
            }
          >
            Expenses
          </CardTitle>
          <div className="expenses-line">
            <Sparkline
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
          </div>
        </Card>

        <Card className="area-budget">
          <CardTitle action={<span className="num" style={{ fontSize: 14 }}>{formatMoney(totalBudgetAllocated, { withCents: false })}</span>}>
            Budget
          </CardTitle>
          <div className="faint" style={{ marginTop: -4, marginBottom: 8 }}>
            {formatMoney(totalBudgetRemaining, { withCents: false })} remaining
          </div>
          <ProgressBar pct={budgetUsedPct} />
          <ul className="mini-list">
            <li>
              Near limit <span className="num">{budgetNearLimitCount} categories</span>
            </li>
            <li>
              Over budget <span className="num">{budgetOverCount} categories</span>
            </li>
            <li>
              Unallocated <span className="num">{formatMoney(budgetUnallocated, { withCents: false })}</span>
            </li>
            <li>
              Days remaining <span className="num">{budgetDaysRemaining}</span>
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
                <span className="num">{Math.round((g.currentAmount / g.targetAmount) * 100)}%</span>
              </li>
            ))}
          </ul>
          <Link to="/goals" className="see-all" style={{ display: 'block', textAlign: 'left' }}>
            {completedCount} goals completed · View all →
          </Link>
        </Card>

        <Card className="area-spend">
          <CardTitle action={<span className="faint">by category</span>}>Spend Mix</CardTitle>
          <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
            {formatMoney(spendMixTotal, { withCents: false })}
          </div>
          <ul className="mini-list">
            {spendMix.map((s) => (
              <li key={s.category}>
                <span>
                  <span className="swatch" style={{ background: s.color }} /> {s.category}
                </span>
                <span className="num">{formatMoney(s.amount, { withCents: false })}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="area-ai">
          <CardTitle
            action={
              <span className="ai-online">
                <span className="ai-online-dot" /> online
              </span>
            }
          >
            AI Financial Assistant
          </CardTitle>
          <div className="ai-chat">
            <div className="ai-msg ai-msg--user">What&apos;s my highest expense?</div>
            <div className="ai-msg ai-msg--bot">Your highest is Shopping. Need details?</div>
          </div>
          <div className="ai-input" aria-hidden="true">
            <span className="faint">Ask a question…</span>
          </div>
        </Card>

        <Card className="area-credit">
          <CardTitle action={<span className="faint">{creditCards.length} cards · {formatMoney(totalCreditOwed, { withCents: false })} owed</span>}>
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
                  <ProgressBar pct={(c.balance / c.limit) * 100} color="var(--amber)" />
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
          <div className="portfolio-grid">
            {portfolio.map((h) => (
              <div className="portfolio-tile" key={h.ticker}>
                <div className="num" style={{ fontWeight: 700 }}>
                  {formatMoney(h.price, { withCents: true })}
                </div>
                <div className="kpi-delta--up" style={{ fontSize: 10.5 }}>
                  +{h.changePct}%
                </div>
                <Sparkline values={h.history} width={120} height={24} color="var(--teal)" strokeWidth={2} className="portfolio-spark" />
                <div className="portfolio-foot">
                  <span>{h.ticker}</span>
                  <span className="faint">Units {h.units}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="area-recent">
          <CardTitle action={<span className="faint">Today · Aug 29</span>}>Recent Transactions</CardTitle>
          <table className="tx-table">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="faint" style={{ fontSize: 10.5 }}>
                      {t.source === 'ocr' ? 'OCR receipt' : 'Manual'} · {t.time ?? t.date}
                    </div>
                  </td>
                  <td>
                    {t.category ? (
                      <span className="tx-tag" style={{ color: categoryColor(t.category), background: `color-mix(in oklch, ${categoryColor(t.category)} 16%, transparent)` }}>
                        {t.category}
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    <span className="tx-acct">
                      <span className="tx-acct-dot" style={{ background: accountColor(t.accountId) }} />
                      <span className="faint">{t.accountLabel}</span>
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
