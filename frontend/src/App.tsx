import { useEffect, useMemo, useRef, useState } from 'react'

import { AppShell, type View } from '@/components/AppShell'
import { AddAccountDialog } from '@/components/AddAccountDialog'
import { QuickAddDialog, type EntrySession } from '@/components/QuickAddDialog'
import { StatusMessage, type StatusNote } from '@/components/StatusMessage'
import { isNotFound, type DataSource } from '@/dataSource'
import { accountSavedMessage, type AccountValues } from '@/lib/accountForm'
import { accountsFor, type EntryKind, type EntryValues } from '@/lib/entryForm'
import { deleteSummary, saveMessage, targetOf } from '@/lib/entryText'
import { ACTIVITY_PAGE_SIZE, monthOf, nextPageSize } from '@/lib/finance'
import { createMockSource } from '@/mockSource'
import type { DemoScenario } from '@/mockData'
import { useResource } from '@/useResource'
import type { ActivityItem, EntryTarget, LedgerSnapshot } from '@/types'
import { AccountsView } from '@/views/AccountsView'
import { ActivityView } from '@/views/ActivityView'
import { OverviewView } from '@/views/OverviewView'

/*
 * App state is deliberately small (TLD section 4): the data source and what it has reported, which view is
 * showing, the month and account filters, the open dialog and one status message. No router, no store
 * library, no persistence. Screens read figures from the DataSource (today the mock; the API later) and never
 * calculate from stored rows. After a write the figures are fetched again (spec section 7) and the
 * confirmation message is built from the fresh ones; there are no optimistic updates.
 *
 * Preview hook for design review and tests: open the app with
 * ?demo=loading | overpaid | negative | no-accounts | over-limit | paid-off | many | huge | save-error
 * to see a loading state, a rare state or a failed first save without editing code.
 * Anything else shows the normal ledger.
 */
const demo = new URLSearchParams(window.location.search).get('demo')
const scenarios: DemoScenario[] = ['overpaid', 'negative', 'no-accounts', 'over-limit', 'paid-off', 'many', 'huge']

const STATUS_SECONDS = 8
const RECENT_COUNT = 6 // rows on Overview

const involvesAccount = (v: EntryValues, id: number) => v.accountId === id || v.cardId === id

/** The accounts' figures and the categories as they are now (used right after a write for its message). */
async function freshSnapshot(source: DataSource): Promise<LedgerSnapshot> {
  const { signal } = new AbortController()
  const [accounts, categories] = await Promise.all([source.loadAccounts(signal), source.loadCategories(signal)])
  return { ...accounts, categories }
}

function App() {
  const [source] = useState<DataSource>(() =>
    createMockSource({ scenario: scenarios.find((sc) => sc === demo) ?? null, failNextWrite: demo === 'save-error' }),
  )
  const [version, setVersion] = useState(0) // bumped after a write so every screen fetches again
  const [view, setView] = useState<View>('overview')
  const [month, setMonth] = useState(() => monthOf(source.today))
  const [accountFilter, setAccountFilter] = useState<number | null>(null) // Activity's account filter
  // The page size belongs to one combination of filters; a different month or account starts again at one page.
  const filterKey = `${month}|${accountFilter}`
  const [paged, setPaged] = useState({ key: filterKey, size: ACTIVITY_PAGE_SIZE })
  const pageSize = paged.key === filterKey ? paged.size : ACTIVITY_PAGE_SIZE
  // Forget the old page size as soon as the filters change, so coming back to a month starts at one page again.
  if (paged.key !== filterKey) setPaged({ key: filterKey, size: ACTIVITY_PAGE_SIZE })

  const [accountForm, setAccountForm] = useState<AccountValues | null>(null)
  const [session, setSession] = useState<EntrySession | null>(null)
  const [status, setStatus] = useState<StatusNote | null>(null)
  // Remembered for this visit only (spec section 7): the last account used, and the last "pay from" account.
  const lastAccount = useRef<number | null>(null)
  const lastPayFrom = useRef<number | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the control that opened the dialog, so focus can go back to it
  const demoLoading = demo === 'loading'

  // What the screens read. Each is fetched when its screen needs it and again after a write.
  const accounts = useResource('accounts', (signal) => source.loadAccounts(signal), version)
  const categories = useResource('categories', (signal) => source.loadCategories(signal))
  const summary = useResource(view === 'activity' ? null : `summary:${month}`, (signal) => source.loadSummary(month, signal), version)
  const recent = useResource(
    view === 'overview' ? `recent:${month}` : null,
    (signal) => source.loadActivity({ month, accountId: null, limit: RECENT_COUNT }, signal),
    version,
  )
  const activity = useResource(
    view === 'activity' ? `activity:${month}:${accountFilter}:${pageSize}` : null,
    (signal) => source.loadActivity({ month, accountId: accountFilter, limit: pageSize }, signal),
    version,
  )
  const snapshot = useMemo<LedgerSnapshot | undefined>(
    () => (accounts.data && categories.data ? { ...accounts.data, categories: categories.data } : undefined),
    [accounts.data, categories.data],
  )
  const addDisabled = snapshot !== undefined && snapshot.accounts.length === 0

  // The confirmation clears itself after a few seconds; a new one restarts the timer.
  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(null), STATUS_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [status])

  // After the user picks a different view, move focus to its h1 so keyboard and screen-reader users
  // start at the top of the new screen. Skipped on first load.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.querySelector<HTMLElement>('main h1')?.focus()
  }, [view])

  // Radix only returns focus to a <DialogTrigger>, and these dialogs are opened from ordinary buttons,
  // so remember the opener and put focus back on it when the dialog closes. Safari does not focus a
  // button when it is clicked, so rows pass their button in explicitly.
  const rememberOpener = (from?: HTMLElement) => {
    opener.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  }
  const startEntry = (snap: LedgerSnapshot, kind: EntryKind, cardId: number | null): EntryValues => {
    const last = kind === 'payment' ? lastPayFrom.current : lastAccount.current
    const usable = last !== null && accountsFor(kind, 'account', snap).some((a) => a.id === last)
    return { kind, amount: '', accountId: usable ? last : null, cardId, categoryId: null, date: source.today, note: '' }
  }
  const openAdd = () => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'expense', null) })
  }
  const openPay = (cardId: number) => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'payment', cardId) })
  }
  // Edit and Delete open on the entry exactly as stored (the list row carries it), so no lookup is needed.
  const openEdit = (item: ActivityItem, from: HTMLElement, confirmFirst = false) => {
    rememberOpener(from)
    setSession({ mode: 'edit', values: item.entry, target: targetOf(item), confirmFirst })
  }

  const saveEntry = async (values: EntryValues, target?: EntryTarget) => {
    await source.saveEntry(values, target) // rejects with the message to show; the form keeps what was typed
    if (!target) {
      if (values.kind === 'payment') lastPayFrom.current = values.accountId
      else lastAccount.current = values.accountId
    }
    // The write is done. The confirmation is built from the figures fetched again afterwards.
    let text = 'Saved.'
    try {
      text = saveMessage(values, await freshSnapshot(source))
    } catch {
      /* the screens fetch again below */
    }
    let again: StatusNote['action']
    const hidden =
      view === 'activity' &&
      (monthOf(values.date) !== month || (accountFilter !== null && !involvesAccount(values, accountFilter)))
    if (hidden) {
      text += " It's hidden by your filters."
      again = {
        label: 'Show it',
        run: () => {
          setAccountFilter(null)
          setMonth(monthOf(values.date))
        },
      }
    }
    setVersion((v) => v + 1)
    setStatus({ text, action: again })
    setSession(null)
  }

  const deleteEntry = async (target: EntryTarget) => {
    const done = (snapshot && session && deleteSummary(snapshot, session.values, month)?.done) || 'Deleted.'
    try {
      await source.deleteEntry(target)
    } catch (err) {
      if (!isNotFound(err)) throw err
      // Gone already (another tab): nothing to undo; show the lists as they are now.
      setVersion((v) => v + 1)
      setStatus({ text: 'It was already deleted.' })
      setSession(null)
      return
    }
    setVersion((v) => v + 1)
    setStatus({ text: done })
    setSession(null)
  }

  const openAddAccount = (kind: 'account' | 'credit card' = 'account') => {
    rememberOpener()
    setAccountForm({ type: kind === 'credit card' ? 'credit_card' : 'cash', name: '', balance: '', limit: '', owed: '' })
  }
  const saveAccount = async (values: AccountValues) => {
    await source.addAccount(values) // a duplicate name rejects with the API's message
    setVersion((v) => v + 1)
    setStatus({ text: accountSavedMessage(values) })
    setAccountForm(null)
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault() // skip Radix's own handler, which looks for a DialogTrigger
    const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('main h1')
    target?.focus()
  }

  return (
    <>
      <AppShell view={view} onNavigate={setView} onAdd={openAdd} addDisabled={addDisabled}>
        <StatusMessage note={status} onDismiss={() => setStatus(null)} />
        {view === 'overview' && (
          <OverviewView
            today={source.today}
            snapshot={snapshot}
            summary={summary.data}
            recent={recent.data?.items}
            month={month}
            loading={demoLoading || !snapshot || !summary.data || !recent.data}
            addDisabled={addDisabled}
            onMonthChange={setMonth}
            onAdd={openAdd}
            onAddAccount={() => openAddAccount()}
            onPayCard={openPay}
            onOpenActivity={(m) => {
              setMonth(m)
              setView('activity')
            }}
          />
        )}
        {view === 'activity' && (
          <ActivityView
            today={source.today}
            snapshot={snapshot}
            page={activity.data}
            month={month}
            accountId={accountFilter}
            loading={demoLoading || !snapshot || !activity.data}
            addDisabled={addDisabled}
            onMonthChange={setMonth}
            onAccountChange={setAccountFilter}
            onLoadMore={() => setPaged({ key: filterKey, size: nextPageSize(pageSize) })}
            onAdd={openAdd}
            onEdit={(item, from) => openEdit(item, from)}
            onDelete={(item, from) => openEdit(item, from, true)}
          />
        )}
        {view === 'accounts' && (
          <AccountsView
            snapshot={snapshot}
            summary={summary.data}
            loading={demoLoading || !snapshot || !summary.data}
            onAdd={openAdd}
            onAddAccount={openAddAccount}
            onPayCard={openPay}
          />
        )}
      </AppShell>

      {snapshot && (
        <>
          <QuickAddDialog
            snapshot={snapshot}
            session={session}
            month={month}
            onSubmit={saveEntry}
            onDelete={deleteEntry}
            onOpenChange={(open) => !open && setSession(null)}
            onClosed={restoreFocus}
          />

          <AddAccountDialog
            initial={accountForm}
            snapshot={snapshot}
            onSubmit={saveAccount}
            onOpenChange={(open) => !open && setAccountForm(null)}
            onClosed={restoreFocus}
          />
        </>
      )}
    </>
  )
}

export default App
