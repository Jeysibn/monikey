import { afterEach, describe, expect, it, beforeAll } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AddTransactionModal } from './AddTransactionModal'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { activeReportingPeriod } from '../state/financeSelectors'
import { isDateInPeriod } from '../utils/date'

// jsdom does not implement the modal-dialog rendering behavior; the app's
// own logic is what's under test here, so give it the minimal stand-in.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false
    }
  }
})

// Vitest runs without `globals`, so Testing Library's automatic cleanup hook
// is never registered — unmount between tests explicitly or each render's DOM
// piles up in the same document.
afterEach(cleanup)

function renderModal(todayIso: string) {
  return render(
    <FinanceProvider clock={fixedClock(todayIso)}>
      <AddTransactionModal open onClose={() => {}} />
    </FinanceProvider>,
  )
}

// TR-001: the form default date and the reporting period must come from the
// SAME clock. Before this, the form called `new Date()` while every KPI used
// a fixed demo date — so once the real calendar left that month, a default
// transaction landed outside the window whose totals it was supposed to move.
describe('AddTransactionModal default date (TR-001)', () => {
  it.each(['2026-08-29', '2027-01-15', '2028-02-29'])('defaults to the injected clock’s today at %s', (todayIso) => {
    const { container } = renderModal(todayIso)
    const dateInput = container.querySelector<HTMLInputElement>('input[type="date"]')!
    expect(dateInput.value).toBe(todayIso)
    // …and that default always falls inside the active reporting period.
    expect(isDateInPeriod(dateInput.value, activeReportingPeriod(todayIso))).toBe(true)
  })

})

describe('AddTransactionModal transfer destinations (TR-003)', () => {
  it('offers credit cards as a destination but never as a source (no cash advances)', () => {
    renderModal('2026-08-29')
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))

    const from = screen.getByLabelText(/From Account/) as HTMLSelectElement
    const to = screen.getByLabelText(/To Account/) as HTMLSelectElement
    const optionText = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.textContent)

    expect(optionText(to)).toContain('Visa Platinum ••2290')
    expect(optionText(from)).not.toContain('Visa Platinum ••2290')
    // The card options are grouped under an explicit "pay a card" heading.
    expect(Array.from(to.querySelectorAll('optgroup')).map((g) => g.label)).toContain('Credit cards (pay a card)')
  })

  it('explains the card-payment semantics once a card is chosen as the destination', () => {
    renderModal('2026-08-29')
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    fireEvent.change(screen.getByLabelText(/From Account/), { target: { value: 'checking' } })
    fireEvent.change(screen.getByLabelText(/To Account/), { target: { value: 'visa' } })

    expect(screen.getByText(/Credit card payment:/)).toBeDefined()
    expect(screen.getByText(/income and expense totals don’t change/)).toBeDefined()
  })
})
