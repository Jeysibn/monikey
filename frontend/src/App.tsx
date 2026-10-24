import { useEffect, useRef, useState } from 'react'

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
import { monthLabel, monthOf } from '@/lib/finance'
import { getMockData, type DemoScenario } from '@/mockData'
import { AccountsView } from '@/views/AccountsView'
import { OverviewView } from '@/views/OverviewView'
import { PlaceholderView } from '@/views/PlaceholderView'

/*
 * App state is deliberately tiny (TLD section 4): which view is showing, which month is selected, and
 * which stand-in dialog is open. No router, no store, no persistence.
 *
 * Preview hook for design review and tests: open the app with
 * ?demo=loading | overpaid | negative | no-accounts | over-limit | paid-off
 * to see a loading state or a rare state without editing code. Anything else shows the normal ledger.
 */
const demo = new URLSearchParams(window.location.search).get('demo')
const scenarios: DemoScenario[] = ['overpaid', 'negative', 'no-accounts', 'over-limit', 'paid-off']

interface Notice {
  title: string
  message: string
}

function App() {
  const [data] = useState(() => getMockData(scenarios.find((s) => s === demo)))
  const [view, setView] = useState<View>('overview')
  const [month, setMonth] = useState(() => monthOf(data.today))
  const [notice, setNotice] = useState<Notice | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the control that opened the dialog, so focus can go back to it
  const loading = demo === 'loading'
  const addDisabled = data.accounts.length === 0

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

  // Quick Add, Pay card and Add account are built in later milestones; until then these open a stand-in.
  // Radix only returns focus to a <DialogTrigger>, and these dialogs are opened from ordinary buttons,
  // so remember the opener here and put focus back on it when the dialog closes.
  const show = (next: Notice) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setNotice(next)
  }
  const openAdd = () =>
    show({ title: 'Add transaction', message: 'Quick Add (expense, income and card payment) is built in a later milestone.' })
  const openPay = (cardId: number) => {
    const card = data.accounts.find((a) => a.id === cardId)
    show({ title: 'Pay credit card', message: `Paying ${card?.name ?? 'a card'} is part of Quick Add, built in a later milestone.` })
  }
  const openAddAccount = (kind: 'account' | 'credit card' = 'account') =>
    show({
      title: 'Add account',
      message: `Adding ${kind === 'credit card' ? 'a credit card' : 'an account'} is part of Add account, built in a later milestone.`,
    })
  const restoreFocus = (event: Event) => {
    event.preventDefault() // skip Radix's own handler, which looks for a DialogTrigger
    const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('main h1')
    target?.focus()
  }

  return (
    <>
      <AppShell view={view} onNavigate={setView} onAdd={openAdd} addDisabled={addDisabled}>
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
          <PlaceholderView
            title="Activity"
            message={`The transaction list for ${monthLabel(month)} arrives with the Activity screen.`}
            onAdd={openAdd}
            addDisabled={addDisabled}
          />
        )}
        {view === 'accounts' && (
          <AccountsView data={data} loading={loading} onAdd={openAdd} onAddAccount={openAddAccount} onPayCard={openPay} />
        )}
      </AppShell>

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
