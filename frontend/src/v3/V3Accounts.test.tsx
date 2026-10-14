import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { dueDayLabel, V3Accounts } from './V3Accounts'
import { V3Activity } from './V3Activity'

afterEach(cleanup)
const Loc = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output> }

function setup(path = '/v3/accounts') {
  return render(
    <FinanceProvider clock={fixedClock('2026-08-30')}>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <Routes>
          <Route path="/v3/accounts" element={<V3Accounts />} />
          <Route path="/v3/activity" element={<V3Activity onEditTransaction={() => {}} />} />
        </Routes>
      </MemoryRouter>
    </FinanceProvider>,
  )
}

describe('credit card due and minimum payment presentation', () => {
  it('describes the due day, not a fabricated calendar date', () => {
    expect(dueDayLabel('2026-10-01')).toBe('The 1st of each month')
    expect(dueDayLabel('2026-10-22')).toBe('The 22nd of each month')
    expect(dueDayLabel('2026-10-23')).toBe('The 23rd of each month')
    expect(dueDayLabel('2026-10-11')).toBe('The 11th of each month')
    expect(dueDayLabel('')).toBe('Not set')
  })
})

describe('V3 Accounts', () => {
  it('expands only one account at a time and records it in the URL', () => {
    setup()
    const grid = screen.getByRole('list', { name: 'Accounts' })
    const buttons = within(grid).getAllByRole('button', { expanded: false })
    fireEvent.click(buttons[0]!)
    expect(screen.getAllByTestId('v3-account-details')).toHaveLength(1)
    expect(screen.getByTestId('loc').textContent).toMatch(/account=/)
    fireEvent.click(within(grid).getAllByRole('button', { expanded: false })[0]!)
    expect(screen.getAllByTestId('v3-account-details')).toHaveLength(1)
    expect(within(grid).getAllByRole('button', { expanded: true })).toHaveLength(1)
  })
  it('presents a credit card as outstanding debt with a limit caveat', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Visa Platinum/ }))
    expect(screen.getByTestId('v3-card-owed').textContent).toContain('1,460.00')
    expect(screen.getByText(/not cash you hold/)).toBeTruthy()
  })
  it('links to Activity filtered by the account', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Checking,/ }))
    fireEvent.click(screen.getByRole('link', { name: 'View all activity' }))
    expect(screen.getByTestId('loc').textContent).toMatch(/^\/v3\/activity\?account=/)
  })
  it('hides favorite controls in mock mode (nothing would persist)', () => {
    setup()
    expect(screen.queryByTestId('v3-fav-panel')).toBeNull()
  })
  it('does not offer balance edits and hides edit/archive without a backend', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Checking,/ }))
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull()
    expect(screen.getByText(/need a connected backend/)).toBeTruthy()
  })
  it('validates the add-account form', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
    const form = screen.getByRole('form', { name: 'Add account' })
    fireEvent.click(within(form).getByRole('button', { name: 'Add account' }))
    expect(screen.getByRole('alert').textContent).toMatch(/name is required/i)
  })
  it('reports an unknown account id', () => {
    setup('/v3/accounts?account=nope')
    expect(screen.getByRole('alert').textContent).toMatch(/not found/i)
  })
})
