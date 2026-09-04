import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Recurring } from './Recurring'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock, DEMO_TODAY_ISO } from '../utils/clock'
import { formatMoney } from '../utils/currency'

// Vitest runs without `globals`, so Testing Library's automatic cleanup hook
// is never registered — unmount between tests explicitly, matching the
// convention in AddTransactionModal.test.tsx.
afterEach(cleanup)

function renderPage(todayIso: string = DEMO_TODAY_ISO) {
  return render(
    <FinanceProvider clock={fixedClock(todayIso)}>
      <Recurring />
    </FinanceProvider>,
  )
}

function rowFor(merchant: string): HTMLElement {
  const label = screen.getByText(merchant)
  const row = label.closest('li')
  if (!row) throw new Error(`Could not find a row for "${merchant}"`)
  return row as HTMLElement
}

describe('Recurring seed data and derived due state', () => {
  it('renders every seeded merchant', () => {
    renderPage()
    for (const merchant of ['Netflix', 'Spotify', 'PLDT Internet', 'Meralco', 'Landlord — Unit 4B', 'Sun Life Insurance', 'Personal Loan Payment', 'Visa Platinum Payment']) {
      expect(screen.getByText(merchant)).toBeDefined()
    }
  })

  it('marks a past-due active item as Overdue, using the injected clock rather than the real date', () => {
    renderPage()
    // PLDT Internet is seeded due 2026-08-27, before the fixed demo "today" of 2026-08-29.
    expect(within(rowFor('PLDT Internet')).getByText('Overdue')).toBeDefined()
  })

  it('marks an item due within 7 days as Due Soon', () => {
    renderPage()
    // Netflix is seeded due 2026-09-01, three days after the fixed demo "today".
    expect(within(rowFor('Netflix')).getByText('Due Soon')).toBeDefined()
  })

  it('marks an item due well in the future as Active', () => {
    renderPage()
    // Spotify is seeded due 2026-09-12, outside the 7-day window.
    expect(within(rowFor('Spotify')).getByText('Active')).toBeDefined()
  })

  it('shows a paused item as Paused regardless of its due date', () => {
    renderPage()
    // Visa Platinum Payment is seeded paused and due today (2026-08-29) — it
    // must read Paused, not Overdue/Due Soon, because status wins.
    expect(within(rowFor('Visa Platinum Payment')).getByText('Paused')).toBeDefined()
  })
})

describe('Recurring KPI row', () => {
  it('sums active items into a monthly-equivalent total and counts active/paused/due-soon items', () => {
    renderPage()
    // Active monthly-equivalent spend: 15 (Netflix) + 9.5 (Spotify) + 45
    // (Internet) + 64.1 (Meralco) + 850 (Rent) + 1200/12 (Insurance,
    // annualized) + 220 (Loan) = 1303.6. Visa Platinum Payment is paused and
    // excluded.
    const expectedMonthly = 15 + 9.5 + 45 + 64.1 + 850 + 1200 / 12 + 220
    expect(screen.getByText(formatMoney(expectedMonthly, { withCents: false }))).toBeDefined()
    expect(screen.getByText('7 items')).toBeDefined()
    expect(screen.getByText('1 items')).toBeDefined()
    // Due in the next 7 days: Netflix, Meralco, Landlord (due soon) + PLDT
    // Internet (already overdue) = 4. Visa Platinum Payment is paused so it
    // is excluded even though its due date is today.
    expect(screen.getByText('4 items')).toBeDefined()
  })
})

describe('Pause, resume, and mark as paid actions', () => {
  it('pausing an active item swaps its badge to Paused and its action to Resume', () => {
    renderPage()
    const row = rowFor('Netflix')
    fireEvent.click(within(row).getByRole('button', { name: /Pause/ }))
    expect(within(row).getByText('Paused')).toBeDefined()
    expect(within(row).getByRole('button', { name: /Resume/ })).toBeDefined()
  })

  it('resuming a paused item re-derives its due state from the date again', () => {
    renderPage()
    const row = rowFor('Visa Platinum Payment')
    fireEvent.click(within(row).getByRole('button', { name: /Resume/ }))
    // Due today (2026-08-29) once active again — inside the due-soon window.
    expect(within(row).getByText('Due Soon')).toBeDefined()
  })

  it('marking an item as paid advances its next due date to the following occurrence', () => {
    renderPage()
    const row = rowFor('Netflix')
    expect(within(row).getByText(/Next due Sep 1/)).toBeDefined()
    fireEvent.click(within(row).getByRole('button', { name: /Mark as paid/ }))
    // Netflix is monthly, seeded due 2026-09-01 → advances to 2026-10-01.
    expect(within(row).getByText(/Next due Oct 1/)).toBeDefined()
    expect(within(row).getByText(/Last paid Aug 29/)).toBeDefined()
  })

  it('disables Mark as paid for a paused item', () => {
    renderPage()
    const row = rowFor('Visa Platinum Payment')
    expect((within(row).getByRole('button', { name: /Mark as paid/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

const ITEM_FIELDS_FORM_LABEL = 'Add recurring item'

describe('Add recurring item form', () => {
  it('is hidden until the add link is clicked', () => {
    renderPage()
    expect(screen.queryByLabelText('Linked account')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /New recurring item/ }))
    expect(screen.getByLabelText('Linked account')).toBeDefined()
  })

  it('rejects a blank merchant name and a zero amount', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /New recurring item/ }))
    fireEvent.click(screen.getByRole('button', { name: ITEM_FIELDS_FORM_LABEL }))
    expect(screen.getByRole('alert').textContent).toContain('Merchant name is required.')
  })

  it('rejects a next due date in the past', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /New recurring item/ }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Netflix'), { target: { value: 'Gym Membership' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30' } })
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: ITEM_FIELDS_FORM_LABEL }))
    expect(screen.getByRole('alert').textContent).toContain('Next due date can’t be in the past.')
  })

  it('adds a valid new recurring item to the list and closes the form', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /New recurring item/ }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Netflix'), { target: { value: 'Gym Membership' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30' } })
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } })
    fireEvent.click(screen.getByRole('button', { name: ITEM_FIELDS_FORM_LABEL }))

    expect(screen.getByText('Gym Membership')).toBeDefined()
    expect(screen.queryByLabelText('Linked account')).toBeNull()
  })
})
