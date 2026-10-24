import { useEffect, useReducer, useRef, useState } from 'react'

import { AppShell, type View } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QuickAddDialog } from '@/components/QuickAddDialog'
import { StatusMessage, type StatusNote } from '@/components/StatusMessage'
import { accountsFor, type EntryKind, type EntryValues } from '@/lib/entryForm'
import { monthOf } from '@/lib/finance'
import { ledgerReducer, saveMessage, toAction } from '@/lib/ledger'
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

interface Notice {
  title: string
  message: string
}

const FAILED_SAVE = "Couldn't save. Check your connection and try again. Your entry is still here."
const STATUS_SECONDS = 8

const involvesAccount = (v: EntryValues, id: number) => v.accountId === id || v.cardId === id

function App() {
  const [data, dispatch] = useReducer(ledgerReducer, demo, (d) => getMockData(scenarios.find((s) => s === d)))
  const [view, setView] = useState<View>('overview')
  const [month, setMonth] = useState(() => monthOf(data.today))
  const [accountFilter, setAccountFilter] = useState<number | null>(null) // Activity's account filter
  const [notice, setNotice] = useState<Notice | null>(null)
  const [quickAdd, setQuickAdd] = useState<EntryValues | null>(null)
  const [status, setStatus] = useState<StatusNote | null>(null)
  // Remembered for this visit only (spec section 7): the last account used, and the last "pay from" account.
  const lastAccount = useRef<number | null>(null)
  const lastPayFrom = useRef<number | null>(null)
  const failNextSave = useRef(demo === 'save-error')
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
  // Add account, Edit and Delete are built in later milestones; until then they open a stand-in.
  const show = (next: Notice, from?: HTMLElement) => {
    rememberOpener(from)
    setNotice(next)
  }

  const startEntry = (kind: EntryKind, cardId: number | null): EntryValues => {
    const last = kind === 'payment' ? lastPayFrom.current : lastAccount.current
    const usable = last !== null && accountsFor(kind, 'account', data).some((a) => a.id === last)
    return { kind, amount: '', accountId: usable ? last : null, cardId, categoryId: null, date: data.today, note: '' }
  }
  const openAdd = () => {
    rememberOpener()
    setQuickAdd(startEntry('expense', null))
  }
  const openPay = (cardId: number) => {
    rememberOpener()
    setQuickAdd(startEntry('payment', cardId))
  }

  const saveEntry = async (values: EntryValues) => {
    await Promise.resolve() // the real API call goes here; the mock answers at once
    if (failNextSave.current) {
      failNextSave.current = false
      throw new Error(FAILED_SAVE)
    }
    const action = toAction(values, new Date().toISOString().slice(0, 19))
    const after = ledgerReducer(data, action)
    dispatch(action)
    if (values.kind === 'payment') lastPayFrom.current = values.accountId
    else lastAccount.current = values.accountId

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
    setQuickAdd(null)
  }
  const openAddAccount = (kind: 'account' | 'credit card' = 'account') =>
    show({
      title: 'Add account',
      message: `Adding ${kind === 'credit card' ? 'a credit card' : 'an account'} is part of Add account, built in a later milestone.`,
    })
  const entryName = (item: ActivityItem) =>
    item.kind === 'payment' ? 'card payment' : item.kind === 'income' ? 'income' : 'expense'
  const openEdit = (item: ActivityItem, from: HTMLElement) =>
    show(
      { title: `Edit ${entryName(item)}`, message: `Editing "${item.title}" is built with Quick Add in a later milestone.` },
      from,
    )
  const openDelete = (item: ActivityItem, from: HTMLElement) =>
    show(
      { title: `Delete ${entryName(item)}`, message: `Deleting "${item.title}" is built with Quick Add in a later milestone. Nothing was changed.` },
      from,
    )
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
            onEdit={openEdit}
            onDelete={openDelete}
          />
        )}
        {view === 'accounts' && (
          <AccountsView data={data} loading={loading} onAdd={openAdd} onAddAccount={openAddAccount} onPayCard={openPay} />
        )}
      </AppShell>

      <QuickAddDialog
        data={data}
        initial={quickAdd}
        onSubmit={saveEntry}
        onOpenChange={(open) => !open && setQuickAdd(null)}
        onClosed={restoreFocus}
      />

      <Dialog open={notice !== null} onOpenChange={(open) => !open && setNotice(null)}>
        <DialogContent onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>{notice?.title}</DialogTitle>
            <DialogDescription>Stand-in for a feature that is not built yet.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p>{notice?.message}</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" className="flex-1">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App
