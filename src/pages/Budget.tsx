import { useId, useRef, useState } from 'react'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import { parseMoneyInput } from '../utils/money'
import './Budget.css'

export function Budget() {
  const finance = useFinance()
  const { budgetCategories, categories, budgetVsActual, totalBudgetAllocated } = finance.state
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [allocated, setAllocated] = useState('')
  const [error, setError] = useState('')
  const nameId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const overNames = budgetCategories
    .filter((c) => finance.budgetStatus(c.allocated, c.spent) === 'over_budget')
    .map((c) => categories.find((cc) => cc.id === c.id)?.name ?? c.id)
    .join(', ')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Category name is required.')
      return
    }
    if (!allocated.trim()) {
      setError('Enter a budget amount greater than zero.')
      return
    }
    const result = parseMoneyInput(allocated)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.value <= 0) {
      setError('Enter a budget amount greater than zero.')
      return
    }
    // The unallocated-funds and envelope-size rules live in the repository
    // (see SR-002) so this form doesn't duplicate financial logic — it just
    // surfaces whatever the repository rejects as an inline error.
    try {
      finance.addBudgetCategory({ name: trimmedName, allocated: result.value })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add category.')
      return
    }
    setName('')
    setAllocated('')
    setError('')
    setFormOpen(false)
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Budget</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Total Budget</div>
          <div className="num kpi-val">{formatMoney(totalBudgetAllocated, { withCents: false })}</div>
          <div className="faint">This month</div>
        </Card>
        <Card>
          <div className="eyebrow">Spent So Far</div>
          <div className="num kpi-val">{formatMoney(finance.totalBudgetSpent, { withCents: false })}</div>
          <div className="kpi-delta--up">{finance.budgetUsedPct}% of budget used</div>
        </Card>
        <Card>
          <div className="eyebrow">Remaining</div>
          <div className="num kpi-val">{formatMoney(finance.totalBudgetRemaining, { withCents: false })}</div>
          <div className="kpi-delta--up">Within total budget · {finance.budgetDaysRemaining} days left</div>
        </Card>
        <Card>
          <div className="eyebrow">Over Budget</div>
          <div className="num kpi-val">{finance.budgetOverCount} categories</div>
          <div className="kpi-delta--down">{overNames || 'None'}</div>
        </Card>
      </div>

      <div className="budget-split">
        <Card className="cat-card">
          <div className="section-head">
            <span className="card-title-text">Category Budgets</span>
            <button type="button" className="add-link" aria-expanded={formOpen} onClick={() => setFormOpen((v) => !v)}>
              + New category
            </button>
          </div>

          {formOpen && (
            <form ref={formRef} className="new-category-form" onSubmit={handleSubmit}>
              <label className="new-category-field">
                <span className="tx-label" id={nameId}>
                  Category name
                </span>
                <input
                  type="text"
                  className="tx-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Entertainment"
                  aria-labelledby={nameId}
                />
              </label>
              <label className="new-category-field">
                <span className="tx-label">Monthly budget</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="tx-input"
                  value={allocated}
                  onChange={(e) => setAllocated(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              {error && (
                <p className="tx-error" role="alert">
                  {error}
                </p>
              )}
              <div className="new-category-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Add category
                </button>
              </div>
            </form>
          )}

          {budgetCategories.map((c) => {
            const status = finance.budgetStatus(c.allocated, c.spent)
            const rawPct = Math.round((c.spent / c.allocated) * 100)
            const diff = c.allocated - c.spent
            const category = categories.find((cc) => cc.id === c.id)
            const valueText =
              diff < 0
                ? `${rawPct}% used, ${formatMoney(Math.abs(diff), { withCents: false })} over budget`
                : `${rawPct}% used, ${formatMoney(diff, { withCents: false })} left`
            return (
              <div className="budget-row" key={c.id}>
                <div className="budget-row-mid">
                  <div className="budget-row-top">
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{category?.name ?? c.id}</span>
                    <span className="faint" style={{ fontSize: 10.5 }}>
                      {formatMoney(c.spent, { withCents: false })} / {formatMoney(c.allocated, { withCents: false })}
                    </span>
                  </div>
                  <ProgressBar
                    pct={rawPct}
                    color={status === 'over_budget' ? 'var(--red)' : status === 'near_limit' ? 'var(--amber)' : 'var(--cyan)'}
                    label={`${category?.name ?? c.id} budget used`}
                    valueText={valueText}
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
                {finance.budgetUsedPct}% used
              </span>
            </div>
            <ProgressBar pct={finance.budgetUsedPct} label="Overall budget used" />
            <ul className="mini-list">
              <li>
                Days remaining <span className="num">{finance.budgetDaysRemaining}</span>
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
              <li>
                Unallocated <span className="num">{formatMoney(finance.budgetUnallocated, { withCents: false })}</span>
              </li>
            </ul>
          </Card>

          <Card>
            <div className="section-head">
              <span className="card-title-text">Budget vs Actual</span>
              <span className="faint" style={{ fontSize: 10.5 }}>
                Last 6 months
              </span>
            </div>
            <div className="bva-legend">
              <span className="bva-legend-item">
                <span className="bva-swatch bva-swatch--budget" /> Budget
              </span>
              <span className="bva-legend-item">
                <span className="bva-swatch bva-swatch--actual" /> Actual
              </span>
              <span className="bva-legend-item">
                <span className="bva-swatch bva-swatch--over" /> Actual (over budget)
              </span>
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
            <div className="visually-hidden">
              <table>
                <caption>Budget vs actual spending by month, as a percentage of the monthly budget</caption>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Budget</th>
                    <th>Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetVsActual.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td>{m.budget}%</td>
                      <td>
                        {m.actual}% {m.actual > m.budget ? '(over budget)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
