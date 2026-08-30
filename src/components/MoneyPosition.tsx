import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import './MoneyPosition.css'

/**
 * Monikey's one memorable dashboard element: explains the user's current
 * financial position as a relationship between real, derived figures —
 * not a decorative stat. See FR-009 in the frontend review brief.
 */
export function MoneyPosition() {
  const finance = useFinance()
  const upcomingCommitments = finance.state.creditCards.reduce((s, c) => s + c.minPayment, 0)
  const allocatedToGoals = finance.monthlyContributionTotal
  const safeToSpend = Math.max(0, finance.totalAvailableCash - upcomingCommitments - allocatedToGoals)

  const steps = [
    { label: 'Available cash', value: finance.totalAvailableCash, hint: `${finance.state.accounts.length} cash sources` },
    { label: 'Upcoming commitments', value: upcomingCommitments, hint: 'Credit card minimum payments due soon' },
    { label: 'Allocated to goals', value: allocatedToGoals, hint: 'This month’s auto-save across active goals' },
    { label: 'Safe to spend', value: safeToSpend, hint: 'What’s left after commitments and goals', emphasis: true },
  ]

  return (
    <section className="money-position" aria-label="Your current money position">
      <h2 className="money-position-title">Your money position</h2>
      <div className="money-position-flow">
        {steps.map((step, i) => (
          <div className="money-position-step-wrap" key={step.label}>
            <div className={`money-position-step${step.emphasis ? ' money-position-step--emphasis' : ''}`}>
              <div className="money-position-amt num">{formatMoney(step.value, { withCents: false })}</div>
              <div className="money-position-label">{step.label}</div>
              <div className="money-position-hint faint">{step.hint}</div>
            </div>
            {i < steps.length - 1 && (
              <svg className="money-position-arrow" width="20" height="14" viewBox="0 0 24 16" fill="none" aria-hidden="true">
                <path d="M2 8h18M14 2l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="money-position-summary faint">
        You have {formatMoney(finance.totalAvailableCash, { withCents: false })} in cash. After{' '}
        {formatMoney(upcomingCommitments, { withCents: false })} in upcoming card payments and{' '}
        {formatMoney(allocatedToGoals, { withCents: false })} auto-saved toward goals this month, you have{' '}
        <strong>{formatMoney(safeToSpend, { withCents: false })} safe to spend</strong>.
      </p>
    </section>
  )
}
