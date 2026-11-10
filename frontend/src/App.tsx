import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'

import { AppShell, type View } from '@/components/AppShell'
import { AddAccountDialog } from '@/components/AddAccountDialog'
import { EditAccountDialog } from '@/components/EditAccountDialog'
import { ClassifyDialog } from '@/components/kakeibo/ClassifyDialog'
import { KakeiboPlanDialog } from '@/components/kakeibo/KakeiboPlanDialog'
import { ErrorBlock } from '@/components/ErrorBlock'
import { QuickAddDialog, type EntrySession } from '@/components/QuickAddDialog'
import { StatusMessage, type StatusNote } from '@/components/StatusMessage'
import type { DataSource } from '@/dataSource'
import { accountSavedMessage, accountUpdatedMessage, type AccountValues } from '@/lib/accountForm'
import { describeWriteError } from '@/lib/apiErrors'
import { accountsFor, type EntryKind, type EntryValues } from '@/lib/entryForm'
import { deleteSummary, saveMessage, targetOf } from '@/lib/entryText'
import { ACTIVITY_PAGE_SIZE, monthLabel, monthOf, nextPageSize } from '@/lib/finance'
import { defaultWeek, envelopeLabel, supportsKakeibo, weekLabel, weeksOfMonth } from '@/lib/kakeibo'
import { createHttpSource } from '@/httpSource'
import { createMockSource } from '@/mockSource'
import type { DemoScenario } from '@/mockData'
import type { MockOptions } from '@/mockSource'
import { useResource } from '@/useResource'
import { clearWalletCardProduct, readWalletPreferences, saveWalletCardProduct, type WalletPreferencesV1 } from '@/wallet/walletPreferences'
import type { CardChoice } from '@/components/AccountForm'
import { pendingCardUploads, serverStoresCards } from '@/wallet/walletModel'
import type { ActivityItem, AddState, EntryTarget, KakeiboEnvelope, KakeiboPlanValues, KakeiboReviewValues, KakeiboWeekNotes, LedgerSnapshot } from '@/types'
import { AccountsView } from '@/views/AccountsView'
import { CategoriesView } from '@/views/CategoriesView'
import { ActivityView } from '@/views/ActivityView'
import { KakeiboView } from '@/views/KakeiboView'
import { OverviewView } from '@/views/OverviewView'

const DashboardView = lazy(() => import('@/views/DashboardView').then((module) => ({ default: module.DashboardView })))

/*
 * App state is deliberately small (TLD section 4): the data source and what it has reported, which view is
 * showing, the month and account filters, the open dialog and one status message. No router, no store
 * library, and only local presentation preferences are persisted. Screens read figures from the DataSource and never
 * calculate from stored rows. After a write the figures are fetched again (spec section 7) and the
 * confirmation message is built from the fresh ones; there are no optimistic updates.
 *
 * Preview hook for design review and tests: open the app with
 * ?demo=loading | overpaid | negative | no-accounts | over-limit | paid-off | many | huge | no-plan | reviewed
 *       | save-error | invalid | load-error | flaky | offline | slow | partial
 * and, with load-error, flaky or offline, &failing=summary (or accounts, categories, analytics, activity, kakeibo,
 * kakeibo-plan, kakeibo-week; comma-separated)
 * to make only those reads fail.
 * to see a loading state, a rare state, a failed save, a refused save, a failed first load, a failed reload,
 * no connection at all, or slow answers, without editing code. Anything else shows the normal ledger.
 */
const params = new URLSearchParams(window.location.search)
const demo = params.get('demo')
const failing = params.get('failing')?.split(',') ?? null // with load-error, flaky or offline: only these kinds of read fail (accounts, categories, analytics, summary, activity)
const scenarios: DemoScenario[] = ['overpaid', 'negative', 'no-accounts', 'over-limit', 'paid-off', 'many', 'huge', 'no-plan', 'reviewed']

/** The mock's behaviour for the demos that are about failing or being slow (not about what the ledger holds). */
const demoBehaviour = (d: string | null): MockOptions => {
  switch (d) {
    case 'save-error':
      return { failNextWrite: true }
    case 'invalid':
      return { invalidNextWrite: true }
    case 'load-error':
      return { readFailures: 'once' }
    case 'flaky':
      return { readFailures: 'second' }
    case 'offline':
      return { readFailures: 'always', writeFailures: 'always' }
    case 'slow':
      return { readDelayMs: 1500, writeDelayMs: 16_000 }
    case 'partial':
      return { failClassifyEvery: 2 } // every second expense classification fails
    default:
      return {}
  }
}

const STATUS_SECONDS = 8
const RECENT_COUNT = 6 // rows on Overview

const involvesAccount = (v: EntryValues, id: number) => v.accountId === id || v.cardId === id || v.destinationAccountId === id

/** The accounts' figures and the categories as they are now (used right after a write for its message). */
async function freshSnapshot(source: DataSource): Promise<LedgerSnapshot> {
  const { signal } = new AbortController()
  const [accounts, categories] = await Promise.all([source.loadAccounts(signal), source.loadCategories(signal)])
  return { ...accounts, categories }
}

function App() {
  const [source] = useState<DataSource>(() =>
    import.meta.env.VITE_DATA_SOURCE === 'http'
      ? createHttpSource()
      : createMockSource({ scenario: scenarios.find((sc) => sc === demo) ?? null, ...demoBehaviour(demo), readFailureKinds: failing }),
  )
  const [version, setVersion] = useState(0) // bumped after a write so every screen fetches again
  const [view, setView] = useState<View>('overview')
  const [walletPreferences, setWalletPreferences] = useState<WalletPreferencesV1>(() => readWalletPreferences())
  const [month, setMonth] = useState(() => monthOf(source.today))
  const [accountFilter, setAccountFilter] = useState<number | null>(null) // Activity's account filter
  // The page size belongs to one combination of filters; a different month or account starts again at one page.
  const filterKey = `${month}|${accountFilter}`
  const [paged, setPaged] = useState({ key: filterKey, size: ACTIVITY_PAGE_SIZE })
  const pageSize = paged.key === filterKey ? paged.size : ACTIVITY_PAGE_SIZE
  // Forget the old page size as soon as the filters change, so coming back to a month starts at one page again.
  if (paged.key !== filterKey) setPaged({ key: filterKey, size: ACTIVITY_PAGE_SIZE })

  const [accountForm, setAccountForm] = useState<AccountValues | null>(null)
  const [editAccountId, setEditAccountId] = useState<number | null>(null)
  const [planMonth, setPlanMonth] = useState<string | null>(null) // the Kakeibo plan dialog is open for this month
  const [classifyMonth, setClassifyMonth] = useState<string | null>(null) // the classify dialog is open for this month
  const [categoriesVersion, setCategoriesVersion] = useState(0) // bumped after a category suggestion changes
  // The weekly check-in's week belongs to one month; another month starts at its own default week.
  const [weekPick, setWeekPick] = useState<{ month: string; week: string } | null>(null)
  const weeks = weeksOfMonth(month, source.today)
  const weekStart = weekPick?.month === month && weeks.includes(weekPick.week) ? weekPick.week : defaultWeek(month, source.today)
  const [session, setSession] = useState<EntrySession | null>(null)
  const [status, setStatus] = useState<StatusNote | null>(null)
  // Remembered for this visit only (spec section 7): the last account used, and the last "pay from" account.
  const lastAccount = useRef<number | null>(null)
  const lastPayFrom = useRef<number | null>(null)
  const opener = useRef<HTMLElement | null>(null) // the control that opened the dialog, so focus can go back to it
  const demoLoading = import.meta.env.VITE_DATA_SOURCE !== 'http' && demo === 'loading'

  // What the screens read. Each is fetched when its screen needs it and again after a write.
  const accounts = useResource('accounts', (signal) => source.loadAccounts(signal), version)
  const categories = useResource('categories', (signal) => source.loadCategories(signal), categoriesVersion)
  const summary = useResource(view === 'overview' || view === 'accounts' ? `summary:${month}` : null, (signal) => source.loadSummary(month, signal), version)
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
  const kakeibo = useResource(view === 'kakeibo' ? `kakeibo:${month}` : null, (signal) => source.loadKakeiboMonth(month, signal), version)
  const kakeiboWeek = useResource(view === 'kakeibo' ? `kakeibo-week:${weekStart}` : null, (signal) => source.loadKakeiboWeek(weekStart, signal), version)
  const snapshot = useMemo<LedgerSnapshot | undefined>(
    () => (accounts.data && categories.data ? { ...accounts.data, categories: categories.data } : undefined),
    [accounts.data, categories.data],
  )
  // The screens show the accounts' figures (each failure and time stays with the request that failed); the
  // categories are only needed by the forms, so a failure to load them is reported on its own (below).
  const addState: AddState = demoLoading || !accounts.data ? 'loading' : accounts.data.accounts.length === 0 ? 'no-accounts' : !snapshot ? 'loading' : 'ready'

  // The confirmation clears itself after a few seconds; a new one restarts the timer.
  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(null), STATUS_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [status])

  /*
   * One-time upgrade (ADR-020): cards chosen before the server stored them live only in this browser. When
   * the server starts returning `cardProductId`, send each such card once with the account's current values
   * (read fresh, so nothing else changes), then drop the browser copy. A failure keeps the copy for next time.
   */
  const uploadingCards = useRef(false)
  useEffect(() => {
    const list = accounts.data?.accounts
    if (!list || uploadingCards.current || !serverStoresCards(list)) return
    const pending = pendingCardUploads(list, walletPreferences)
    const settled = list.filter((account) => typeof account.cardProductId === 'string' && walletPreferences.byAccountId[String(account.id)])
    if (pending.length === 0 && settled.length === 0) return
    uploadingCards.current = true
    void (async () => {
      let preferences = walletPreferences
      for (const account of settled) preferences = clearWalletCardProduct(account.id, preferences).preferences
      let uploaded = 0
      for (const { accountId, productId } of pending) {
        try {
          const values = await source.loadAccountForEdit(accountId, new AbortController().signal)
          await source.updateAccount(accountId, values, productId)
          preferences = clearWalletCardProduct(accountId, preferences).preferences
          uploaded += 1
        } catch {
          // Keep the browser copy; the next visit tries again.
        }
      }
      setWalletPreferences(preferences)
      if (uploaded > 0) setVersion((v) => v + 1)
    })()
  }, [accounts.data, walletPreferences, source])

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
  /** `accountId` preselects that account (the Overview wallet's Expense and Transfer); otherwise the last one used. */
  const startEntry = (snap: LedgerSnapshot, kind: EntryKind, cardId: number | null, accountId?: number): EntryValues => {
    const last = accountId ?? (kind === 'payment' ? lastPayFrom.current : lastAccount.current)
    const usable = last !== null && accountsFor(kind, 'account', snap).some((a) => a.id === last)
    // A new expense starts "not classified" (ADR-021); against a server without Kakeibo the field is left out.
    const envelope = supportsKakeibo(snap.categories) ? { envelope: null } : {}
    return { kind, amount: '', accountId: usable ? last : null, cardId, destinationAccountId: null, categoryId: null, date: source.today, note: '', ...envelope }
  }
  const openAdd = () => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'expense', null) })
  }
  /** Overview wallet "Expense": Quick Add with the selected account already chosen. */
  const openExpenseOn = (accountId: number) => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'expense', null, accountId) })
  }
  const openPay = (cardId: number) => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'payment', cardId) })
  }
  const openTransfer = () => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'transfer', null) })
  }
  /** Overview wallet "Transfer": the selected account is the one money moves from. */
  const openTransferFrom = (fromAccountId: number) => {
    if (!snapshot) return
    rememberOpener()
    setSession({ mode: 'add', values: startEntry(snapshot, 'transfer', null, fromAccountId) })
  }
  // Edit and Delete open on the entry exactly as stored (the list row carries it), so no lookup is needed.
  const openEdit = (item: ActivityItem, from: HTMLElement, confirmFirst = false) => {
    rememberOpener(from)
    setSession({ mode: 'edit', values: item.entry, target: targetOf(item), confirmFirst })
  }

  const saveEntry = async (values: EntryValues, target?: EntryTarget) => {
    try {
      await source.saveEntry(values, target)
    } catch (err) {
      throw describeWriteError(err, target ? 'edit-entry' : 'add-entry') // the form keeps what was typed and shows this
    }
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
      const failure = describeWriteError(err, 'delete-entry')
      if (!failure.gone) throw failure
      // Gone already (another tab): nothing to undo; show the lists as they are now.
      setVersion((v) => v + 1)
      setStatus({ text: failure.message })
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
  /*
   * Card choices (ADR-020). A server whose accounts carry `cardProductId` stores them with the account; an
   * older API refuses the field, so against it the choice stays in this browser, written only after the
   * account save succeeds and against the ID the server reports.
   */
  const storesCards = accounts.data ? serverStoresCards(accounts.data.accounts) : false
  const keepCardInBrowser = (accountId: number, type: AccountValues['type'], card: CardChoice) => {
    if (card === undefined) return
    const result = card.productId === null
      ? clearWalletCardProduct(accountId, walletPreferences)
      : saveWalletCardProduct(accountId, card.productId, type, walletPreferences)
    if (result.ok) setWalletPreferences(result.preferences)
  }
  /** Once the server holds the choice, drop the browser copy so it can't override the server later. */
  const forgetBrowserCard = (accountId: number) => {
    if (!walletPreferences.byAccountId[String(accountId)]) return
    const result = clearWalletCardProduct(accountId, walletPreferences)
    if (result.ok) setWalletPreferences(result.preferences)
  }
  const saveAccount = async (values: AccountValues, card: CardChoice) => {
    let accountId: number | null
    try {
      accountId = storesCards ? await source.addAccount(values, card?.productId ?? null) : await source.addAccount(values)
    } catch (err) {
      throw describeWriteError(err, 'add-account') // a duplicate name is shown under Name
    }
    if (accountId !== null && !storesCards) keepCardInBrowser(accountId, values.type, card)
    setVersion((v) => v + 1)
    setStatus({ text: accountSavedMessage(values) })
    setAccountForm(null)
  }
  const editAccount = (id: number, from: HTMLElement) => {
    rememberOpener(from)
    setEditAccountId(id)
  }
  const updateAccount = async (id: number, values: AccountValues, card: CardChoice) => {
    try {
      if (storesCards) await source.updateAccount(id, values, card?.productId) // undefined keeps the stored card
      else await source.updateAccount(id, values)
    } catch (err) {
      throw describeWriteError(err, 'edit-account')
    }
    if (!storesCards) keepCardInBrowser(id, values.type, card)
    else if (card !== undefined) forgetBrowserCard(id)
    setVersion((v) => v + 1)
    setStatus({ text: accountUpdatedMessage(values) })
    setEditAccountId(null)
  }
  /** Kakeibo plan (ADR-021): a planning record only, so the ledger and every account stay as they are. */
  const openPlan = () => {
    rememberOpener()
    setPlanMonth(month)
  }
  const savePlan = async (planFor: string, values: KakeiboPlanValues, existed: boolean) => {
    try {
      await source.saveKakeiboPlan(planFor, values)
    } catch (err) {
      throw describeWriteError(err, 'save-plan') // the form keeps what was typed and shows this
    }
    setVersion((v) => v + 1)
    setStatus({ text: `${existed ? 'Plan updated' : 'Plan saved'} for ${monthLabel(planFor)}. Your accounts and activity are unchanged.` })
    setPlanMonth(null)
  }
  /* Reflections and classification (ADR-021, PR D): metadata only, so balances and totals never change. */
  const saveWeek = async (week: string, notes: KakeiboWeekNotes) => {
    try {
      await source.saveKakeiboWeek(week, notes)
    } catch (err) {
      throw describeWriteError(err, 'save-reflection')
    }
    setVersion((v) => v + 1)
    setStatus({ text: `Notes saved for the week of ${weekLabel(week)}.` })
  }
  const saveReview = async (reviewMonth: string, values: KakeiboReviewValues) => {
    try {
      await source.saveKakeiboReview(reviewMonth, values)
    } catch (err) {
      throw describeWriteError(err, 'save-reflection')
    }
    setVersion((v) => v + 1)
    setStatus({ text: `${monthLabel(reviewMonth)} reflection saved, with this month's totals as they are now.` })
  }
  const openClassify = () => {
    rememberOpener()
    setClassifyMonth(month)
  }
  const classified = (count: number, envelope: KakeiboEnvelope | null, complete: boolean) => {
    setVersion((v) => v + 1) // the report, the week and Activity show the new envelopes
    if (!complete) return // the dialog stays open and says what failed
    const noun = count === 1 ? 'expense' : 'expenses'
    setStatus({ text: `${count} ${noun} ${envelope === null ? 'cleared' : `moved to ${envelopeLabel(envelope)}`}. Balances and totals are unchanged.` })
    setClassifyMonth(null)
  }
  /** Saves each changed suggestion in turn; resolves with the categories that failed (the dialog keeps them). */
  const saveSuggestions = async (changes: { id: number; envelope: KakeiboEnvelope | null }[]): Promise<number[]> => {
    const failed: number[] = []
    for (const change of changes) {
      try {
        await source.setCategoryEnvelope(change.id, change.envelope)
      } catch {
        failed.push(change.id)
      }
    }
    if (failed.length < changes.length) setCategoriesVersion((v) => v + 1) // Quick Add reads the new suggestions
    if (failed.length === 0) setStatus({ text: 'Suggestions saved. Expenses you already saved keep their envelopes.' })
    return failed
  }
  const restoreFocus = (event: Event) => {
    event.preventDefault() // skip Radix's own handler, which looks for a DialogTrigger
    const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('main h1')
    target?.focus()
  }

  return (
    <>
      <AppShell view={view} onNavigate={setView} onAdd={openAdd} addState={addState}>
        <StatusMessage note={status} onDismiss={() => setStatus(null)} />
        {categories.error && view !== 'categories' && (
          <ErrorBlock
            what="the categories"
            updatedAt={categories.updatedAt}
            onRetry={categories.retry}
            focusAfter="main h1"
            className="mb-[18px]"
          />
        )}
        {view === 'overview' && (
          <OverviewView
            today={source.today}
            accounts={accounts}
            summary={summary}
            recent={recent}
            month={month}
            loading={demoLoading}
            addState={addState}
            onMonthChange={setMonth}
            onAdd={openAdd}
            onAddAccount={() => openAddAccount()}
            onPayCard={openPay}
            onEditAccount={editAccount}
            onTransfer={openTransferFrom}
            onAddExpense={openExpenseOn}
            onOpenAccounts={() => setView('accounts')}
            walletPreferences={walletPreferences}
            onOpenActivity={(m) => {
              setMonth(m)
              setView('activity')
            }}
          />
        )}
        {view === 'dashboard' && (
          <Suspense fallback={<div className="space-y-4" role="status" aria-label="Loading Dashboard"><div className="h-8 w-44 animate-pulse rounded bg-secondary motion-reduce:animate-none" /><div className="h-28 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" /><div className="h-64 animate-pulse rounded-card bg-secondary motion-reduce:animate-none" /></div>}>
            <DashboardView
              today={source.today}
              source={source}
              accounts={accounts}
              version={version}
              onAdd={openAdd}
              addState={addState}
            />
          </Suspense>
        )}
        {view === 'activity' && (
          <ActivityView
            today={source.today}
            accounts={accounts}
            page={activity}
            month={month}
            accountId={accountFilter}
            loading={demoLoading}
            addState={addState}
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
            accounts={accounts}
            summary={summary}
            loading={demoLoading}
            addState={addState}
            onAdd={openAdd}
            onAddAccount={openAddAccount}
            onEditAccount={editAccount}
            onPayCard={openPay}
            onTransfer={openTransfer}
            walletPreferences={walletPreferences}
          />
        )}
        {view === 'kakeibo' && (
          <KakeiboView
            today={source.today}
            month={month}
            kakeibo={kakeibo}
            loading={demoLoading}
            addState={addState}
            onMonthChange={setMonth}
            onAdd={openAdd}
            onEditPlan={openPlan}
            weeks={weeks}
            weekStart={weekStart}
            week={kakeiboWeek}
            onWeekChange={(week) => setWeekPick({ month, week })}
            onSaveWeek={saveWeek}
            onSaveReview={saveReview}
            onClassify={openClassify}
            categories={categories.data}
            onSaveSuggestions={saveSuggestions}
            onDialogOpen={() => rememberOpener()}
            onDialogClosed={restoreFocus}
          />
        )}
        {view === 'categories' && (
          <CategoriesView
            categories={categories}
            source={source}
            onAdd={openAdd}
            onChanged={() => { setCategoriesVersion((v) => v + 1); setVersion((v) => v + 1) }}
          />
        )}
      </AppShell>

      <ClassifyDialog
        month={classifyMonth}
        source={source}
        onClassified={classified}
        onOpenChange={(open) => !open && setClassifyMonth(null)}
        onClosed={restoreFocus}
      />

      <KakeiboPlanDialog
        key={planMonth ?? 'closed'}
        month={planMonth}
        source={source}
        onSubmit={savePlan}
        onOpenChange={(open) => !open && setPlanMonth(null)}
        onClosed={restoreFocus}
      />

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

          <EditAccountDialog
            key={editAccountId}
            accountId={editAccountId}
            source={source}
            snapshot={snapshot}
            walletPreferences={walletPreferences}
            onSubmit={updateAccount}
            onOpenChange={(open) => !open && setEditAccountId(null)}
            onClosed={restoreFocus}
          />
        </>
      )}
    </>
  )
}

export default App
