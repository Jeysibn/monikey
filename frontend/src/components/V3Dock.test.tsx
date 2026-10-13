import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { V3Dock, type V3DockRoutes } from './V3Dock'

// Vitest runs without `globals`, so unmount explicitly between tests.
afterEach(cleanup)

const routes: V3DockRoutes = {
  overview: '/',
  activity: '/activity',
  accounts: '/accounts',
  planning: '/planning',
}

function renderDock(path = '/', onAddTransaction: () => void = () => {}) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <V3Dock routes={routes} onAddTransaction={onAddTransaction} />
    </MemoryRouter>,
  )
  return within(screen.getByRole('navigation', { name: 'Primary' }))
}

describe('V3Dock', () => {
  it('moves focus with ArrowRight/ArrowLeft (wrapping), Home and End', () => {
    const dock = renderDock()
    const items = Array.from(screen.getByRole('navigation', { name: 'Primary' }).querySelectorAll<HTMLElement>('a, button'))
    items[0].focus()
    fireEvent.keyDown(items[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: 'End' })
    expect(document.activeElement).toBe(items[4])
    fireEvent.keyDown(items[4], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(items[4])
    fireEvent.keyDown(items[4], { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    expect(dock.getAllByRole('link').length).toBe(4)
  })

  it('ignores unrelated keys and modified arrows', () => {
    renderDock()
    const items = Array.from(screen.getByRole('navigation', { name: 'Primary' }).querySelectorAll<HTMLElement>('a, button'))
    items[1].focus()
    fireEvent.keyDown(items[1], { key: 'a' })
    fireEvent.keyDown(items[1], { key: 'ArrowRight', altKey: true })
    expect(document.activeElement).toBe(items[1])
  })

  it('exposes a single labelled primary navigation landmark', () => {
    renderDock()
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
  })

  it('renders exactly four destinations plus a central Add action, in order', () => {
    const dock = renderDock()
    const names = [...dock.getAllByRole('link'), ...dock.getAllByRole('button')]
    expect(names).toHaveLength(5)
    const ordered = Array.from(
      screen.getByRole('navigation', { name: 'Primary' }).querySelectorAll('a, button'),
    ).map((el) => el.getAttribute('aria-label'))
    expect(ordered).toEqual(['Overview', 'Activity', 'Add transaction', 'Accounts', 'Planning'])
  })

  it('links each destination to the supplied route', () => {
    const dock = renderDock()
    expect(dock.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/')
    expect(dock.getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe('/activity')
    expect(dock.getByRole('link', { name: 'Accounts' }).getAttribute('href')).toBe('/accounts')
    expect(dock.getByRole('link', { name: 'Planning' }).getAttribute('href')).toBe('/planning')
  })

  it('gives every control a persistent visible text label, not hover-only', () => {
    const dock = renderDock()
    for (const [name, text] of [
      ['Overview', 'Overview'],
      ['Activity', 'Activity'],
      ['Add transaction', 'Add'],
      ['Accounts', 'Accounts'],
      ['Planning', 'Planning'],
    ]) {
      const el = dock.getByRole(name === 'Add transaction' ? 'button' : 'link', { name })
      expect(el.querySelector('.v3-dock__label')?.textContent).toBe(text)
    }
  })

  it('hides decorative icons from assistive technology', () => {
    renderDock()
    const icons = document.querySelectorAll('.v3-dock svg')
    expect(icons).toHaveLength(5)
    icons.forEach((icon) => expect(icon.getAttribute('aria-hidden')).toBe('true'))
  })

  it('marks only the current destination with aria-current and the active style', () => {
    const dock = renderDock('/accounts')
    const current = dock.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current.map((l) => l.getAttribute('aria-label'))).toEqual(['Accounts'])
    expect(current[0].classList.contains('v3-dock__item--active')).toBe(true)
    expect(dock.getByRole('link', { name: 'Overview' }).classList.contains('v3-dock__item--active')).toBe(false)
  })

  it('treats Overview as active only on its exact route', () => {
    const dock = renderDock('/activity')
    expect(dock.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
    expect(dock.getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page')
  })

  it('keeps nested routes active for their parent destination', () => {
    const dock = renderDock('/accounts/some-id')
    expect(dock.getByRole('link', { name: 'Accounts' }).getAttribute('aria-current')).toBe('page')
  })

  it('marks no destination current on an unrelated route', () => {
    const dock = renderDock('/settings')
    expect(dock.getAllByRole('link').some((l) => l.getAttribute('aria-current') === 'page')).toBe(false)
  })

  it('Add is a non-submitting button that only invokes the supplied callback', () => {
    const onAdd = vi.fn()
    const dock = renderDock('/', onAdd)
    const add = dock.getByRole('button', { name: 'Add transaction' })
    expect(add.getAttribute('type')).toBe('button')
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('does not navigate when Add is activated', () => {
    const dock = renderDock('/activity')
    fireEvent.click(dock.getByRole('button', { name: 'Add transaction' }))
    expect(dock.getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page')
  })

  it('leaves all controls natively keyboard-focusable (no negative tabindex)', () => {
    const dock = renderDock()
    const controls = [...dock.getAllByRole('link'), ...dock.getAllByRole('button')]
    for (const control of controls) {
      expect(control.getAttribute('tabindex')).toBeNull()
      control.focus()
      expect(document.activeElement).toBe(control)
    }
  })

  it('respects custom route destinations', () => {
    render(
      <MemoryRouter initialEntries={['/v3/planning']}>
        <V3Dock
          routes={{ overview: '/v3', activity: '/v3/activity', accounts: '/v3/accounts', planning: '/v3/planning' }}
          onAddTransaction={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Planning' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/v3')
  })
})

// Stage 3 guard: the dock is mounted only by the opt-in V3 shell, never by the legacy AppShell.
describe('V3Dock mounting', () => {
  it('is referenced only by the opt-in V3 shell', () => {
    const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const referencing = Object.entries(sources)
      .filter(([file]) => !/\/V3Dock(\.test)?\.tsx$/.test(file))
      .filter(([, text]) => text.includes('V3Dock'))
      .map(([file]) => file)
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    expect(referencing.every((f) => f.startsWith('../v3/'))).toBe(true)
    expect(referencing).toContain('../v3/V3Shell.tsx')
    expect(referencing.some((f) => f.includes('AppShell'))).toBe(false)
  })
})
