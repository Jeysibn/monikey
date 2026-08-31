import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardTitle } from '../components/Card'
import { useFinance } from '../hooks/useFinance'
import { useSettings, type UseSettingsResult } from '../hooks/useSettings'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { showToast } from '../hooks/toastBus'
import { formatMoney } from '../utils/currency'
import type { NotificationPreferences } from '../domain/settings'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { ApiSettingsGateway } from '../services/apiSettingsGateway'
import './Settings.css'

const PROFILE_FIELDS = ['displayName', 'email'] as const
type ProfileField = (typeof PROFILE_FIELDS)[number]

// Deliberately simple — this is a local mock profile, not an auth system, so
// the only thing worth rejecting is something that plainly isn't an email.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ProfileSection({ settings, saveProfile }: Pick<UseSettingsResult, 'settings' | 'saveProfile'>) {
  const [displayName, setDisplayName] = useState(settings.profile.displayName)
  const [email, setEmail] = useState(settings.profile.email)
  const { errors, field, errorId, fail, clear } = useFieldErrors<ProfileField>(PROFILE_FIELDS)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) {
      fail({ displayName: 'Display name is required.' })
      return
    }
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) {
      fail({ email: 'Enter a valid email address.' })
      return
    }
    clear()
    saveProfile({ displayName: displayName.trim(), email: email.trim() })
    showToast('Profile saved')
  }

  return (
    <Card>
      <CardTitle>Profile</CardTitle>
      <p className="form-help">
        In mock mode these preferences stay on this device; backend mode loads and saves them through your authenticated Monikey account.
      </p>
      <form className="settings-form" onSubmit={handleSubmit} noValidate>
        <label className="new-category-field">
          <span className="tx-label">Display name</span>
          <input
            type="text"
            className="tx-input"
            value={displayName}
            placeholder="Your name"
            {...field('displayName', (e) => setDisplayName(e.target.value))}
          />
          {errors.displayName && (
            <p className="tx-error" role="alert" id={errorId('displayName')}>
              {errors.displayName}
            </p>
          )}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Email</span>
          <input
            type="email"
            className="tx-input"
            value={email}
            placeholder="you@example.com"
            {...field('email', (e) => setEmail(e.target.value))}
          />
          {errors.email && (
            <p className="tx-error" role="alert" id={errorId('email')}>
              {errors.email}
            </p>
          )}
        </label>
        <div className="new-category-actions">
          <button type="submit" className="btn btn--primary">
            Save profile
          </button>
        </div>
      </form>
    </Card>
  )
}

function Toggle({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string
  label: string
  help?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const helpId = `${id}-help`
  return (
    <div className="settings-toggle-row">
      <span>
        {/* The accessible name comes only from this <label>, so the switch's
            name reads as e.g. "Weekly summary email" — not that text plus
            the whole help paragraph. Help is linked separately via
            aria-describedby instead of being folded into the label. */}
        <label className="settings-toggle-label" htmlFor={id}>
          {label}
        </label>
        {help && (
          <span className="form-help settings-toggle-help" id={helpId}>
            {help}
          </span>
        )}
      </span>
      <span className="switch">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-describedby={help ? helpId : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </span>
    </div>
  )
}

const NOTIFICATION_ROWS: { key: keyof NotificationPreferences; label: string; help: string }[] = [
  { key: 'billDueReminders', label: 'Bill due reminders', help: 'A heads-up before a credit card payment is due.' },
  { key: 'budgetNearLimitWarnings', label: 'Budget near-limit warnings', help: 'Notify when a budget category is close to its allocation.' },
  {
    key: 'weeklySummaryEmail',
    label: 'Weekly summary email',
    help: 'Preference only — no email delivery is wired up yet, turning this on just records the intent.',
  },
]

function NotificationsSection({ settings, setNotification }: Pick<UseSettingsResult, 'settings' | 'setNotification'>) {
  const idBase = useId()

  return (
    <Card>
      <CardTitle>Notifications</CardTitle>
      <div className="settings-toggle-list">
        {NOTIFICATION_ROWS.map((row) => (
          <Toggle
            key={row.key}
            id={`${idBase}-${row.key}`}
            label={row.label}
            help={row.help}
            checked={settings.notifications[row.key]}
            onChange={(v) => setNotification(row.key, v)}
          />
        ))}
      </div>
    </Card>
  )
}

function DisplayPreferencesSection({
  settings,
  setDisplayPreference,
}: Pick<UseSettingsResult, 'settings' | 'setDisplayPreference'>) {
  const idBase = useId()
  const sampleAmount = 12480.5

  return (
    <Card>
      <CardTitle>Display Preferences</CardTitle>
      <div className="settings-field-row">
        <label className="new-category-field" style={{ flex: 1 }}>
          <span className="tx-label">
            Currency &amp; locale <span className="coming-soon-tag">Coming soon</span>
          </span>
          <select className="tx-input" disabled title="Coming soon" defaultValue="PHP">
            <option value="PHP">Philippine Peso (₱) · en-PH</option>
          </select>
        </label>
      </div>
      <p className="form-help">
        Currency formatting is shared app-wide from a single, non-reactive module (see <code>utils/currency.ts</code>) — switching it live
        needs a currency provider that re-renders every screen, which doesn’t exist yet. Changing it here would silently leave half the app in
        the old currency, so it stays disabled until that’s built.
      </p>
      <div className="settings-toggle-list">
        <Toggle
          id={`${idBase}-hide-cents`}
          label="Show whole-peso amounts on this page"
          help={`Drops cents from amounts shown in Settings only (e.g. ${formatMoney(sampleAmount)} → ${formatMoney(sampleAmount, { withCents: false })}). Other pages are unaffected.`}
          checked={settings.display.hideCents}
          onChange={(v) => setDisplayPreference('hideCents', v)}
        />
      </div>
    </Card>
  )
}

function CategoriesSection() {
  const finance = useFinance()

  return (
    <Card>
      <div className="section-head">
        <span className="card-title-text">Categories</span>
        <button type="button" className="add-link" disabled title="Coming soon">
          + Add category <span className="coming-soon-tag">Coming soon</span>
        </button>
      </div>
      <p className="form-help">
        Read-only here — category management lives with the shared Budget data, not Settings.
      </p>
      <ul className="mini-list">
        {finance.state.categories.map((c) => (
          <li key={c.id}>
            <span>
              <span className="swatch" style={{ background: c.color }} /> {c.name}
            </span>
            <span className="faint">{c.transactionKinds.join(' & ')}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ConnectedAccountsSection({ settings }: Pick<UseSettingsResult, 'settings'>) {
  const finance = useFinance()
  const { accounts, creditCards } = finance.state
  const moneyOpts = { withCents: !settings.display.hideCents }

  return (
    <Card>
      <div className="section-head">
        <span className="card-title-text">Connected Accounts</span>
        <Link to="/accounts" className="add-link">
          Manage on Accounts →
        </Link>
      </div>
      <p className="form-help">Read-only summary — add, edit, or link accounts from the Accounts page.</p>
      <ul className="mini-list settings-account-list">
        {accounts.map((a) => (
          <li key={a.id}>
            <span>
              {a.name}
              {a.lastFour ? ` ••${a.lastFour}` : ''}
              {a.institution ? <span className="faint"> · {a.institution}</span> : null}
            </span>
            <span className="num">{formatMoney(a.balance, moneyOpts)}</span>
          </li>
        ))}
        {creditCards.map((c) => (
          <li key={c.id}>
            <span>
              {c.name} ••{c.lastFour}
              <span className="faint"> · {c.network === 'visa' ? 'Visa' : 'Mastercard'}</span>
            </span>
            <span className="num" style={{ color: 'var(--amber)' }}>
              {formatMoney(c.balance, moneyOpts)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function DataPrivacySection({ resetToDefaults }: Pick<UseSettingsResult, 'resetToDefaults'>) {
  const finance = useFinance()

  function handleExport() {
    const payload = JSON.stringify(finance.state, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `monikey-data-export-${finance.todayIso}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast('Data export downloaded')
  }

  function handleClearPreferences() {
    resetToDefaults()
    showToast('Local preferences reset')
  }

  return (
    <Card>
      <CardTitle>Data &amp; Privacy</CardTitle>
      <p className="form-help">
        Export downloads everything currently in your finance data (accounts, cards, transactions, budgets, goals) as one JSON file. Resetting
        preferences changes only your profile, notification, and display choices — your finance data is never touched.
      </p>
      <div className="new-category-actions" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <button type="button" className="btn btn--primary" onClick={handleExport}>
          Export my data
        </button>
        <button type="button" className="btn btn--ghost" onClick={handleClearPreferences}>
          Reset preferences
        </button>
      </div>
    </Card>
  )
}

function SecuritySection() {
  return (
    <Card>
      <CardTitle>Security</CardTitle>
      <p className="form-help">
        Authentication is handled by the backend session. Password changes and two-factor authentication are planned controls.
      </p>
      <div className="new-category-actions" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <button type="button" className="btn btn--ghost" disabled title="Coming soon">
          Change password <span className="coming-soon-tag">Coming soon</span>
        </button>
        <button type="button" className="btn btn--ghost" disabled title="Coming soon">
          Enable two-factor authentication <span className="coming-soon-tag">Coming soon</span>
        </button>
      </div>
    </Card>
  )
}

export function Settings() {
  // Called once, here, and passed down — every section must share one
  // settings instance. Each section previously called `useSettings()`
  // itself, which (since it's backed by local `useState`, not context) gave
  // each section its own independent copy: toggling a preference in one
  // card silently didn't move any other card reading the same value, and
  // "Clear local preferences" only reset the card that clicked it.
  const asyncFinance = useAsyncFinanceOptional()
  const settingsGateway = useMemo(() => asyncFinance ? new ApiSettingsGateway() : undefined, [asyncFinance])
  const settingsApi = useSettings(settingsGateway)

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-grid">
        <div className="settings-col">
          <ProfileSection settings={settingsApi.settings} saveProfile={settingsApi.saveProfile} />
          <DisplayPreferencesSection
            settings={settingsApi.settings}
            setDisplayPreference={settingsApi.setDisplayPreference}
          />
          <NotificationsSection settings={settingsApi.settings} setNotification={settingsApi.setNotification} />
          <SecuritySection />
        </div>
        <div className="settings-col">
          <CategoriesSection />
          <ConnectedAccountsSection settings={settingsApi.settings} />
          <DataPrivacySection resetToDefaults={settingsApi.resetToDefaults} />
        </div>
      </div>
    </div>
  )
}
