import { useId, useState } from 'react'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import './Goals.css'

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  behind_pace: { label: 'Behind pace', tone: 'warn' },
  on_track: { label: 'On track', tone: 'ok' },
  just_started: { label: 'Just started', tone: 'faint' },
  goal_reached: { label: 'Goal reached', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
}

function AddFundsForm({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const finance = useFinance()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const inputId = useId()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    finance.addGoalFunds(goalId, value)
    onClose()
  }

  return (
    <form className="add-funds-form" onSubmit={handleSubmit}>
      <label className="add-funds-field">
        <span className="visually-hidden" id={inputId}>
          Amount to add
        </span>
        <input
          type="text"
          inputMode="decimal"
          className="tx-input"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-labelledby={inputId}
          autoFocus
        />
      </label>
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      <div className="add-funds-actions">
        <button type="button" className="btn btn--ghost btn--compact" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary btn--compact">
          Add
        </button>
      </div>
    </form>
  )
}

function CreateGoalForm({ onClose }: { onClose: () => void }) {
  const finance = useFinance()
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [monthlyContribution, setMonthlyContribution] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const target = Number(targetAmount)
    if (!name.trim()) {
      setError('Goal name is required.')
      return
    }
    if (!targetAmount || Number.isNaN(target) || target <= 0) {
      setError('Enter a target amount greater than zero.')
      return
    }
    if (!targetDate) {
      setError('Target date is required.')
      return
    }
    const monthly = monthlyContribution ? Number(monthlyContribution) : undefined
    if (monthly !== undefined && (Number.isNaN(monthly) || monthly < 0)) {
      setError('Monthly auto-save cannot be negative.')
      return
    }
    finance.createGoal({ name: name.trim(), targetAmount: target, targetDate, monthlyContribution: monthly })
    onClose()
  }

  return (
    <form className="create-goal-form" onSubmit={handleSubmit}>
      <label className="new-category-field">
        <span className="tx-label">Goal name</span>
        <input type="text" className="tx-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Phone" autoFocus />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Target amount</span>
        <input type="text" inputMode="decimal" className="tx-input" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0.00" />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Target date</span>
        <input type="date" className="tx-input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </label>
      <label className="new-category-field">
        <span className="tx-label">Monthly auto-save (optional)</span>
        <input type="text" inputMode="decimal" className="tx-input" value={monthlyContribution} onChange={(e) => setMonthlyContribution(e.target.value)} placeholder="0.00" />
      </label>
      {error && (
        <p className="tx-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Create goal
        </button>
      </div>
    </form>
  )
}

export function Goals() {
  const finance = useFinance()
  const [addFundsFor, setAddFundsFor] = useState<string | null>(null)
  const [creatingGoal, setCreatingGoal] = useState(false)

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
          <div className="eyebrow">Monthly Contribution</div>
          <div className="num kpi-val">{formatMoney(finance.monthlyContributionTotal)}</div>
          <div className="kpi-delta--up">auto-saved across {finance.activeGoals.length} active goals</div>
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
          return (
            <Card className="goal-card" key={g.id}>
              <div className="goal-top">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
                  <div className="faint" style={{ fontSize: 10 }}>
                    Target · {g.targetDate}
                  </div>
                </div>
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
                valueText={rawPct > 100 ? `${rawPct}% — goal exceeded` : `${rawPct}%`}
              />
              <div className={`goal-status goal-status--${status.tone}`}>
                {rawPct}% · {status.label}
              </div>
              {g.requiredContribution && (
                <div className="goal-required">Need ~{formatMoney(g.requiredContribution, { withCents: false })}/mo to reach this goal on time</div>
              )}
              <div className="goal-foot">
                <span className="faint">Auto-save {formatMoney(g.monthlyContribution ?? 0, { withCents: false })}/mo</span>
                {addFundsFor === g.id ? null : (
                  <button type="button" className="pill" onClick={() => setAddFundsFor(g.id)}>
                    + Add funds
                  </button>
                )}
              </div>
              {addFundsFor === g.id && <AddFundsForm goalId={g.id} onClose={() => setAddFundsFor(null)} />}
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
                Set a target, a date, and an auto-save amount.
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
              <div className="faint" style={{ fontSize: 10 }}>
                Reached {g.completedDate ?? g.targetDate} · {finance.goalRawProgressPct(g)}% of{' '}
                {formatMoney(g.targetAmount, { withCents: false })}
              </div>
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>
              {formatMoney(g.currentAmount, { withCents: false })}
            </div>
            <div className="completed-actions">
              <button type="button" className="btn btn--outline" disabled title="Coming soon">
                {g.id === 'home' ? 'Continue saving' : 'Increase target'}
              </button>
              <button type="button" className="btn btn--muted" disabled title="Coming soon">
                Archive
              </button>
            </div>
            <p className="visually-hidden">Continuing a goal, increasing its target, and archiving are planned for a future release.</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
