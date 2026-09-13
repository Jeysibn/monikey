import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { FinanceProvider } from './state/FinanceProvider'
import { fixedClock } from './utils/clock'

afterEach(cleanup)

function renderAt(path: string) {
  return render(
    <FinanceProvider clock={fixedClock('2026-09-13')}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </FinanceProvider>,
  )
}

/**
 * Regression coverage for the canonical /crypto route (§27): the nav links
 * to /crypto, and the old /investments URL — which used to be the only way
 * to reach this page — must keep working as a redirect so existing
 * bookmarks/links never silently 404.
 */
describe('canonical crypto routing', () => {
  it('renders the Crypto page at the canonical /crypto path', () => {
    renderAt('/crypto')
    expect(screen.getByRole('heading', { name: 'Crypto Portfolio' })).toBeDefined()
  })

  it('redirects the legacy /investments path to /crypto instead of 404ing', () => {
    renderAt('/investments')
    expect(screen.getByRole('heading', { name: 'Crypto Portfolio' })).toBeDefined()
  })
})
