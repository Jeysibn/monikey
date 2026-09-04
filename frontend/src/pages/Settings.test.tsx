import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from './Settings'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { subscribeToast } from '../hooks/toastBus'

afterEach(cleanup)

beforeEach(() => {
  window.localStorage.clear()
})

function renderSettings() {
  return render(
    <MemoryRouter>
      <FinanceProvider clock={fixedClock('2026-08-29')}>
        <Settings />
      </FinanceProvider>
    </MemoryRouter>,
  )
}

describe('Settings page layout', () => {
  it('renders the page title and every section', () => {
    renderSettings()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined()
    // CardTitle renders its text in an inner <span> with no sibling content
    // when no `action` is passed, so the wrapping <div> would otherwise
    // match too — restrict the query to the <span> to keep this a single,
    // unambiguous match.
    ;['Profile', 'Display Preferences', 'Notifications', 'Categories', 'Connected Accounts', 'Data & Privacy', 'Security'].forEach((title) => {
      expect(screen.getByText(title, { selector: 'span' })).toBeDefined()
    })
  })
})

describe('Profile section', () => {
  it('rejects an empty display name and focuses it', () => {
    renderSettings()
    const nameInput = screen.getByLabelText('Display name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Display name is required.')
    expect(document.activeElement).toBe(nameInput)
  })

  it('rejects an invalid email', () => {
    renderSettings()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Enter a valid email address.')
  })

  it('saves a valid profile to localStorage and shows a confirmation toast', () => {
    renderSettings()
    const messages: string[] = []
    const unsubscribe = subscribeToast((m) => messages.push(m))

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Jomel Concon' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jomel.concon@bbwave.ph' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(messages).toContain('Profile saved')
    const stored = JSON.parse(window.localStorage.getItem('monikey.settings.v1')!)
    expect(stored.profile).toEqual({ displayName: 'Jomel Concon', email: 'jomel.concon@bbwave.ph' })
    unsubscribe()
  })
})

describe('Notifications section', () => {
  it('toggling a preference persists it to localStorage', () => {
    renderSettings()
    const toggle = screen.getByLabelText('Weekly summary email') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)
    const stored = JSON.parse(window.localStorage.getItem('monikey.settings.v1')!)
    expect(stored.notifications.weeklySummaryEmail).toBe(true)
  })
})

describe('Display Preferences section', () => {
  it('renders the currency selector as disabled ("coming soon")', () => {
    renderSettings()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('the hide-cents toggle actually changes amounts shown on this page', () => {
    renderSettings()
    // Checking account balance starts with cents.
    expect(screen.getByText('₱4,120.00')).toBeDefined()

    fireEvent.click(screen.getByLabelText('Show whole-peso amounts on this page'))

    expect(screen.queryByText('₱4,120.00')).toBeNull()
    expect(screen.getByText('₱4,120')).toBeDefined()
  })
})

describe('Categories section (read-only)', () => {
  it('lists the shared finance categories without an editable control', () => {
    renderSettings()
    expect(screen.getByText('Salary')).toBeDefined()
    const addButton = screen.getByRole('button', { name: /Add category/ })
    expect(addButton).toHaveProperty('disabled', true)
  })
})

describe('Connected Accounts section (read-only)', () => {
  it('lists accounts and cards with masked last-four and links to /accounts', () => {
    // These labels are split across sibling text nodes/elements (name,
    // masked digits, institution), so assert against the section's overall
    // text rather than an exact-match node lookup that nested markup would
    // make ambiguous.
    const { container } = renderSettings()
    const text = container.textContent ?? ''
    expect(text).toContain('Checking')
    expect(text).toContain('••4471')
    expect(text).toContain('••2290')
    const link = screen.getByRole('link', { name: /Manage on Accounts/ })
    expect(link.getAttribute('href')).toBe('/accounts')
  })
})

describe('Data & Privacy section', () => {
  it('exports finance data as a downloaded JSON file', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(clickSpy).toHaveBeenCalledTimes(1)

    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('clearing local preferences resets a changed notification toggle back to default', () => {
    renderSettings()
    const toggle = screen.getByLabelText('Weekly summary email') as HTMLInputElement
    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Clear local preferences' }))

    expect((screen.getByLabelText('Weekly summary email') as HTMLInputElement).checked).toBe(false)
    const stored = JSON.parse(window.localStorage.getItem('monikey.settings.v1')!)
    expect(stored.notifications.weeklySummaryEmail).toBe(false)
  })

  it('never mutates finance state', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Clear local preferences' }))
    // Finance-owned data (from useFinance, read-only on this page) is
    // untouched — the checking account balance is still what the mock
    // repository seeded.
    expect(screen.getByText('₱4,120.00')).toBeDefined()
  })
})

describe('Security section', () => {
  it('renders honest, disabled placeholders — no fake working controls', () => {
    renderSettings()
    const changePassword = screen.getByRole('button', { name: /Change password/ })
    const twoFactor = screen.getByRole('button', { name: /two-factor authentication/ })
    expect(changePassword).toHaveProperty('disabled', true)
    expect(twoFactor).toHaveProperty('disabled', true)
  })
})
