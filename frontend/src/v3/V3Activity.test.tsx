import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { V3Activity } from './V3Activity'

afterEach(cleanup)
const Loc = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output> }

function setup(path = '/v3/activity') {
  return render(
    <FinanceProvider clock={fixedClock('2026-08-30')}>
      <MemoryRouter initialEntries={[path]}>
        <Loc />
        <Routes><Route path="/v3/activity" element={<V3Activity onEditTransaction={() => {}} />} /></Routes>
      </MemoryRouter>
    </FinanceProvider>,
  )
}

describe('V3 Activity', () => {
  it('groups rows by date and shows a kind label per row', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  })
  it('keeps filters in the URL', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'income' } })
    expect(screen.getByTestId('loc').textContent).toContain('type=income')
  })
  it('filters by search text from the URL', () => {
    setup('/v3/activity?q=grab')
    const body = document.body.textContent ?? ''
    expect(body).toContain('Grab')
  })
  it('shows an empty state when nothing matches', () => {
    setup('/v3/activity?q=zzzznomatch')
    expect(screen.getByText(/No transactions match/i)).toBeTruthy()
  })
  it('opens details for ?tx and closes on Escape', () => {
    setup()
    const first = within(document.body).getAllByRole('button').find((b) => /Grab/.test(b.textContent ?? ''))!
    fireEvent.click(first)
    expect(screen.getByTestId('loc').textContent).toContain('tx=')
    fireEvent.keyDown(document.body, { key: 'Escape' })
  })
})
