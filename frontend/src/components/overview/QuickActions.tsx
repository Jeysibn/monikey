import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard } from 'lucide-react'

import { Button } from '@/components/ui/button'

/*
 * The everyday actions, one tap from the top of Overview (spec section 3): record an expense, record income, move
 * money between your own accounts, pay a card. Each opens the existing Quick Add flow with that kind chosen.
 * They wait until the accounts have loaded, and Pay card says why it is off when no card owes anything. Spending
 * on a credit card is an Expense (it adds to what you owe); paying the card is a separate action, not an expense.
 */
export function QuickActions({
  disabled,
  canPay,
  onExpense,
  onIncome,
  onTransfer,
  onPayCard,
}: {
  disabled: boolean // accounts are still loading, or there are none yet
  canPay: boolean // some card has something owed
  onExpense: () => void
  onIncome: () => void
  onTransfer: () => void
  onPayCard: () => void
}) {
  const payOff = !disabled && !canPay
  return (
    <section aria-label="Quick actions" className="min-w-0">
      <div className="grid grid-cols-2 gap-2 min-[560px]:flex min-[560px]:flex-wrap">
        <Button variant="secondary" className="min-h-11 min-[560px]:min-w-36" disabled={disabled} onClick={onExpense}>
          <ArrowUpRight aria-hidden="true" />
          Add expense
        </Button>
        <Button variant="secondary" className="min-h-11 min-[560px]:min-w-36" disabled={disabled} onClick={onIncome}>
          <ArrowDownLeft aria-hidden="true" />
          Add income
        </Button>
        <Button variant="secondary" className="min-h-11 min-[560px]:min-w-36" disabled={disabled} onClick={onTransfer}>
          <ArrowLeftRight aria-hidden="true" />
          Transfer
        </Button>
        <Button variant="secondary" className="min-h-11 min-[560px]:min-w-36" disabled={disabled || payOff} aria-describedby={payOff ? 'quick-pay-reason' : undefined} onClick={onPayCard}>
          <CreditCard aria-hidden="true" />
          Pay card
        </Button>
      </div>
      {payOff && <p id="quick-pay-reason" className="sr-only">Pay card is off: no card has anything to pay.</p>}
    </section>
  )
}
