import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { V3Shell, V3Workspace } from './V3Shell'
import { V3Overview } from './V3Pages'
import { setV3PreviewEnabled } from './v3Preview'

afterEach(() => { cleanup(); localStorage.clear() })

function renderApp(path: string) {
  return render(
    <FinanceProvider clock={fixedClock('2026-09-13')}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </FinanceProvider>,
  )
}

describe('V3 shell structure', () => {
  function shell() {
    return render(<MemoryRouter initialEntries={['/v3']}><V3Shell onAddTransaction={() => {}}><V3Overview /></V3Shell></MemoryRouter>)
  }
  it('has skip link, main landmark, a single Primary nav and a Utilities nav', () => {
    shell()
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#v3-main')
    expect(screen.getByRole('main').id).toBe('v3-main')
    expect(screen.getAllByRole('navigation', { name: 'Primary' })).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: 'Utilities' })).toBeTruthy()
  })
  it('keeps Sync Center, Settings and Security reachable', () => {
    shell()
    const utilities = within(screen.getByRole('navigation', { name: 'Utilities' }))
    expect(utilities.getByRole('link', { name: 'Sync Center' }).getAttribute('href')).toBe('/sync')
    expect(utilities.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings')
    expect(utilities.getByRole('link', { name: 'Security' }).getAttribute('href')).toBe('/security')
  })
  it('workspace DOM order puts accounts before position and activity', () => {
    render(<V3Workspace accounts={<i />} position={<i />} activity={<i />} />)
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))
    expect(names).toEqual(['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity'])
  })
})

describe('opt-in V3 preview routing', () => {
  it('keeps the legacy dashboard at / by default', () => {
    renderApp('/')
    expect(screen.queryByText('V3 preview')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Primary' }).textContent).toContain('Dashboard')
  })
  it('redirects /v3 to the legacy UI when not opted in', () => {
    renderApp('/v3/activity')
    expect(screen.getByRole('navigation', { name: 'Primary' }).textContent).toContain('Dashboard')
    expect(document.querySelector('.v3-root')).toBeNull()
  })
  it('renders the V3 shell at /v3 once opted in, and legacy routes still work', () => {
    setV3PreviewEnabled(true)
    renderApp('/v3/activity')
    expect(document.querySelector('.v3-root')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Activity', level: 1 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page')
    cleanup()
    renderApp('/crypto')
    expect(screen.getByRole('heading', { name: 'Crypto Portfolio' })).toBeDefined()
  })
  it('opens Quick Add from the dock without navigating', () => {
    // jsdom has no <dialog> modal support.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
    setV3PreviewEnabled(true)
    renderApp('/v3/planning')
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(screen.getByRole('link', { name: 'Planning' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0)
  })
  it('?v3=1 opts in and ?v3=0 opts out', () => {
    renderApp('/?v3=1')
    expect(document.querySelector('.v3-root')).not.toBeNull()
    expect(localStorage.getItem('monikey.v3Preview')).toBe('1')
    cleanup()
    renderApp('/v3?v3=0')
    expect(document.querySelector('.v3-root')).toBeNull()
    expect(localStorage.getItem('monikey.v3Preview')).toBeNull()
  })
})
