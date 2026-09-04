import { useState } from 'react'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { useFinance } from '../hooks/useFinance'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { formatMoney } from '../utils/currency'
import { parseMoneyInput } from '../utils/money'
import { formatGoalDate, isIsoDateBefore, isValidIsoDate } from '../utils/date'
import { FinanceValidationError } from '../domain/financeRules'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import './Goals.css'

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  behind_pace: { label: 'Behind pace', tone: 'warn' },
  on_track: { label: 'On track', tone: 'ok' },
  just_started: { label: 'Just started', tone: 'faint' },
  goal_reached: { label: 'Goal reached', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
}

const FUNDS_FIELDS = ['sourceAccountId', 'amount'] as const
type FundsField = (typeof FUNDS_FIELDS)[number]

function AddFundsForm({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const cashAccounts = finance.state.accounts.filter((a) => a.classification === 'asset')
  const [amount, setAmount] = useState('')
  const [sourceAccountId, setSourceAccountId] = useState(cashAccounts[0]?.id || '')
  const { errors, field, errorId, fail } = useFieldErrors<FundsField>(FUNDS_FIELDS)
  const [submitting, setSubmitting] = useState(false)

  // TR-004: the ceiling shown to the user is the smaller of what the source
  // account actually holds and what the goal still needs — derived by the
  // domain rule (`maxFundableAmount`), not recomputed here, so the form can
  // never offer an amount the repository would reject.
  const maxFundable = finance.maxFundableAmount(goalId, sourceAccountId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sourceAccountId) {
      fail({ sourceAccountId: 'Select an account to fund this goal from.' })
      return
    }
    if (!amount.trim()) {
      fail({ amount: 'Enter an amount greater than zero.' })
      return
    }
    const result = parseMoneyInput(amount)
    if (!result.ok) {
      fail({ amount: result.error })
      return
    }
    if (result.value <= 0) {
      fail({ amount: 'Enter an amount greater than zero.' })
      return
    }
    try {
      setSubmitting(true)
      if (asyncFinance) {
        await asyncFinance.addGoalFunds(goalId, sourceAccountId, result.value, finance.todayIso)
      } else {
        finance.addGoalFunds(goalId, sourceAccountId, result.value)
      }
      onClose()
    } catch (err) {
      const at = err instanceof FinanceValidationError && err.field === 'sourceAccountId' ? 'sourceAccountId' : 'amount'
      fail({ [at]: err instanceof Error ? err.message : 'Could not add funds.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="add-funds-form" onSubmit={handleSubmit} noValidate>
      <label className="add-funds-field">
        <select
          className="tx-input"
          value={sourceAccountId}
          aria-label="Fund from account"
          {...field('sourceAccountId', (e) => setSourceAccountId(e.target.value))}
        >
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {formatMoney(a.balance)} available
            </option>
          ))}
        </select>
        {errors.sourceAccountId && (
          <p className="tx-error" role="alert" id={errorId('sourceAccountId')}>
            {errors.sourceAccountId}
          </p>
        )}
      </label>
      <label className="add-funds-field">
        <input
          type="text"
          inputMode="decimal"
          className="tx-input"
          placeholder="0.00"
          value={amount}
          aria-label="Amount to add"
          autoFocus
          {...field('amount', (e) => setAmount(e.target.value))}
        />
        {errors.amount && (
          <p className="tx-error" role="alert" id={errorId('amount')}>
            {errors.amount}
          </p>
        )}
      </label>
      <p className="form-help">
        Up to {formatMoney(maxFundable)} — the smaller of this account's balance and what the goal still needs. The money moves out of the
        selected account.
      </p>
      <div className="add-funds-actions">
        <button type="button" className="btn btn--ghost btn--compact" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary btn--compact" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

const GOAL_FIELDS = ['name', 'targetAmount', 'targetDate', 'monthlyContribution'] as const
type GoalField = (typeof GOAL_FIELDS)[number]

function CreateGoalForm({ onClose, editingGoal }: { onClose: () => void; editingGoal?: { id: string; name: string; targetAmount: number; targetDate: string; monthlyContribution?: number } }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const [name, setName] = useState(editingGoal?.name || '')
  const [targetAmount, setTargetAmount] = useState(editingGoal?.targetAmount ? String(editingGoal.targetAmount) : '')
  const [targetDate, setTargetDate] = useState(editingGoal?.targetDate || '')
  const [monthlyContribution, setMonthlyContribution] = useState(editingGoal?.monthlyContribution ? String(editingGoal.monthlyContribution) : '')
  const { errors, field, errorId, fail } = useFieldErrors<GoalField>(GOAL_FIELDS)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      fail({ name: 'Goal name is required.' })
      return
    }
    if (!targetAmount.trim()) {
      fail({ targetAmount: 'Enter a target amount greater than zero.' })
      return
    }
    const targetResult = parseMoneyInput(targetAmount)
    if (!targetResult.ok) {
      fail({ targetAmount: targetResult.error })
      return
    }
    if (targetResult.value <= 0) {
      fail({ targetAmount: 'Enter a target amount greater than zero.' })
      return
    }
    if (!targetDate) {
      fail({ targetDate: 'Target date is required.' })
      return
    }
    if (!isValidIsoDate(targetDate)) {
      fail({ targetDate: 'Enter a real target date.' })
      return
    }
    // TR-001: "in the past" is measured against the one application clock,
    // the same one the repository validates against.
    if (isIsoDateBefore(targetDate, finance.todayIso)) {
      fail({ targetDate: 'Target date can\'t be in the past.' })
      return
    }
    let monthly: number | undefined
    if (monthlyContribution.trim()) {
      const monthlyResult = parseMoneyInput(monthlyContribution)
      if (!monthlyResult.ok) {
        fail({ monthlyContribution: monthlyResult.error })
        return
      }
      monthly = monthlyResult.value
    }
    try {
      setSubmitting(true)
      const input = { name: name.trim(), targetAmount: targetResult.value, targetDate, monthlyContribution: monthly }
      if (editingGoal && asyncFinance) {
        await asyncFinance.updateGoal(editingGoal.id, input)
      } else if (asyncFinance) {
        await asyncFinance.createGoal(input)
      } else if (editingGoal) {
        // Sync path - not implemented for edit
        throw new Error('Edit not supported in sync mode')
      } else {
        finance.createGoal(input)
      }
      onClose()
    } catch (err) {
      const at = err instanceof FinanceValidationError && err.field ? (err.field as GoalField) : 'name'
      fail({ [at]: err instanceof Error ? err.message : editingGoal ? 'Could not update goal.' : 'Could not create goal.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="create-goal-form" onSubmit={handleSubmit} noValidate>
      <label className="new-category-field">
        <span className="tx-label">Goal name</span>
        <input
          type="text"
          className="tx-input"
          value={name}
          placeholder="e.g. New Phone"
          autoFocus
          {...field('name', (e) => setName(e.target.value))}
        />
        {errors.name && (
          <p className="tx-error" role="alert" id={errorId('name')}>
            {errors.name}
          </p>
        )}
      </label>
      <label className="new-category-field">
        <span className="tx-label">Target amount</span>
        <input
          type="text"
          inputMode="decimal"
          className="tx-input"
          value={targetAmount}
          placeholder="0.00"
          {...field('targetAmount', (e) => setTargetAmount(e.target.value))}
        />
        {errors.targetAmount && (
          <p className="tx-error" role="alert" id={errorId('targetAmount')}>
            {errors.targetAmount}
          </p>
        )}
      </label>
      <label className="new-category-field">
        <span className="tx-label">Target date</span>
        <input
          type="date"
          className="tx-input"
          min={finance.todayIso}
          value={targetDate}
          {...field('targetDate', (e) => setTargetDate(e.target.value))}
        />
        {errors.targetDate && (
          <p className="tx-error" role="alert" id={errorId('targetDate')}>
            {errors.targetDate}
          </p>
        )}
      </label>
      <label className="new-category-field">
        {/* TR-004: "planned", not "auto-save" — nothing moves this money
            automatically; it is only a plan Money Position reserves against. */}
        <span className="tx-label">Planned monthly contribution (optional)</span>
        <input
          type="text"
          inputMode="decimal"
          className="tx-input"
          value={monthlyContribution}
          placeholder="0.00"
          {...field('monthlyContribution', (e) => setMonthlyContribution(e.target.value))}
        />
        {errors.monthlyContribution && (
          <p className="tx-error" role="alert" id={errorId('monthlyContribution')}>
            {errors.monthlyContribution}
          </p>
        )}
      </label>
      <p className="form-help">
        A planned contribution is a target pace, not an automatic transfer — you still add funds yourself.
      </p>
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {editingGoal
            ? submitting
              ? 'Updating…'
              : 'Update goal'
            : submitting
              ? 'Creating…'
              : 'Create goal'}
        </button>
      </div>
    </form>
  )
}

export function Goals() {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const [addFundsFor, setAddFundsFor] = useState<string | null>(null)
  const [creatingGoal, setCreatingGoal] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null)

  const handleDeleteGoal = async (goalId: string) => {
    if (!window.confirm('Are you sure you want to delete this goal? This action cannot be undone.')) return
    if (!asyncFinance) return
    try {
      setDeletingGoalId(goalId)
      await asyncFinance.deleteGoal(goalId)
    } catch (err) {
      console.error('Failed to delete goal:', err)
    } finally {
      setDeletingGoalId(null)
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Goals</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Total Goal Savings</div>
          <div className="num kpi-val">{formatMoney(finance.totalGoalSavings)}</div>
          <div className="kpi-delta--up">Across active and completed goals</div>
        </Card>
        <Card>
          <div className="eyebrow">Active Goals</div>
          <div className="num kpi-val">{finance.activeGoals.length} goals</div>
          <div className="kpi-delta--up">{finance.completedGoals.length} completed</div>
        </Card>
        <Card>
          <div className="eyebrow">Avg Progress · active goals</div>
          <div className="num kpi-val">{finance.avgGoalProgressPct}%</div>
        </Card>
        <Card>
          <div className="eyebrow">Planned Monthly Contribution</div>
          <div className="num kpi-val">{formatMoney(finance.plannedMonthlyContributionTotal)}</div>
          <div className="kpi-delta--up">planned across {finance.activeGoals.length} active goals</div>
        </Card>
      </div>

      <div className="goal-section-head">
        <span>Active Goals</span>
        <span className="faint">{finance.activeGoals.length} in progress</span>
      </div>
      <div className="goal-grid">
        {finance.activeGoals.map((g) => {
          const pct = finance.goalProgressPct(g)
          const rawPct = finance.goalRawProgressPct(g)
          const status = STATUS_LABEL[g.status]
          const isEditingThisGoal = editingGoalId === g.id
          return (
            <Card className="goal-card" key={g.id}>
              {!isEditingThisGoal && (
                <>
                  <div className="goal-top">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
                      <div className="goal-meta">Target · {formatGoalDate(g.targetDate)}</div>
                    </div>
                    {asyncFinance && (
                      <div className="goal-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--compact"
                          onClick={() => setEditingGoalId(g.id)}
                          title="Edit goal"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--compact"
                          onClick={() => void handleDeleteGoal(g.id)}
                          disabled={deletingGoalId === g.id}
                          title="Delete goal"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="goal-nums">
                    <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>
                      {formatMoney(g.currentAmount, { withCents: false })}
                    </span>
                    <span className="faint">of {formatMoney(g.targetAmount, { withCents: false })}</span>
                  </div>
                  <ProgressBar
                    pct={pct}
                    color={status.tone === 'warn' ? 'var(--amber)' : 'var(--cyan)'}
                    label={`${g.name} goal progress`}
                    valueText={`${rawPct}%`}
                  />
                  <div className={`goal-status goal-status--${status.tone}`}>
                    {rawPct}% · {status.label}
                  </div>
                  {g.requiredContribution && (
                    <div className="goal-required">Need ~{formatMoney(g.requiredContribution, { withCents: false })}/mo to reach this goal on time</div>
                  )}
                  <div className="goal-foot">
                    <span className="goal-meta">Monthly plan {formatMoney(g.monthlyContribution || 0, { withCents: false })}/mo</span>
                    {addFundsFor === g.id ? null : (
                      <button type="button" className="pill" onClick={() => setAddFundsFor(g.id)}>
                        + Add funds
                      </button>
                    )}
                  </div>
                  {addFundsFor === g.id && <AddFundsForm goalId={g.id} onClose={() => setAddFundsFor(null)} />}
                </>
              )}
              {isEditingThisGoal && (
                <CreateGoalForm
                  onClose={() => setEditingGoalId(null)}
                  editingGoal={{
                    id: g.id,
                    name: g.name,
                    targetAmount: g.targetAmount,
                    targetDate: g.targetDate,
                    monthlyContribution: g.monthlyContribution,
                  }}
                />
              )}
            </Card>
          )
        })}
        <Card className="add-goal-card">
          {creatingGoal ? (
            <CreateGoalForm onClose={() => setCreatingGoal(false)} />
          ) : (
            <>
              <div className="add-plus" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontWeight: 700 }}>New Goal</div>
              <div className="faint" style={{ textAlign: 'center' }}>
                Set a target, a date, and a planned monthly amount.
              </div>
              <button type="button" className="btn btn--primary" onClick={() => setCreatingGoal(true)}>
                Create goal
              </button>
            </>
          )}
        </Card>
      </div>

      <div className="goal-section-head">
        <span>Completed Goals</span>
        <span className="faint">{finance.completedGoals.length} reached</span>
      </div>
      <div className="completed-row">
        {finance.completedGoals.map((g) => (
          <Card className="completed-card" key={g.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
              <div className="goal-meta">
                Reached {formatGoalDate(g.completedDate || g.targetDate)} · {finance.goalRawProgressPct(g)}% of{' '}
                {formatMoney(g.targetAmount, { withCents: false })}
              </div>
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>
              {formatMoney(g.currentAmount, { withCents: false })}
            </div>
            <div className="completed-actions">
              <button type="button" className="btn btn--outline" disabled title="Coming soon">
                {g.id === 'home' ? 'Continue saving' : 'Increase target'}
                <span className="coming-soon-tag">Coming soon</span>
              </button>
              <button type="button" className="btn btn--muted" disabled title="Coming soon">
                Archive
                <span className="coming-soon-tag">Coming soon</span>
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
