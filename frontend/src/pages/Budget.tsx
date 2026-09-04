import { useState } from 'react'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { useFinance } from '../hooks/useFinance'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { formatMoney } from '../utils/currency'
import { parseMoneyInput } from '../utils/money'
import { FinanceValidationError } from '../domain/financeRules'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import './Budget.css'

const CATEGORY_FIELDS = ['name', 'allocated'] as const
type CategoryField = (typeof CATEGORY_FIELDS)[number]

export function Budget() {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const { budgetCategories, categories, budgetVsActual, totalBudgetAllocated } = finance.state
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [allocated, setAllocated] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAllocated, setEditAllocated] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const { errors, field, errorId, fail, clear } = useFieldErrors<CategoryField>(CATEGORY_FIELDS)
  const { errors: editErrors, field: editField, errorId: editErrorId, fail: editFail, clear: editClear } = useFieldErrors<CategoryField>(CATEGORY_FIELDS)

  const overNames = budgetCategories
    .filter((c) => finance.budgetStatus(c.allocated, c.spent) === 'over_budget')
    .map((c) => categories.find((cc) => cc.id === c.id)?.name ?? c.id)
    .join(', ')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      fail({ name: 'Category name is required.' })
      return
    }
    if (!allocated.trim()) {
      fail({ allocated: 'Enter a budget amount greater than zero.' })
      return
    }
    const result = parseMoneyInput(allocated)
    if (!result.ok) {
      fail({ allocated: result.error })
      return
    }
    if (result.value <= 0) {
      fail({ allocated: 'Enter a budget amount greater than zero.' })
      return
    }
    // The unallocated-funds and envelope-size rules live in the repository
    // (see SR-002/TR-002) so this form doesn't duplicate financial logic —
    // it just surfaces whatever the repository rejects on the field at fault.
    try {
      setSubmitting(true)
      if (asyncFinance) await asyncFinance.addBudgetCategory({ name: trimmedName, allocated: result.value })
      else finance.addBudgetCategory({ name: trimmedName, allocated: result.value })
    } catch (err) {
      const at = err instanceof FinanceValidationError && err.field ? (err.field as CategoryField) : 'allocated'
      fail({ [at]: err instanceof Error ? err.message : 'Could not add category.' })
      return
    } finally {
      setSubmitting(false)
    }
    setName('')
    setAllocated('')
    clear()
    setFormOpen(false)
  }

  function startEdit(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId)
    const budgetCategory = budgetCategories.find((bc) => bc.id === categoryId)
    if (category && budgetCategory) {
      setEditingId(categoryId)
      setEditName(category.name)
      setEditAllocated(formatMoney(budgetCategory.allocated, { withCents: false }).replace(/[^\d.]/g, ''))
      editClear()
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditAllocated('')
    editClear()
  }

  async function handleEditSubmit(e: React.FormEvent, categoryId: string) {
    e.preventDefault()
    const trimmedName = editName.trim()
    if (!trimmedName) {
      editFail({ name: 'Category name is required.' })
      return
    }
    if (!editAllocated.trim()) {
      editFail({ allocated: 'Enter a budget amount greater than zero.' })
      return
    }
    const result = parseMoneyInput(editAllocated)
    if (!result.ok) {
      editFail({ allocated: result.error })
      return
    }
    if (result.value <= 0) {
      editFail({ allocated: 'Enter a budget amount greater than zero.' })
      return
    }
    try {
      setEditSubmitting(true)
      if (asyncFinance) await asyncFinance.updateCategory(categoryId, { name: trimmedName, allocated: result.value })
      else finance.updateCategory(categoryId, { name: trimmedName, allocated: result.value })
    } catch (err) {
      const at = err instanceof FinanceValidationError && err.field ? (err.field as CategoryField) : 'allocated'
      editFail({ [at]: err instanceof Error ? err.message : 'Could not update category.' })
      return
    } finally {
      setEditSubmitting(false)
    }
    cancelEdit()
  }

  async function handleDelete(categoryId: string) {
    if (!window.confirm('Are you sure you want to delete this category? Transactions assigned to it will be uncategorized.')) {
      return
    }
    try {
      if (asyncFinance) await asyncFinance.deleteCategory(categoryId)
      else finance.deleteCategory(categoryId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete category.')
    }
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
          <div className="budget-meta">{finance.activePeriodLabel}</div>
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
            <form className="new-category-form" onSubmit={handleSubmit} noValidate>
              <label className="new-category-field">
                <span className="tx-label">Category name</span>
                <input
                  type="text"
                  className="tx-input"
                  value={name}
                  placeholder="e.g. Entertainment"
                  aria-label="Category name"
                  {...field('name', (e) => setName(e.target.value))}
                />
                {errors.name && (
                  <p className="tx-error" role="alert" id={errorId('name')}>
                    {errors.name}
                  </p>
                )}
              </label>
              <label className="new-category-field">
                <span className="tx-label">Monthly budget</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="tx-input"
                  value={allocated}
                  placeholder="0.00"
                  aria-label="Monthly budget"
                  {...field('allocated', (e) => setAllocated(e.target.value))}
                />
                {errors.allocated && (
                  <p className="tx-error" role="alert" id={errorId('allocated')}>
                    {errors.allocated}
                  </p>
                )}
              </label>
              <div className="new-category-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={submitting || asyncFinance?.status === 'loading'}>
                  {submitting ? 'Saving…' : 'Add category'}
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
            const isEditing = editingId === c.id
            return (
              <div key={c.id}>
                {isEditing ? (
                  <form className="new-category-form" onSubmit={(e) => void handleEditSubmit(e, c.id)} noValidate>
                    <label className="new-category-field">
                      <span className="tx-label">Category name</span>
                      <input
                        type="text"
                        className="tx-input"
                        value={editName}
                        placeholder="e.g. Entertainment"
                        aria-label="Category name"
                        {...editField('name', (e) => setEditName(e.target.value))}
                      />
                      {editErrors.name && (
                        <p className="tx-error" role="alert" id={editErrorId('name')}>
                          {editErrors.name}
                        </p>
                      )}
                    </label>
                    <label className="new-category-field">
                      <span className="tx-label">Monthly budget</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="tx-input"
                        value={editAllocated}
                        placeholder="0.00"
                        aria-label="Monthly budget"
                        {...editField('allocated', (e) => setEditAllocated(e.target.value))}
                      />
                      {editErrors.allocated && (
                        <p className="tx-error" role="alert" id={editErrorId('allocated')}>
                          {editErrors.allocated}
                        </p>
                      )}
                    </label>
                    <div className="new-category-actions">
                      <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn--primary" disabled={editSubmitting || asyncFinance?.status === 'loading'}>
                        {editSubmitting ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="budget-row">
                    <div className="budget-row-mid">
                      <div className="budget-row-top">
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{category?.name ?? c.id}</span>
                        <span className="budget-meta">
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
                        <div className="budget-forecast">
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
                    <div className="budget-row-actions">
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => startEdit(c.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn--ghost btn--compact" onClick={() => void handleDelete(c.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
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
              <span className="budget-meta">Last 6 months</span>
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
