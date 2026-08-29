import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import {
  budgetCategories,
  budgetDaysRemaining,
  budgetNearLimitCount,
  budgetOverCount,
  budgetStatus,
  budgetUnallocated,
  budgetUsedPct,
  budgetVsActual,
  formatMoney,
  totalBudgetAllocated,
  totalBudgetRemaining,
  totalBudgetSpent,
} from '../data/mockData'
import './Budget.css'

export function Budget() {
  const overNames = budgetCategories
    .filter((c) => budgetStatus(c.allocated, c.spent) === 'over_budget')
    .map((c) => c.name)
    .join(', ')

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Budget</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Total Budget</div>
          <div className="num kpi-val">{formatMoney(totalBudgetAllocated, { withCents: false })}</div>
          <div className="faint">This month · Aug 2026</div>
        </Card>
        <Card>
          <div className="eyebrow">Spent So Far</div>
          <div className="num kpi-val">{formatMoney(totalBudgetSpent, { withCents: false })}</div>
          <div className="kpi-delta--up">{budgetUsedPct}% of budget used</div>
        </Card>
        <Card>
          <div className="eyebrow">Remaining</div>
          <div className="num kpi-val">{formatMoney(totalBudgetRemaining, { withCents: false })}</div>
          <div className="kpi-delta--up">Within total budget · {budgetDaysRemaining} days left</div>
        </Card>
        <Card>
          <div className="eyebrow">Over Budget</div>
          <div className="num kpi-val">{budgetOverCount} categories</div>
          <div className="kpi-delta--down">{overNames}</div>
        </Card>
      </div>

      <div className="budget-split">
        <Card className="cat-card">
          <div className="section-head">
            <span className="card-title-text">Category Budgets</span>
            <button type="button" className="add-link">
              + New category
            </button>
          </div>
          {budgetCategories.map((c) => {
            const status = budgetStatus(c.allocated, c.spent)
            const pct = Math.round((c.spent / c.allocated) * 100)
            const diff = c.allocated - c.spent
            return (
              <div className="budget-row" key={c.id}>
                <div className="budget-row-mid">
                  <div className="budget-row-top">
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</span>
                    <span className="faint" style={{ fontSize: 10.5 }}>
                      {formatMoney(c.spent, { withCents: false })} / {formatMoney(c.allocated, { withCents: false })}
                    </span>
                  </div>
                  <ProgressBar
                    pct={pct}
                    color={status === 'over_budget' ? 'var(--red)' : status === 'near_limit' ? 'var(--amber)' : 'var(--cyan)'}
                  />
                  {c.forecast && (
                    <div className="faint" style={{ fontSize: 9.5, marginTop: 3 }}>
                      Forecast {formatMoney(c.forecast, { withCents: false })} · projected{' '}
                      {formatMoney(Math.abs(c.forecast - c.allocated), { withCents: false })}{' '}
                      {c.forecast > c.allocated ? 'over' : 'under'}
                    </div>
                  )}
                </div>
                <StatusBadge status={status} />
                <div className={`num budget-amt ${diff < 0 ? 'budget-amt--over' : ''}`}>
                  {diff < 0 ? `${formatMoney(Math.abs(diff), { withCents: false })} over` : `${formatMoney(diff, { withCents: false })} left`}
                </div>
              </div>
            )
          })}
        </Card>

        <div className="accounts-col">
          <Card>
            <div className="section-head">
              <span className="card-title-text">Budget Health</span>
              <span className="num" style={{ fontSize: 14 }}>
                {budgetUsedPct}% used
              </span>
            </div>
            <ProgressBar pct={budgetUsedPct} />
            <ul className="mini-list">
              <li>
                Days remaining <span className="num">{budgetDaysRemaining}</span>
              </li>
              <li>
                On track <span className="num">0 categories</span>
              </li>
              <li>
                Near limit <span className="num">{budgetNearLimitCount} categories</span>
              </li>
              <li>
                Over budget <span className="num">{budgetOverCount} categories</span>
              </li>
              <li>
                Unallocated <span className="num">{formatMoney(budgetUnallocated, { withCents: false })}</span>
              </li>
            </ul>
          </Card>

          <Card>
            <div className="section-head">
              <span className="card-title-text">Budget vs Actual</span>
            </div>
            <div className="bva-bars">
              {budgetVsActual.map((m) => (
                <div className="bva-col" key={m.month}>
                  <div className="bva-pair">
                    <div className="bva-bar bva-bar--budget" style={{ height: `${m.budget}%` }} />
                    <div
                      className={`bva-bar bva-bar--actual${m.actual > m.budget ? ' bva-bar--over' : ''}`}
                      style={{ height: `${m.actual}%` }}
                    />
                  </div>
                  <div className="faint bva-label">{m.month}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
