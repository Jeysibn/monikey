import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useFinance } from '../hooks/useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { transactionAccountLabel } from '../state/financeSelectors'
import type { Account, AccountType, CreditCard, FinanceState, Transaction } from '../domain/finance'
import { formatDateLabel, formatDueDateLabel } from '../utils/date'
import { formatMinorUnits } from '../utils/currency'
import { exactMinor, parseMoneyInput } from '../utils/money'
import { activityKind, DEFAULT_FILTERS, isReversalPart, KIND_LABEL } from './activityModel'
import { V3AccountCard, type V3AccountKind } from './V3AccountCard'
import { useActivityFeed } from './useActivityFeed'
import { V3_ROUTES } from './v3Preview'
import './V3Accounts.css'

const money = (minor: bigint) => formatMinorUnits(minor, { withCents: true })
const TYPE_LABEL: Record<Exclude<AccountType, 'credit_card'>, string> = { checking: 'Bank · Checking', savings: 'Bank · Savings', ewallet: 'E-wallet', cash: 'Cash' }

type Item = { id: string; kind: V3AccountKind; tone: number; account?: Account; card?: CreditCard }

/** Cards in list order; the tone cycles per kind so two bank accounts never look identical. */
export function accountItems(state: FinanceState): Item[] {
  const counts: Record<V3AccountKind, number> = { bank: 0, ewallet: 0, cash: 0, credit: 0 }
  const next = (kind: V3AccountKind) => counts[kind]++
  const assets = state.accounts.filter((a) => a.classification === 'asset' && a.type !== 'credit_card')
  const items: Item[] = assets.map((a) => {
    const kind: V3AccountKind = a.type === 'checking' || a.type === 'savings' ? 'bank' : (a.type as 'ewallet' | 'cash')
    return { id: a.id, kind, tone: next(kind), account: a }
  })
  for (const c of state.creditCards) items.push({ id: c.id, kind: 'credit', tone: next('credit'), card: c })
  return items
}

function Recent({ state, accountId }: { state: FinanceState; accountId: string }) {
  const filters = useMemo(() => ({ ...DEFAULT_FILTERS, account: accountId }), [accountId])
  const feed = useActivityFeed(state, filters, state.transactions)
  if (feed.status === 'loading') return <div className="v3-skeleton" role="status" aria-label="Loading recent transactions" />
  if (feed.status === 'error') return <p role="alert" className="v3-secondary">Recent transactions could not be loaded.</p>
  const rows = feed.rows.filter((t) => !isReversalPart(t)).slice(0, 5)
  if (rows.length === 0) return <p className="v3-secondary" data-testid="v3-acct-no-activity">No transactions on this account yet.</p>
  return (
    <ul className="v3-acct-recent" aria-label="Recent transactions on this account">
      {rows.map((t: Transaction) => {
        const m = exactMinor(t.amountMinor, t.amount)
        const kind = activityKind(state, t)
        const incoming = t.type === 'income' || (t.type === 'transfer' && t.toAccountId === accountId)
        const text = t.type === 'transfer' ? `${incoming ? '+' : '−'}${money(m < 0n ? -m : m)}` : t.type === 'income' ? `+${money(m < 0n ? -m : m)}` : money(m > 0n ? -m : m)
        return (
          <li key={t.id}>
            <Link to={`${V3_ROUTES.activity}?tx=${t.id}`} className="v3-acct-recent__row">
              <span className="v3-acct-recent__main"><span className="v3-acct-recent__title">{t.title}</span><span className="v3-caption">{formatDateLabel(t.date)} · {KIND_LABEL[kind]}{t.status === 'pending' ? ' · Pending' : ''}{t.type === 'transfer' ? ` · ${transactionAccountLabel(state, t)}` : ''}</span></span>
              <span className={`v3-figure ${t.type === 'income' ? 'v3-figure--positive' : ''}`}>{text}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function EditForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const asyncFinance = useAsyncFinanceOptional()
  const [name, setName] = useState(item.account?.name ?? item.card?.name ?? '')
  const [institution, setInstitution] = useState(item.account?.institution ?? '')
  const [lastFour, setLastFour] = useState(item.account?.lastFour ?? item.card?.lastFour ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!asyncFinance) return
    if (!name.trim()) return setError('Name is required.')
    if (lastFour && !/^\d{4}$/.test(lastFour)) return setError('Last four must be exactly 4 digits.')
    if (item.card && !/^\d{4}$/.test(lastFour)) return setError('Enter the last 4 digits of the card.')
    setBusy(true); setError(null)
    try {
      if (item.card) await asyncFinance.updateCreditCard(item.card.id, { name: name.trim(), lastFour })
      else await asyncFinance.updateAccount(item.id, { name: name.trim(), institution: institution.trim() || null, lastFour: lastFour || null })
      onDone()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save changes.') } finally { setBusy(false) }
  }
  return (
    <form className="v3-card v3-acct-form" onSubmit={submit} noValidate aria-label="Edit account details">
      <div className="v3-field"><label className="v3-label" htmlFor="v3-e-name">Name</label><input id="v3-e-name" className="v3-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(error) && !name.trim()} /></div>
      {!item.card && <div className="v3-field"><label className="v3-label" htmlFor="v3-e-inst">Institution (optional)</label><input id="v3-e-inst" className="v3-input" value={institution} onChange={(e) => setInstitution(e.target.value)} /></div>}
      <div className="v3-field"><label className="v3-label" htmlFor="v3-e-last">Last 4 digits{item.card ? '' : ' (optional)'}</label><input id="v3-e-last" className="v3-input" inputMode="numeric" maxLength={4} value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))} /></div>
      <p className="v3-caption">Balances change only through transactions, so they cannot be edited here.</p>
      {error && <p role="alert" className="v3-secondary v3-act-error">{error}</p>}
      <div className="v3-page-actions"><button type="submit" className="v3-btn v3-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" className="v3-btn v3-btn--secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}

function Details({ state, item, panelId }: { state: FinanceState; item: Item; panelId: string }) {
  const asyncFinance = useAsyncFinanceOptional()
  const { confirm, dialog } = useConfirm()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setParams] = useSearchParams()
  const name = item.account?.name ?? item.card?.name ?? ''
  async function archive() {
    if (!asyncFinance) return
    if (!await confirm({ title: 'Archive account?', message: `Archive “${name}”? Its transaction history stays on the ledger, but it leaves your account list and net position.`, confirmLabel: 'Archive' })) return
    try {
      if (item.card) await asyncFinance.archiveCreditCard(item.card.id); else await asyncFinance.archiveAccount(item.id)
      setParams(new URLSearchParams(), { replace: true })
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not archive this account.') }
  }
  const card = item.card
  const bal = exactMinor((item.account ?? card)!.balanceMinor, (item.account ?? card)!.balance)
  const limit = card ? exactMinor(card.limitMinor, card.limit) : 0n
  const used = limit > 0n ? Number((bal * 100n) / limit) : 0
  return (
    <section id={panelId} className="v3-card v3-acct-details" aria-labelledby={`${panelId}-title`} data-testid="v3-account-details">
      <h2 id={`${panelId}-title`} className="v3-h2">{name}</h2>
      {card ? (
        <>
          <p className="v3-secondary">Credit card ••{card.lastFour} · {card.network === 'visa' ? 'Visa' : 'Mastercard'}</p>
          <dl className="v3-act-dl">
            <div><dt>Outstanding debt (you owe)</dt><dd className="v3-figure v3-figure--md v3-figure--negative" data-testid="v3-card-owed">{money(bal)}</dd></div>
            <div><dt>Credit limit</dt><dd className="v3-figure">{money(limit)}</dd></div>
            <div><dt>Limit used</dt><dd>{used}%</dd></div>
            <div><dt>Payment due</dt><dd>{formatDueDateLabel(card.dueDate)}</dd></div>
            {card.minPayment > 0 && <div><dt>Minimum payment</dt><dd className="v3-figure">{money(exactMinor(card.minPaymentMinor, card.minPayment))}</dd></div>}
          </dl>
          <p className="v3-caption">Remaining credit is a limit, not cash you hold, so it is never counted as spendable.</p>
        </>
      ) : (
        <>
          <p className="v3-secondary">{TYPE_LABEL[item.account!.type as Exclude<AccountType, 'credit_card'>]}{item.account!.institution ? ` · ${item.account!.institution}` : ''}{item.account!.lastFour ? ` · ••${item.account!.lastFour}` : ''}</p>
          <dl className="v3-act-dl"><div><dt>Balance</dt><dd className="v3-figure v3-figure--md" data-testid="v3-acct-balance">{money(bal)}</dd></div></dl>
        </>
      )}
      <h3 className="v3-h3">Recent transactions</h3>
      <Recent state={state} accountId={item.id} />
      <div className="v3-page-actions">
        <Link className="v3-btn v3-btn--primary" to={`${V3_ROUTES.activity}?account=${item.id}`}>View all activity</Link>
        {asyncFinance && !editing && <button type="button" className="v3-btn v3-btn--secondary" onClick={() => setEditing(true)}>Edit details</button>}
        {asyncFinance && <button type="button" className="v3-btn v3-btn--secondary" onClick={() => void archive()}>Archive</button>}
      </div>
      {!asyncFinance && <p className="v3-caption">Editing and archiving need a connected backend.</p>}
      {error && <p role="alert" className="v3-secondary v3-act-error">{error}</p>}
      {editing && <EditForm item={item} onDone={() => setEditing(false)} />}
      {dialog}
    </section>
  )
}

function AddAccountForm({ onDone }: { onDone: () => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const [name, setName] = useState('')
  const [type, setType] = useState<Exclude<AccountType, 'credit_card'>>('checking')
  const [institution, setInstitution] = useState('')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Account name is required.')
    const parsed = parseMoneyInput(balance || '0')
    if (!parsed.ok) return setError(parsed.error)
    setBusy(true); setError(null)
    try {
      const input = { name: name.trim(), type, institution: institution.trim() || undefined, balance: parsed.value }
      if (asyncFinance) await asyncFinance.addManualAccount(input); else finance.addManualAccount(input)
      onDone()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add account.') } finally { setBusy(false) }
  }
  return (
    <form className="v3-card v3-acct-form" onSubmit={submit} noValidate aria-label="Add account">
      <h2 className="v3-h2">Add account</h2>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-a-name">Name</label><input id="v3-a-name" className="v3-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-a-type">Type</label><select id="v3-a-type" className="v3-input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</select></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-a-inst">Institution (optional)</label><input id="v3-a-inst" className="v3-input" value={institution} onChange={(e) => setInstitution(e.target.value)} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-a-bal">Starting balance</label><input id="v3-a-bal" className="v3-input" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
      {error && <p role="alert" className="v3-secondary v3-act-error">{error}</p>}
      <div className="v3-page-actions"><button type="submit" className="v3-btn v3-btn--primary" disabled={busy}>{busy ? 'Adding…' : 'Add account'}</button><button type="button" className="v3-btn v3-btn--secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}

function AddCardForm({ onDone }: { onDone: () => void }) {
  const finance = useFinance()
  const asyncFinance = useAsyncFinanceOptional()
  const [name, setName] = useState('')
  const [lastFour, setLastFour] = useState('')
  const [network, setNetwork] = useState<'visa' | 'mastercard'>('visa')
  const [limit, setLimit] = useState('')
  const [owed, setOwed] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Card name is required.')
    if (!/^\d{4}$/.test(lastFour)) return setError('Enter the last 4 digits of the card.')
    const lim = parseMoneyInput(limit)
    if (!lim.ok || lim.value <= 0) return setError('Enter a credit limit greater than zero.')
    const bal = parseMoneyInput(owed || '0')
    if (!bal.ok) return setError(bal.error)
    if (!dueDate) return setError('Enter the next payment due date.')
    setBusy(true); setError(null)
    try {
      const input = { name: name.trim(), lastFour, network, limit: lim.value, balance: bal.value, dueDate, minPayment: 0 }
      if (asyncFinance) await asyncFinance.addManualCreditCard(input); else finance.addManualCreditCard(input)
      onDone()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add card.') } finally { setBusy(false) }
  }
  return (
    <form className="v3-card v3-acct-form" onSubmit={submit} noValidate aria-label="Add credit card">
      <h2 className="v3-h2">Add credit card</h2>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-c-name">Card name</label><input id="v3-c-name" className="v3-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-c-last">Last 4 digits</label><input id="v3-c-last" className="v3-input" inputMode="numeric" maxLength={4} value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-c-net">Network</label><select id="v3-c-net" className="v3-input" value={network} onChange={(e) => setNetwork(e.target.value as typeof network)}><option value="visa">Visa</option><option value="mastercard">Mastercard</option></select></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-c-limit">Credit limit</label><input id="v3-c-limit" className="v3-input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-c-owed">Amount you owe now (optional)</label><input id="v3-c-owed" className="v3-input" inputMode="decimal" placeholder="0.00" value={owed} onChange={(e) => setOwed(e.target.value)} /></div>
      <div className="v3-field"><label className="v3-label" htmlFor="v3-c-due">Next payment due date</label><input id="v3-c-due" type="date" className="v3-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      {error && <p role="alert" className="v3-secondary v3-act-error">{error}</p>}
      <div className="v3-page-actions"><button type="submit" className="v3-btn v3-btn--primary" disabled={busy}>{busy ? 'Adding…' : 'Add card'}</button><button type="button" className="v3-btn v3-btn--secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}

export function V3Accounts() {
  const { state } = useFinance()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState<'account' | 'card' | null>(null)
  const items = useMemo(() => accountItems(state), [state])
  const requested = params.get('account')
  const selected = items.find((i) => i.id === requested) ?? null
  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id && id !== requested) next.set('account', id); else next.delete('account')
    setParams(next)
  }
  return (
    <>
      <div className="v3-page-head">
        <h1 className="v3-h1">Accounts</h1>
        <div className="v3-page-actions">
          <button type="button" className="v3-btn v3-btn--secondary" onClick={() => setAdding(adding === 'account' ? null : 'account')} aria-expanded={adding === 'account'}>Add account</button>
          <button type="button" className="v3-btn v3-btn--secondary" onClick={() => setAdding(adding === 'card' ? null : 'card')} aria-expanded={adding === 'card'}>Add credit card</button>
        </div>
      </div>
      {adding === 'account' && <AddAccountForm onDone={() => setAdding(null)} />}
      {adding === 'card' && <AddCardForm onDone={() => setAdding(null)} />}
      {requested && !selected && <p role="alert" className="v3-card v3-ov-banner">That account was not found. It may have been archived.</p>}
      {items.length === 0 ? <p className="v3-card v3-secondary" data-testid="v3-acct-empty">No accounts yet. Add a bank account, e-wallet, cash wallet or credit card to get started.</p> : (
        <ul className="v3-acct-grid" aria-label="Accounts">
          {items.map((item) => {
            const expanded = selected?.id === item.id
            const name = item.account?.name ?? item.card!.name
            const bal = exactMinor((item.account ?? item.card)!.balanceMinor, (item.account ?? item.card)!.balance)
            const panelId = `v3-acct-panel-${item.id}`
            return (
              <li key={item.id} className="v3-acct-cell">
                <V3AccountCard
                  kind={item.kind} tone={item.tone} name={name}
                  figure={item.card ? `Owed ${money(bal)}` : money(bal)}
                  meta={item.card ? `Outstanding debt · ••${item.card.lastFour}` : [item.account!.institution, item.account!.lastFour ? `••${item.account!.lastFour}` : ''].filter(Boolean).join(' · ') || undefined}
                  expanded={expanded} controls={expanded ? panelId : undefined} onSelect={() => select(item.id)}
                  label={`${name}, ${item.card ? `outstanding debt ${money(bal)}` : `balance ${money(bal)}`}. ${expanded ? 'Hide' : 'Show'} details`}
                />
                {expanded && <Details state={state} item={item} panelId={panelId} />}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
