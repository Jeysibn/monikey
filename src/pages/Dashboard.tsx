import { Card, CardTitle } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { Link } from 'react-router-dom'
import {
  accounts,
  attentionItems,
  budgetDaysRemaining,
  budgetNearLimitCount,
  budgetOverCount,
  budgetUnallocated,
  budgetUsedPct,
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
  const maxDay = Math.max(...expensesByDay.map((d) => d.amount))

  return (
    <div className="dashboard">
      <div className="attention-strip" role="status">
        <div className="attention-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          Attention Needed
        </div>
        <ul className="attention-items">
          {attentionItems.map((item) => (
            <li key={item.id} className={`attention-item attention-item--${item.severity}`}>
              <span className="attention-dot" aria-hidden="true" />
              {item.title}
            </li>
          ))}
        </ul>
        <Link to="/transactions" className="see-all">
          See all
        </Link>
      </div>

      <div className="dash-grid">
        <Card className="span-row-2 balance-card">
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

        <Card className="span-col-3">
          <CardTitle
            action={
              <span className="num" style={{ fontSize: 14 }}>
                {formatMoney(expensesToday, { withCents: false })} today
              </span>
            }
          >
            Expenses
          </CardTitle>
          <div className="mini-bars">
            {expensesByDay.map((d) => (
              <div className="mini-bar-col" key={d.day}>
                <div className="mini-bar-wrap">
                  <div className="mini-bar" style={{ height: `${(d.amount / maxDay) * 100}%` }} />
                </div>
                <div className="mini-bar-label faint">{d.day}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
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

        <Card>
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

        <Card>
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

        <Card>
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

        <Card className="span-col-2">
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

        <Card>
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
                <div className="portfolio-foot">
                  <span>{h.ticker}</span>
                  <span className="faint">Units {h.units}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="span-col-3">
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
                  <td className="faint">{t.category ?? '—'}</td>
                  <td className="faint">{t.accountLabel}</td>
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
