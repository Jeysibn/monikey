import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import {
  activeGoals,
  avgGoalProgressPct,
  completedGoals,
  formatMoney,
  monthlyContributionTotal,
  totalGoalSavings,
} from '../data/mockData'
import './Goals.css'

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  behind_pace: { label: 'Behind pace', tone: 'warn' },
  on_track: { label: 'On track', tone: 'ok' },
  just_started: { label: 'Just started', tone: 'faint' },
  goal_reached: { label: 'Goal reached', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
}

export function Goals() {
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Goals</h1>
      </div>

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Total Goal Savings</div>
          <div className="num kpi-val">{formatMoney(totalGoalSavings)}</div>
          <div className="kpi-delta--up">Across active and completed goals</div>
        </Card>
        <Card>
          <div className="eyebrow">Active Goals</div>
          <div className="num kpi-val">{activeGoals.length} goals</div>
          <div className="kpi-delta--up">{completedGoals.length} completed</div>
        </Card>
        <Card>
          <div className="eyebrow">Avg Progress</div>
          <div className="num kpi-val">{avgGoalProgressPct}%</div>
          <div className="kpi-delta--up">+5% this month</div>
        </Card>
        <Card>
          <div className="eyebrow">Monthly Contribution</div>
          <div className="num kpi-val">{formatMoney(monthlyContributionTotal)}</div>
          <div className="kpi-delta--up">auto-saved across {activeGoals.length} active goals</div>
        </Card>
      </div>

      <div className="goal-section-head">
        <span>Active Goals</span>
        <span className="faint">{activeGoals.length} in progress</span>
      </div>
      <div className="goal-grid">
        {activeGoals.map((g) => {
          const pct = Math.round((g.currentAmount / g.targetAmount) * 100)
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
              <ProgressBar pct={pct} color={status.tone === 'warn' ? 'var(--amber)' : 'var(--cyan)'} />
              <div className={`goal-status goal-status--${status.tone}`}>
                {pct}% · {status.label}
              </div>
              {g.requiredContribution && (
                <div className="goal-required">Need ~{formatMoney(g.requiredContribution, { withCents: false })}/mo to reach this goal on time</div>
              )}
              <div className="goal-foot">
                <span className="faint">Auto-save {formatMoney(g.monthlyContribution ?? 0, { withCents: false })}/mo</span>
                <button type="button" className="pill">
                  + Add funds
                </button>
              </div>
            </Card>
          )
        })}
        <Card className="add-goal-card">
          <div className="add-plus" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ fontWeight: 700 }}>New Goal</div>
          <div className="faint" style={{ textAlign: 'center' }}>
            Set a target, a date, and an auto-save amount.
          </div>
          <button type="button" className="btn btn--primary">
            Create goal
          </button>
        </Card>
      </div>

      <div className="goal-section-head">
        <span>Completed Goals</span>
        <span className="faint">{completedGoals.length} reached</span>
      </div>
      <div className="completed-row">
        {completedGoals.map((g) => (
          <Card className="completed-card" key={g.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
              <div className="faint" style={{ fontSize: 10 }}>
                Reached {g.targetDate} · {Math.round((g.currentAmount / g.targetAmount) * 100)}% of{' '}
                {formatMoney(g.targetAmount, { withCents: false })}
              </div>
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>
              {formatMoney(g.currentAmount, { withCents: false })}
            </div>
            <div className="completed-actions">
              <button type="button" className="btn btn--outline">
                {g.id === 'home' ? 'Continue saving' : 'Increase target'}
              </button>
              <button type="button" className="btn btn--muted">
                Archive
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
