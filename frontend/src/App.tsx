import { useEffect, useReducer, useRef, useState } from 'react'

import { AppShell, type View } from '@/components/AppShell'
import { AddAccountDialog } from '@/components/AddAccountDialog'
import { QuickAddDialog, type EntrySession } from '@/components/QuickAddDialog'
import { StatusMessage, type StatusNote } from '@/components/StatusMessage'
import { accountSavedMessage, toAccountAction, validateAccount, type AccountValues } from '@/lib/accountForm'
import { accountsFor, type EntryKind, type EntryValues } from '@/lib/entryForm'
import { monthOf } from '@/lib/finance'
import {
  deleteSummary,
  entryExists,
  entryValues,
  ledgerReducer,
  saveMessage,
  targetOf,
  toAction,
  toDeleteAction,
  toUpdateAction,
  type EntryTarget,
} from '@/lib/ledger'
import type { ActivityItem } from '@/types'
import { getMockData, type DemoScenario } from '@/mockData'
import { AccountsView } from '@/views/AccountsView'
import { ActivityView } from '@/views/ActivityView'
import { OverviewView } from '@/views/OverviewView'

/*
 * App state is deliberately small (TLD section 4): the ledger (a reducer standing in for the API's writes),
 * which view is showing, the month and account filters, the open dialog and one status message.
 * No router, no store library, no persistence: a reload returns to the starting data.
 *
 * Preview hook for design review and tests: open the app with
 * ?demo=loading | overpaid | negative | no-accounts | over-limit | paid-off | many | save-error
 * to see a loading state, a rare state or a failed first save without editing code.
 * Anything else shows the normal ledger.
 */
const demo = new URLSearchParams(window.location.search).get('demo')
const scenarios: DemoScenario[] = ['overpaid', 'negative', 'no-accounts', 'over-limit', 'paid-off', 'many']

const FAILED_SAVE = "Couldn't save. Check your connection and try again. Your entry is still here."
const FAILED_DELETE = "Couldn't delete. Nothing was changed. Try again."
const GONE_ON_EDIT = 'This entry was removed, maybe in another tab. Your changes are still here.'
const STATUS_SECONDS = 8

const involvesAccount = (v: EntryValues, id: number) => v.accountId === id || v.cardId === id

function App() {
  const [data, dispatch] = useReducer(ledgerReducer, demo, (d) => getMockData(scenarios.find((s) => s === d)))
  const [view, setView] = useState<View>('overview')
  const [month, setMonth] = useState(() => monthOf(data.today))
  const [accountFilter, setAccountFilter] = useState<number | null>(null) // Activity's account filter
  const [accountForm, setAccountForm] = useState<AccountValues | null>(null)
  const [session, setSession] = useState<EntrySession | null>(null)
  const [status, setStatus] = useState<StatusNote | null>(null)
  // Remembered for this visit only (spec section 7): the last account used, and the last "pay from" account.
  const lastAccount = useRef<number | null>(null)
  const lastPayFrom = useRef<number | null>(null)
  const failNextWrite = useRef(demo === 'save-error') // the first save, delete or new account fails once, to show the error path
  const opener = useRef<HTMLElement | null>(null) // the control that opened the dialog, so focus can go back to it
  const loading = demo === 'loading'
  const addDisabled = data.accounts.length === 0

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
  const startEntry = (kind: EntryKind, cardId: number | null): EntryValues => {
    const last = kind === 'payment' ? lastPayFrom.current : lastAccount.current
    const usable = last !== null && accountsFor(kind, 'account', data).some((a) => a.id === last)
    return { kind, amount: '', accountId: usable ? last : null, cardId, categoryId: null, date: data.today, note: '' }
  }
  const openAdd = () => {
    rememberOpener()
    setSession({ mode: 'add', values: startEntry('expense', null) })
  }
  const openPay = (cardId: number) => {
    rememberOpener()
    setSession({ mode: 'add', values: startEntry('payment', cardId) })
  }

  const openEdit = (item: ActivityItem, from: HTMLElement, confirmFirst = false) => {
    const target = targetOf(item)
    const values = entryValues(data, target)
    if (!values) return // already gone
    rememberOpener(from)
    setSession({ mode: 'edit', values, target, confirmFirst })
  }

  const saveEntry = async (values: EntryValues, target?: EntryTarget) => {
    await Promise.resolve() // the real API call goes here; the mock answers at once
    if (failNextWrite.current) {
      failNextWrite.current = false
      throw new Error(FAILED_SAVE)
    }
    if (target && !entryExists(data, target)) throw new Error(GONE_ON_EDIT)
    const action = target ? toUpdateAction(values, target) : toAction(values, new Date().toISOString().slice(0, 19))
    const after = ledgerReducer(data, action)
    dispatch(action)
    if (!target) {
      if (values.kind === 'payment') lastPayFrom.current = values.accountId
      else lastAccount.current = values.accountId
    }

    let text = saveMessage(values, after)
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
    setStatus({ text, action: again })
    setSession(null)
  }

  const deleteEntry = async (target: EntryTarget) => {
    await Promise.resolve()
    if (failNextWrite.current) {
      failNextWrite.current = false
      throw new Error(FAILED_DELETE)
    }
    if (!entryExists(data, target)) {
      setStatus({ text: 'It was already deleted.' }) // the list is already up to date; nothing to change
      setSession(null)
      return
    }
    const done = deleteSummary(data, target, month)?.done ?? 'Deleted.'
    dispatch(toDeleteAction(target))
    setStatus({ text: done })
    setSession(null)
  }
  const openAddAccount = (kind: 'account' | 'credit card' = 'account') => {
    rememberOpener()
    setAccountForm({ type: kind === 'credit card' ? 'credit_card' : 'cash', name: '', balance: '', limit: '', owed: '' })
  }
  const saveAccount = async (values: AccountValues) => {
    await Promise.resolve() // the real API call goes here; the mock answers at once
    if (failNextWrite.current) {
      failNextWrite.current = false
      throw new Error(FAILED_SAVE)
    }
    // The API answers 409 for a duplicate name; the mock re-checks so a second tab cannot slip one through.
    const taken = validateAccount(values, data).name
    if (taken) throw new Error(taken)
    dispatch(toAccountAction(values))
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
            data={data}
            month={month}
            loading={loading}
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
            data={data}
            month={month}
            accountId={accountFilter}
            loading={loading}
            addDisabled={addDisabled}
            onMonthChange={setMonth}
            onAccountChange={setAccountFilter}
            onAdd={openAdd}
            onEdit={(item, from) => openEdit(item, from)}
            onDelete={(item, from) => openEdit(item, from, true)}
          />
        )}
        {view === 'accounts' && (
          <AccountsView data={data} loading={loading} onAdd={openAdd} onAddAccount={openAddAccount} onPayCard={openPay} />
        )}
      </AppShell>

      <QuickAddDialog
        data={data}
        session={session}
        month={month}
        onSubmit={saveEntry}
        onDelete={deleteEntry}
        onOpenChange={(open) => !open && setSession(null)}
        onClosed={restoreFocus}
      />

      <AddAccountDialog
        initial={accountForm}
        data={data}
        onSubmit={saveAccount}
        onOpenChange={(open) => !open && setAccountForm(null)}
        onClosed={restoreFocus}
      />
    </>
  )
}

export default App
