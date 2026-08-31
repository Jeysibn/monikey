import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import './MoneyPosition.css'

/**
 * Monikey's one memorable dashboard element: explains the user's current
 * financial position as a relationship between real, derived figures —
 * not a decorative stat. See FR-009 in the frontend review brief, and
 * SR-008 for the "Estimated" qualifier, placement, and breakdown wording.
 *
 * The label is "Estimated safe to spend" rather than a bare "Safe to
 * spend" because the inputs are known to be incomplete: recurring bills
 * (rent, subscriptions, utilities) have no data source in this app yet
 * and are excluded, not assumed to be zero.
 */
export function MoneyPosition() {
  const finance = useFinance()
  const { availableCash, upcomingCreditMinimums, plannedGoalContributions, safeToSpend } = finance.safeToSpendBreakdown

  const steps = [
    { label: 'Available cash', value: availableCash, hint: `${finance.state.accounts.length} cash sources` },
    { label: 'Upcoming commitments', value: upcomingCreditMinimums, hint: 'Credit card minimum payments due soon' },
    { label: 'Planned goal contributions', value: plannedGoalContributions, hint: 'This month’s pledged pace across active goals, not yet moved' },
    { label: 'Estimated safe to spend', value: safeToSpend, hint: 'What’s left after known commitments', emphasis: true },
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
        You have {formatMoney(availableCash, { withCents: false })} in cash. After{' '}
        {formatMoney(upcomingCreditMinimums, { withCents: false })} in upcoming card payments and{' '}
        {formatMoney(plannedGoalContributions, { withCents: false })} planned toward goals this month (not yet moved out of your accounts), you have an{' '}
        <strong>estimated {formatMoney(safeToSpend, { withCents: false })} safe to spend</strong>.
      </p>
      <p className="money-position-scope faint">
        Included: cash account balances, credit card minimum payments, and this month’s planned goal contributions. Excluded: recurring
        bills and subscriptions — Monikey doesn’t track those yet, so this estimate may be higher than what’s truly free to spend.
      </p>
    </section>
  )
}
