import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useFinance } from '../hooks/useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { formatMinorUnits } from '../utils/currency'
import { formatDateLabel, monthPeriodContaining } from '../utils/date'
import { exactMinor, parseMinorUnitInput } from '../utils/money'
import {
  BILL_STATE_LABEL, allocationsFromState, billState, buildPlan, monthBounds, monthInRange, monthKeyOf, monthLabel, shiftMonth, sortBills,
  type MonthKey, type Plan, type PlanRow, type UnbudgetedRow,
} from './planningModel'
import { backendMode, usePeriodReport } from './useOverviewReports'
import { usePlanningBudgets } from './usePlanningBudgets'
import { useAsyncRecurringItems } from './useRecurringReadOnly'
import './V3Planning.css'

const money = (minor: bigint) => formatMinorUnits(minor, { withCents: true })
const STATUS_TEXT = { over: 'Over budget', near: 'Near limit', ok: 'On track' } as const

type Notice = { kind: 'saved'; text: string; refreshed: boolean } | null

function Meter({ label, pct, status }: { label: string; pct: number; status: 'ok' | 'near' | 'over' }) {
  const shown = Math.min(100, pct)
  return (
    <div className="v3-pl-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} aria-valuetext={`${pct}% used`}>
      <span className={`is-${status}`} style={{ width: `${shown}%` }} />
    </div>
  )
}

function AllocationForm({ name, initial, onSave, onCancel, saving, error }: { name: string; initial: string; onSave: (raw: string) => void; onCancel: () => void; saving: boolean; error: string | null }) {
  const id = useId()
  const [raw, setRaw] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const submit = (e: FormEvent) => { e.preventDefault(); if (!saving) onSave(raw) }
  return (
    <form className="v3-pl-edit" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }} noValidate>
      <label className="v3-label" htmlFor={id}>Monthly budget for {name}</label>
      <div className="v3-pl-edit__row">
        <input id={id} ref={ref} className="v3-input" inputMode="decimal" autoComplete="off" placeholder="0.00" value={raw} onChange={(e) => setRaw(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
        <button type="submit" className="v3-btn v3-btn--primary" disabled={saving} aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="v3-btn v3-btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
      {error && <p className="v3-pl-error" role="alert" id={`${id}-err`}>{error}</p>}
      <p className="v3-caption v3-secondary">Enter 0 to remove the budget from this category.</p>
    </form>
  )
}

function SummaryCard({ plan, label, canEdit, onStart }: { plan: Plan; label: string; canEdit: boolean; onStart: () => void }) {
  if (!plan.hasBudget) {
    return (
      <section className="v3-card v3-pl-summary" aria-labelledby="v3-pl-sum" data-testid="v3-plan-empty">
        <h2 id="v3-pl-sum" className="v3-h2">No budget for {label}</h2>
        <p className="v3-secondary">Give categories a monthly limit to see how much is left as you spend. Categories without a limit are still tracked in All spending.</p>
        {plan.totalSpending !== null && <p className="v3-secondary" data-testid="v3-plan-total">All spending this month: <strong>{money(plan.totalSpending)}</strong></p>}
        {canEdit && plan.unbudgeted.length > 0 && <button type="button" className="v3-btn v3-btn--primary" onClick={onStart}>Set your first budget</button>}
        {canEdit && plan.unbudgeted.length === 0 && <p className="v3-secondary">There are no expense categories yet. Add one in <Link to="/settings">Settings</Link>.</p>}
      </section>
    )
  }
  return (
    <section className="v3-card v3-pl-summary" aria-labelledby="v3-pl-sum" data-testid="v3-plan-summary">
      <h2 id="v3-pl-sum" className="v3-h2">Budget for {label}</h2>
      <dl className="v3-pl-totals">
        <div><dt className="v3-secondary">Budgeted</dt><dd className="v3-figure v3-figure--md" data-testid="v3-plan-allocated">{money(plan.allocated)}</dd></div>
        <div><dt className="v3-secondary">Spent in budgeted categories</dt><dd className="v3-figure v3-figure--md" data-testid="v3-plan-spent">{money(plan.budgetedSpent)}</dd></div>
        <div className="v3-pl-totals__main"><dt className="v3-label">{plan.remaining < 0n ? 'Over budget by' : 'Left to spend'}</dt><dd className={`v3-figure v3-figure--lg ${plan.remaining < 0n ? 'v3-figure--negative' : ''}`} data-testid="v3-plan-remaining">{money(plan.remaining < 0n ? -plan.remaining : plan.remaining)}</dd></div>
      </dl>
      <Meter label="Overall budget used" pct={plan.usedPct} status={plan.status} />
      <p className="v3-secondary" data-testid="v3-plan-util">{plan.usedPct}% used · {STATUS_TEXT[plan.status]}</p>
      {plan.totalSpending !== null && (
        <p className="v3-caption v3-secondary" data-testid="v3-plan-total">
          All spending this month: {money(plan.totalSpending)}{plan.outsideBudget !== null && plan.outsideBudget > 0n ? ` · ${money(plan.outsideBudget)} is in categories without a budget` : ''}. Cleared expenses only; transfers, card repayments and reversed items are not spending.
        </p>
      )}
    </section>
  )
}

function CategoryRow({ row, editing, onEdit, children, canEdit }: { row: PlanRow; editing: boolean; onEdit: () => void; children?: React.ReactNode; canEdit: boolean }) {
  return (
    <li className={`v3-pl-row is-${row.status}`} data-testid={`v3-plan-row-${row.categoryId}`}>
      <div className="v3-pl-row__head">
        <span className="v3-pl-row__name"><span className="v3-ov-dot" style={{ background: row.color }} aria-hidden="true" />{row.name}</span>
        {row.status !== 'ok' && <span className={`v3-pl-chip is-${row.status}`}>{STATUS_TEXT[row.status]}</span>}
      </div>
      <p className="v3-figure v3-pl-row__fig">{money(row.spent)} <span className="v3-secondary">of {money(row.allocated)}</span></p>
      <Meter label={`${row.name} budget used`} pct={row.usedPct} status={row.status} />
      <div className="v3-pl-row__foot">
        <span className={row.remaining < 0n ? 'v3-pl-over' : 'v3-secondary'}>{row.remaining < 0n ? `${money(-row.remaining)} over` : `${money(row.remaining)} left`} · {row.usedPct}%</span>
        {canEdit && !editing && <button type="button" className="v3-btn v3-btn--secondary v3-pl-btn" onClick={onEdit} aria-label={`Edit ${row.name} budget`}>Edit</button>}
      </div>
      {children}
    </li>
  )
}

function UnbudgetedList({ rows, editingId, canEdit, onEdit, form }: { rows: UnbudgetedRow[]; editingId: string | null; canEdit: boolean; onEdit: (id: string) => void; form: (r: UnbudgetedRow) => React.ReactNode }) {
  if (rows.length === 0) return null
  return (
    <>
      <h3 className="v3-h3 v3-pl-sub">No budget set</h3>
      <ul className="v3-pl-list v3-pl-list--plain" data-testid="v3-plan-unbudgeted">
        {rows.map((r) => (
          <li key={r.categoryId} className="v3-pl-row v3-pl-row--plain" data-testid={`v3-plan-unrow-${r.categoryId}`}>
            <div className="v3-pl-row__head">
              <span className="v3-pl-row__name"><span className="v3-ov-dot" style={{ background: r.color }} aria-hidden="true" />{r.name}</span>
              <span className="v3-secondary">{r.spent > 0n ? `${money(r.spent)} spent` : 'No spending'}</span>
            </div>
            {canEdit && editingId !== r.categoryId && <button type="button" className="v3-btn v3-btn--secondary v3-pl-btn" onClick={() => onEdit(r.categoryId)} aria-label={`Set ${r.name} budget`}>Set budget</button>}
            {editingId === r.categoryId && form(r)}
          </li>
        ))}
      </ul>
    </>
  )
}

function Bills({ todayIso }: { todayIso: string }) {
  const finance = useFinance()
  const items = useAsyncRecurringItems()
  const sorted = useMemo(() => sortBills(items, todayIso), [items, todayIso])
  return (
    <section className="v3-card v3-pl-bills" aria-labelledby="v3-pl-bills" data-testid="v3-plan-bills">
      <h2 id="v3-pl-bills" className="v3-h2">Recurring bills</h2>
      <p className="v3-caption v3-secondary" data-testid="v3-plan-bills-note">For reference only: nothing is paid or recorded from this list. MoniKey may record a bill by itself once it is due, so check Activity before paying one yourself. These are scheduled bills, not expenses you have already recorded.</p>
      {sorted.length === 0 ? (
        <p className="v3-secondary" data-testid="v3-plan-bills-empty">No recurring bills yet. Add bills in <Link to="/recurring">Recurring &amp; Bills</Link>.</p>
      ) : (
        <ul className="v3-pl-list v3-pl-list--plain">
          {sorted.map((item) => {
            const state = billState(item, todayIso)
            const amount = exactMinor(item.amountMinor, item.amount)
            return (
              <li key={item.id} className={`v3-pl-bill is-${state}`} data-testid={`v3-plan-bill-${item.id}`}>
                <div className="v3-pl-row__head">
                  <span className="v3-pl-row__name">{item.merchant}</span>
                  <span className={`v3-pl-chip is-bill-${state}`}>{BILL_STATE_LABEL[state]}</span>
                </div>
                <p className="v3-figure v3-pl-row__fig">{money(amount)} <span className="v3-secondary">· {item.frequency}</span></p>
                <p className="v3-secondary v3-pl-bill__meta">
                  {state === 'paused' ? `Paused · was due ${formatDateLabel(item.nextDueDate)}` : state === 'overdue' ? `Was due ${formatDateLabel(item.nextDueDate)} · not recorded yet` : `Next due ${formatDateLabel(item.nextDueDate)}`}
                </p>
                <p className="v3-caption v3-secondary">Pays from {finance.accountLabel(item.accountId)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function V3Planning() {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const { state, todayIso } = finance
  const todayKey = monthKeyOf(todayIso)
  const backend = backendMode()
  const [month, setMonth] = useState<MonthKey>(todayKey)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const bounds = monthBounds(month)
  const refreshKey = `${state.transactions.length}:${state.transactions[0]?.id ?? ''}`
  const period = useMemo(() => monthPeriodContaining(bounds.start), [bounds.start])
  const report = usePeriodReport(state, period, refreshKey)
  const { budgets, reload, save } = usePlanningBudgets(backend, refreshKey)
  const label = monthLabel(month)
  const offline = Boolean(asyncFinance?.offline)

  const plan: Plan | null = useMemo(() => {
    if (report.status === 'error' || report.status === 'unavailable') return null
    let allocations
    if (backend) {
      if (budgets.status !== 'ready') return null
      const found = budgets.periods.find((p) => p.periodStart === bounds.start && p.periodEnd === bounds.end) ?? budgets.periods.find((p) => p.periodStart <= bounds.start && p.periodEnd >= bounds.end)
      allocations = found?.allocations ?? []
    } else allocations = allocationsFromState(state)
    const spendByCategory = new Map<string, bigint>()
    if (report.status === 'ready') for (const c of report.data.categories) if (c.categoryId) spendByCategory.set(c.categoryId, c.amountMinor)
    return buildPlan({ categories: state.categories, allocations, spendByCategory, totalSpending: report.status === 'ready' ? report.data.spendingMinor : null })
  }, [backend, budgets, bounds.start, bounds.end, report, state])

  const loadFailed = backend ? budgets.status === 'error' : false
  const reportFailed = report.status === 'error' || report.status === 'unavailable'
  const loading = !loadFailed && !reportFailed && plan === null
  // Demo data only knows the current month; budgets can be edited whenever the server is reachable.
  const canEdit = !offline && (backend || month === todayKey) && (backend ? budgets.status === 'ready' : true)

  function go(delta: number) {
    const next = shiftMonth(month, delta)
    if (!monthInRange(next, todayKey) || (!backend && next !== todayKey)) return
    setMonth(next); setEditing(null); setSaveError(null); setNotice(null)
  }

  async function saveAllocation(categoryId: string, name: string, raw: string) {
    const parsed = parseMinorUnitInput(raw)
    if (!parsed.ok) { setSaveError(parsed.error); return }
    setSaving(true); setSaveError(null)
    try {
      if (backend) {
        const outcome = await save(month, categoryId, parsed.value)
        if (!outcome.ok) { setSaveError(outcome.message); return }
        setNotice({ kind: 'saved', refreshed: outcome.refreshed, text: parsed.value === 0n ? `Removed the ${name} budget.` : `Saved ${money(parsed.value)} for ${name}.` })
        void asyncFinance?.refreshState().catch(() => undefined)
      } else {
        await finance.setCategoryBudget(categoryId, Number(parsed.value) / 100)
        setNotice({ kind: 'saved', refreshed: true, text: parsed.value === 0n ? `Removed the ${name} budget.` : `Saved ${money(parsed.value)} for ${name}.` })
      }
      setEditing(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the budget.')
    } finally { setSaving(false) }
  }

  const form = (categoryId: string, name: string, initial: bigint) => (
    <AllocationForm name={name} initial={initial > 0n ? (Number(initial) / 100).toFixed(2) : ''} saving={saving} error={saveError} onCancel={() => { setEditing(null); setSaveError(null) }} onSave={(raw) => void saveAllocation(categoryId, name, raw)} />
  )
  const startEdit = (id: string) => { setEditing(id); setSaveError(null); setNotice(null) }
  const retryAll = () => { void reload(); asyncFinance?.retry() }

  return (
    <div className="v3-pl" data-testid="v3-planning">
      <div className="v3-page-head">
        <h1 className="v3-h1">Planning</h1>
        <p className="v3-secondary">Monthly category budgets, then your recurring bills.</p>
      </div>

      <div className="v3-pl-month" role="group" aria-label="Budget month">
        <button type="button" className="v3-btn v3-btn--secondary v3-pl-btn" onClick={() => go(-1)} disabled={!backend || !monthInRange(shiftMonth(month, -1), todayKey)} aria-label="Previous month">‹</button>
        <h2 className="v3-h2 v3-pl-month__label" aria-live="polite" data-testid="v3-plan-month">{label}</h2>
        <button type="button" className="v3-btn v3-btn--secondary v3-pl-btn" onClick={() => go(1)} disabled={!backend || !monthInRange(shiftMonth(month, 1), todayKey)} aria-label="Next month">›</button>
        {month !== todayKey && <button type="button" className="v3-btn v3-btn--ghost v3-pl-btn" onClick={() => { setMonth(todayKey); setEditing(null); setNotice(null) }}>This month</button>}
      </div>

      {offline && <p className="v3-card v3-ov-banner" role="status">You are offline. Showing the last synced figures; budgets can't be changed until you are back online.</p>}
      {notice && (
        <p className="v3-card v3-pl-notice" role="status" data-testid="v3-plan-notice">
          {notice.text}
          {!notice.refreshed && <> <span data-testid="v3-plan-stale">The change is saved, but the latest figures couldn't be loaded.</span> <button type="button" className="v3-btn v3-btn--secondary v3-pl-btn" onClick={() => void reload().then((ok) => { if (ok) setNotice({ ...notice, refreshed: true }) })}>Retry refresh</button></>}
        </p>
      )}

      <div className="v3-pl-grid">
        <div className="v3-pl-main">
          {loading && <div className="v3-card" role="status" aria-label="Loading budget" data-testid="v3-plan-loading"><div className="v3-stack"><div className="v3-skeleton" /><div className="v3-skeleton" /><div className="v3-skeleton" /></div></div>}
          {(loadFailed || reportFailed) && (
            <div className="v3-card" role="alert" data-testid="v3-plan-error">
              <p>{loadFailed ? "Your budget couldn't be loaded." : "This month's spending couldn't be loaded."}</p>
              <p className="v3-secondary">Nothing has been changed. Check your connection and try again.</p>
              <button type="button" className="v3-btn v3-btn--primary" onClick={retryAll}>Try again</button>
            </div>
          )}
          {plan && (
            <>
              <SummaryCard plan={plan} label={label} canEdit={canEdit} onStart={() => plan.unbudgeted[0] && startEdit(plan.unbudgeted[0].categoryId)} />
              {backend && budgets.status === 'ready' && budgets.refreshError && !notice && <p className="v3-card v3-ov-banner" role="status">Showing the last loaded budget. The latest figures couldn't be loaded. <button type="button" className="v3-btn v3-btn--secondary v3-pl-btn" onClick={() => void reload()}>Retry</button></p>}
              <section className="v3-card" aria-labelledby="v3-pl-cats" data-testid="v3-plan-categories">
                <h2 id="v3-pl-cats" className="v3-h2">Category budgets</h2>
                {plan.rows.length > 0 && (
                  <ul className="v3-pl-list">
                    {plan.rows.map((r) => <CategoryRow key={r.categoryId} row={r} canEdit={canEdit} editing={editing === r.categoryId} onEdit={() => startEdit(r.categoryId)}>{editing === r.categoryId && form(r.categoryId, r.name, r.allocated)}</CategoryRow>)}
                  </ul>
                )}
                <UnbudgetedList rows={plan.unbudgeted} editingId={editing} canEdit={canEdit} onEdit={startEdit} form={(r) => form(r.categoryId, r.name, 0n)} />
              </section>
            </>
          )}
        </div>
        <aside className="v3-pl-side" aria-label="Recurring bills">
          <Bills todayIso={todayIso} />
        </aside>
      </div>

      <div className="v3-page-actions">
        <Link className="v3-btn v3-btn--secondary" to="/budget">Open classic Budget</Link>
        <Link className="v3-btn v3-btn--secondary" to="/recurring">Recurring &amp; Bills</Link>
        <Link className="v3-btn v3-btn--secondary" to="/reports">Reports</Link>
      </div>
    </div>
  )
}
