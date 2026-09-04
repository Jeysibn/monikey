import { useState } from 'react'
import { Card, CardTitle } from '../components/Card'
import { Sparkline } from '../components/Sparkline'
import { Tag } from '../components/StatusBadge'
import { useFinance } from '../hooks/useFinance'
import { useInvestments } from '../hooks/useInvestments'
import { useFieldErrors } from '../hooks/useFieldErrors'
import { formatMoney } from '../utils/currency'
import { formatDateLabel, isIsoDateBefore, isValidIsoDate } from '../utils/date'
import { parseMoneyInput } from '../utils/money'
import type { InvestmentTransactionType } from '../domain/investments'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { FinanceApiError } from '../services/apiFinanceGateway'
import './Investments.css'

const TX_TYPE_LABEL: Record<InvestmentTransactionType, string> = { buy: 'Buy', sell: 'Sell' }

const TX_FIELDS = ['ticker', 'name', 'sector', 'assetClass', 'units', 'price', 'date'] as const
type TxField = (typeof TX_FIELDS)[number]

const ASSET_CLASS_OPTIONS = ['equity', 'etf', 'crypto', 'reit', 'bond'] as const

// Quick-pick presets for the most commonly traded coins, so logging a new
// crypto position doesn't require typing/remembering the exact ticker,
// name, and sector every time (and keeps them consistent with whatever was
// used before, avoiding an accidental INSTRUMENT_METADATA_MISMATCH later).
const TOP_CRYPTO_PRESETS = [
  { ticker: 'BTC', name: 'Bitcoin' },
  { ticker: 'ETH', name: 'Ethereum' },
  { ticker: 'USDT', name: 'Tether' },
  { ticker: 'BNB', name: 'BNB' },
  { ticker: 'SOL', name: 'Solana' },
  { ticker: 'XRP', name: 'XRP' },
  { ticker: 'USDC', name: 'USD Coin' },
  { ticker: 'DOGE', name: 'Dogecoin' },
  { ticker: 'ADA', name: 'Cardano' },
  { ticker: 'TRX', name: 'TRON' },
] as const

function LogTransactionForm({
  tickers,
  todayIso,
  onLog,
  onClose,
}: {
  tickers: string[]
  todayIso: string
  onLog: (input: { ticker: string; name?: string; sector?: string; assetClass?: string; type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }) => void | Promise<void>
  onClose: () => void
}) {
  const NEW_TICKER_VALUE = '__new__'
  const [ticker, setTicker] = useState(tickers[0] ?? NEW_TICKER_VALUE)
  const [tickerMode, setTickerMode] = useState<'existing' | 'new'>(tickers.length > 0 ? 'existing' : 'new')
  const [newTicker, setNewTicker] = useState('')
  const [type, setType] = useState<InvestmentTransactionType>('buy')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [sector, setSector] = useState('Other')
  const [assetClass, setAssetClass] = useState<'equity' | 'etf' | 'crypto' | 'reit' | 'bond'>('equity')
  const { errors, field, errorId, fail } = useFieldErrors<TxField>(TX_FIELDS)
  const [submitting, setSubmitting] = useState(false)

  const isNewTicker = tickerMode === 'new'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedTicker = (isNewTicker ? newTicker : ticker).trim()
    if (!trimmedTicker) {
      fail({ ticker: 'Enter a ticker.' })
      return
    }
    // For new tickers, validate the additional required fields
    if (isNewTicker) {
      if (!name.trim()) {
        fail({ name: 'Enter the instrument name.' })
        return
      }
      if (!sector.trim()) {
        fail({ sector: 'Select a sector.' })
        return
      }
    }
    if (!units.trim()) {
      fail({ units: 'Enter the number of units.' })
      return
    }
    const unitsResult = parseMoneyInput(units)
    if (!unitsResult.ok) {
      fail({ units: unitsResult.error })
      return
    }
    if (unitsResult.value <= 0) {
      fail({ units: 'Enter a number of units greater than zero.' })
      return
    }
    if (!price.trim()) {
      fail({ price: 'Enter the price per unit.' })
      return
    }
    const priceResult = parseMoneyInput(price)
    if (!priceResult.ok) {
      fail({ price: priceResult.error })
      return
    }
    if (priceResult.value <= 0) {
      fail({ price: 'Enter a price greater than zero.' })
      return
    }
    if (!date) {
      fail({ date: 'Date is required.' })
      return
    }
    if (!isValidIsoDate(date)) {
      fail({ date: 'Enter a real date.' })
      return
    }
    if (isIsoDateBefore(todayIso, date)) {
      fail({ date: 'Date cannot be in the future.' })
      return
    }
    try {
      setSubmitting(true)
      const input: Parameters<typeof onLog>[0] = { ticker: trimmedTicker, type, units: unitsResult.value, price: priceResult.value, date, note: note.trim() || undefined }
      if (isNewTicker) {
        input.name = name.trim()
        input.sector = sector.trim()
        input.assetClass = assetClass
      }
      const pending = onLog(input)
      if (pending) await pending
      onClose()
    } catch (err) {
      // Route a field-scoped server error (e.g. INVESTMENT_OVERSELL's
      // `field: 'units'`) to the field it actually names instead of always
      // blaming the ticker input — fall back to ticker only when the error
      // carries no field or names one this form doesn't have.
      const apiField = err instanceof FinanceApiError && err.field && (TX_FIELDS as readonly string[]).includes(err.field) ? err.field as TxField : 'ticker'
      fail({ [apiField]: err instanceof Error ? err.message : 'Could not save investment trade.' } as Partial<Record<TxField, string>>)
    } finally { setSubmitting(false) }
  }

  return (
    <form className="log-tx-form" onSubmit={handleSubmit} noValidate>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Ticker</span>
          <select
            className="tx-input"
            value={tickerMode === 'new' ? NEW_TICKER_VALUE : ticker}
            autoFocus
            {...field('ticker', (e) => {
              if (e.target.value === NEW_TICKER_VALUE) { setTickerMode('new'); return }
              setTickerMode('existing')
              setTicker(e.target.value)
            })}
          >
            {tickers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value={NEW_TICKER_VALUE}>+ New ticker…</option>
          </select>
          {tickerMode === 'new' && (
            <>
              <input
                type="text"
                className="tx-input"
                placeholder="e.g. AAPL"
                value={newTicker}
                style={{ marginTop: '0.5rem' }}
                onChange={(e) => {
                  // Bug: typing over a ticker set by a preset pill (e.g.
                  // clicking BTC, then editing the text to ETH instead of
                  // re-picking) left the preset's `name`/`sector` behind,
                  // silently pairing the wrong instrument name with the
                  // newly-typed ticker on submit — this is how an instrument
                  // like "ETH" ends up permanently recorded as "Bitcoin".
                  // Re-sync on every keystroke: snap straight to another
                  // preset's details if the new value matches one, otherwise
                  // clear the (possibly stale) name/sector rather than risk
                  // submitting a mismatched pairing.
                  const value = e.target.value.toUpperCase()
                  setNewTicker(value)
                  const preset = TOP_CRYPTO_PRESETS.find((p) => p.ticker === value)
                  if (preset) { setName(preset.name); setSector('Cryptocurrency'); setAssetClass('crypto') }
                  else if (TOP_CRYPTO_PRESETS.some((p) => p.name === name)) { setName(''); setSector('Other') }
                }}
              />
              <div className="ticker-presets">
                <span className="ticker-presets-label">Or pick a top coin</span>
                <div className="ticker-preset-list">
                  {TOP_CRYPTO_PRESETS.map((preset) => (
                    <button
                      key={preset.ticker}
                      type="button"
                      className={`ticker-preset${newTicker === preset.ticker ? ' ticker-preset--active' : ''}`}
                      title={preset.name}
                      aria-pressed={newTicker === preset.ticker}
                      onClick={() => {
                        setNewTicker(preset.ticker)
                        setName(preset.name)
                        setSector('Cryptocurrency')
                        setAssetClass('crypto')
                      }}
                    >
                      {preset.ticker}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {errors.ticker && (
            <p className="tx-error" role="alert" id={errorId('ticker')}>
              {errors.ticker}
            </p>
          )}
        </label>
        <div className="new-category-field">
          <span className="tx-label">Type</span>
          <div className="log-tx-type" role="group" aria-label="Transaction type">
            {(['buy', 'sell'] as InvestmentTransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                className={`pill${type === t ? ' pill--active' : ''}`}
                onClick={() => setType(t)}
              >
                {TX_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {isNewTicker && (
        <div className="log-tx-row">
          <label className="new-category-field">
            <span className="tx-label">Name</span>
            <input
              type="text"
              className="tx-input"
              placeholder="e.g. Apple Inc."
              value={name}
              {...field('name', (e) => setName(e.target.value))}
            />
            {errors.name && (
              <p className="tx-error" role="alert" id={errorId('name')}>
                {errors.name}
              </p>
            )}
          </label>
          <label className="new-category-field">
            <span className="tx-label">Sector</span>
            <input
              type="text"
              className="tx-input"
              placeholder="e.g. Technology"
              value={sector}
              {...field('sector', (e) => setSector(e.target.value))}
            />
            {errors.sector && (
              <p className="tx-error" role="alert" id={errorId('sector')}>
                {errors.sector}
              </p>
            )}
          </label>
        </div>
      )}
      {isNewTicker && (
        <div className="log-tx-row">
          <label className="new-category-field">
            <span className="tx-label">Asset Class</span>
            <select className="tx-input" value={assetClass} {...field('assetClass', (e) => setAssetClass(e.target.value as typeof assetClass))}>
              {ASSET_CLASS_OPTIONS.map((ac) => (
                <option key={ac} value={ac}>
                  {ac.charAt(0).toUpperCase() + ac.slice(1)}
                </option>
              ))}
            </select>
            {errors.assetClass && (
              <p className="tx-error" role="alert" id={errorId('assetClass')}>
                {errors.assetClass}
              </p>
            )}
          </label>
          <div />
        </div>
      )}
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Units</span>
          <input
            type="text"
            inputMode="decimal"
            className="tx-input"
            placeholder="0"
            value={units}
            {...field('units', (e) => setUnits(e.target.value))}
          />
          {errors.units && (
            <p className="tx-error" role="alert" id={errorId('units')}>
              {errors.units}
            </p>
          )}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Price per unit</span>
          <input
            type="text"
            inputMode="decimal"
            className="tx-input"
            placeholder="0.00"
            value={price}
            {...field('price', (e) => setPrice(e.target.value))}
          />
          {errors.price && (
            <p className="tx-error" role="alert" id={errorId('price')}>
              {errors.price}
            </p>
          )}
        </label>
      </div>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Date</span>
          <input type="date" className="tx-input" max={todayIso} value={date} {...field('date', (e) => setDate(e.target.value))} />
          {errors.date && (
            <p className="tx-error" role="alert" id={errorId('date')}>
              {errors.date}
            </p>
          )}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Note (optional)</span>
          <input type="text" className="tx-input" placeholder="e.g. Rebalance" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <p className="form-help">This logs the trade to your activity feed only - it does not change the sample holding units or price shown above.</p>
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Log transaction'}
        </button>
      </div>
    </form>
  )
}

const EDIT_TX_FIELDS = ['units', 'price', 'date'] as const
type EditTxField = (typeof EDIT_TX_FIELDS)[number]

function EditTransactionForm({
  transaction,
  todayIso,
  onSave,
  onClose,
}: {
  transaction: { type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }
  todayIso: string
  onSave: (input: { type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }) => void | Promise<void>
  onClose: () => void
}) {
  const [type, setType] = useState<InvestmentTransactionType>(transaction.type)
  const [units, setUnits] = useState(String(transaction.units))
  const [price, setPrice] = useState(String(transaction.price))
  const [date, setDate] = useState(transaction.date)
  const [note, setNote] = useState(transaction.note ?? '')
  const { errors, field, errorId, fail } = useFieldErrors<EditTxField>(EDIT_TX_FIELDS)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!units.trim()) { fail({ units: 'Enter the number of units.' }); return }
    const unitsResult = parseMoneyInput(units)
    if (!unitsResult.ok) { fail({ units: unitsResult.error }); return }
    if (unitsResult.value <= 0) { fail({ units: 'Enter a number of units greater than zero.' }); return }
    if (!price.trim()) { fail({ price: 'Enter the price per unit.' }); return }
    const priceResult = parseMoneyInput(price)
    if (!priceResult.ok) { fail({ price: priceResult.error }); return }
    if (priceResult.value <= 0) { fail({ price: 'Enter a price greater than zero.' }); return }
    if (!date) { fail({ date: 'Date is required.' }); return }
    if (!isValidIsoDate(date)) { fail({ date: 'Enter a real date.' }); return }
    if (isIsoDateBefore(todayIso, date)) { fail({ date: 'Date cannot be in the future.' }); return }
    try {
      setSubmitting(true)
      const pending = onSave({ type, units: unitsResult.value, price: priceResult.value, date, note: note.trim() || undefined })
      if (pending) await pending
      onClose()
    } catch (err) {
      // TRADE_HAS_LINKED_TRANSACTION (409) has no field of its own — surface
      // it as a distinct, explanatory message rather than a generic
      // "units" validation error, since it isn't one.
      if (err instanceof FinanceApiError && err.code === 'TRADE_HAS_LINKED_TRANSACTION') {
        fail({ units: 'This trade moved cash between accounts and can’t be edited here. Delete and re-log it instead.' })
        return
      }
      const apiField = err instanceof FinanceApiError && err.field && (EDIT_TX_FIELDS as readonly string[]).includes(err.field) ? err.field as EditTxField : 'units'
      fail({ [apiField]: err instanceof Error ? err.message : 'Could not update investment trade.' } as Partial<Record<EditTxField, string>>)
    } finally { setSubmitting(false) }
  }

  return (
    <form className="log-tx-form" onSubmit={handleSubmit} noValidate>
      <div className="log-tx-row">
        <div className="new-category-field">
          <span className="tx-label">Type</span>
          <div className="log-tx-type" role="group" aria-label="Transaction type">
            {(['buy', 'sell'] as InvestmentTransactionType[]).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} className={`pill${type === t ? ' pill--active' : ''}`} onClick={() => setType(t)}>
                {TX_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <label className="new-category-field">
          <span className="tx-label">Units</span>
          <input type="text" inputMode="decimal" className="tx-input" value={units} {...field('units', (e) => setUnits(e.target.value))} />
          {errors.units && <p className="tx-error" role="alert" id={errorId('units')}>{errors.units}</p>}
        </label>
      </div>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Price per unit</span>
          <input type="text" inputMode="decimal" className="tx-input" value={price} {...field('price', (e) => setPrice(e.target.value))} />
          {errors.price && <p className="tx-error" role="alert" id={errorId('price')}>{errors.price}</p>}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Date</span>
          <input type="date" className="tx-input" max={todayIso} value={date} {...field('date', (e) => setDate(e.target.value))} />
          {errors.date && <p className="tx-error" role="alert" id={errorId('date')}>{errors.date}</p>}
        </label>
      </div>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Note (optional)</span>
          <input type="text" className="tx-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div />
      </div>
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

const DIV_FIELDS = ['ticker', 'amount', 'date'] as const
type DivField = (typeof DIV_FIELDS)[number]

function LogDividendForm({
  tickers,
  todayIso,
  onLog,
  onClose,
}: {
  tickers: string[]
  todayIso: string
  onLog: (input: { ticker: string; amount: number; date: string; note?: string }) => void | Promise<void>
  onClose: () => void
}) {
  const [ticker, setTicker] = useState(tickers[0] ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState('')
  const { errors, field, errorId, fail } = useFieldErrors<DivField>(DIV_FIELDS)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker.trim()) { fail({ ticker: 'Select a ticker.' }); return }
    if (!amount.trim()) { fail({ amount: 'Enter the dividend amount.' }); return }
    const amountResult = parseMoneyInput(amount)
    if (!amountResult.ok) { fail({ amount: amountResult.error }); return }
    if (amountResult.value <= 0) { fail({ amount: 'Enter an amount greater than zero.' }); return }
    if (!date) { fail({ date: 'Date is required.' }); return }
    if (!isValidIsoDate(date)) { fail({ date: 'Enter a real date.' }); return }
    if (isIsoDateBefore(todayIso, date)) { fail({ date: 'Date cannot be in the future.' }); return }
    try {
      setSubmitting(true)
      const pending = onLog({ ticker: ticker.trim(), amount: amountResult.value, date, note: note.trim() || undefined })
      if (pending) await pending
      onClose()
    } catch (err) {
      fail({ ticker: err instanceof Error ? err.message : 'Could not save dividend.' })
    } finally { setSubmitting(false) }
  }

  return (
    <form className="log-tx-form" onSubmit={handleSubmit} noValidate>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Ticker</span>
          <select className="tx-input" value={ticker} autoFocus {...field('ticker', (e) => setTicker(e.target.value))}>
            {tickers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.ticker && <p className="tx-error" role="alert" id={errorId('ticker')}>{errors.ticker}</p>}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Amount</span>
          <input type="text" inputMode="decimal" className="tx-input" placeholder="0.00" value={amount} {...field('amount', (e) => setAmount(e.target.value))} />
          {errors.amount && <p className="tx-error" role="alert" id={errorId('amount')}>{errors.amount}</p>}
        </label>
      </div>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Date</span>
          <input type="date" className="tx-input" max={todayIso} value={date} {...field('date', (e) => setDate(e.target.value))} />
          {errors.date && <p className="tx-error" role="alert" id={errorId('date')}>{errors.date}</p>}
        </label>
        <label className="new-category-field">
          <span className="tx-label">Note (optional)</span>
          <input type="text" className="tx-input" placeholder="e.g. Q3 payout" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting || tickers.length === 0}>
          {submitting ? 'Saving…' : 'Log dividend'}
        </button>
      </div>
      {tickers.length === 0 && <p className="form-help">Log a trade first — dividends must be recorded against a held ticker.</p>}
    </form>
  )
}

export function Investments() {
  const finance = useFinance()
  const inv = useInvestments()
  const asyncFinance = useAsyncFinanceOptional()
  const [logOpen, setLogOpen] = useState(false)
  const [divLogOpen, setDivLogOpen] = useState(false)
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const handleRefreshQuotes = async () => {
    if (!asyncFinance || refreshing) return
    setRefreshing(true)
    try {
      await asyncFinance.refreshQuotes()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not refresh prices.')
    } finally {
      setRefreshing(false)
    }
  }
  const handleLog = (input: { ticker: string; name?: string; sector?: string; assetClass?: string; type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }) => {
    if (!asyncFinance) { inv.logTransaction(input); return }
    // Look up the ticker's real recorded metadata (open OR closed
    // positions) rather than only open holdings, so re-buying a fully-sold
    // ticker reuses its actual name/assetClass/sector instead of falling
    // through to generic defaults that would mismatch it.
    const known = inv.instrumentMetadataByTicker.get(input.ticker)
    const assetClass = (input.assetClass ?? known?.assetClass ?? 'equity') as 'equity' | 'etf' | 'crypto' | 'reit' | 'bond'
    return asyncFinance.addInvestmentTrade({ ...input, name: input.name ?? known?.name ?? input.ticker, assetClass, sector: input.sector ?? known?.sector ?? 'Other' })
  }
  const handleEditTrade = (id: string, input: { type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }) => {
    if (!asyncFinance) { inv.editTransaction(id, input); return }
    return asyncFinance.updateInvestmentTrade(id, input)
  }
  const handleLogDividend = (input: { ticker: string; amount: number; date: string; note?: string }) => {
    if (!asyncFinance) { inv.logDividend(input); return }
    return asyncFinance.addInvestmentDividend({ ticker: input.ticker, amountMinor: Math.round(input.amount * 100), date: input.date, note: input.note })
  }
  const handleDeleteTrade = async (id: string) => {
    if (!window.confirm('Delete this investment transaction? This cannot be undone.')) return
    try {
      if (!asyncFinance) { inv.deleteTransaction(id); return }
      await asyncFinance.deleteInvestmentTrade(id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete investment transaction.')
    }
  }

  const perfLabels = inv.performanceHistory.map((_, i) => (i === inv.performanceHistory.length - 1 ? 'Today' : `T-${inv.performanceHistory.length - 1 - i}`))

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Investments</h1>
        {asyncFinance && (
          <button type="button" className="btn btn--ghost btn--compact" onClick={handleRefreshQuotes} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
        )}
      </div>

      {inv.portfolioError && (
        <div className="inv-portfolio-warning" role="alert">
          <span>
            Couldn’t reach the portfolio service — showing an approximate, locally-estimated value instead of your real cost basis and returns.
            {inv.portfolioError.message ? ` (${inv.portfolioError.message})` : ''}
          </span>
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => inv.retryPortfolio?.()}>
            Retry
          </button>
        </div>
      )}

      <div className="kpi-row">
        <Card>
          <div className="eyebrow">Portfolio Value</div>
          <div className="num kpi-val">{formatMoney(inv.portfolioValue, { withCents: false })}</div>
          <div className="faint">Across {inv.holdings.length} holdings</div>
        </Card>
        <Card>
          <div className="eyebrow">Total Gain/Loss</div>
          <div className={`num kpi-val ${inv.totalGainLoss >= 0 ? 'inv-pos' : 'inv-neg'}`}>{formatMoney(inv.totalGainLoss)}</div>
          <div className={inv.totalGainLoss >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
            {inv.totalGainLoss >= 0 ? '+' : ''}
            {inv.totalGainLossPct.toFixed(2)}% since cost basis
          </div>
        </Card>
        <Card>
          <div className="eyebrow">Today's Change</div>
          <div className={`num kpi-val ${inv.todaysChange >= 0 ? 'inv-pos' : 'inv-neg'}`}>{formatMoney(inv.todaysChange)}</div>
          <div className={inv.todaysChange >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
            {inv.todaysChange >= 0 ? '+' : ''}
            {inv.todaysChangePct.toFixed(2)}% today
          </div>
        </Card>
        <Card>
          <div className="eyebrow">Total Dividends</div>
          <div className="num kpi-val">{formatMoney(inv.totalDividends, { withCents: false })}</div>
          <div className="faint">{inv.dividends.length} payouts logged</div>
        </Card>
      </div>

      {inv.bestPerformer && inv.worstPerformer && inv.bestPerformer.ticker !== inv.worstPerformer.ticker && (
        <div className="inv-movers-row">
          <Card className="inv-mover-card">
            <div className="eyebrow">Top Gainer (24h)</div>
            <div className="inv-mover-body">
              <div>
                <div style={{ fontWeight: 700 }}>{inv.bestPerformer.name}</div>
                <div className="inv-meta">{inv.bestPerformer.ticker}</div>
              </div>
              <div className={`num inv-mover-pct ${inv.bestPerformer.changePct >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                {inv.bestPerformer.changePct >= 0 ? '+' : ''}
                {inv.bestPerformer.changePct.toFixed(2)}%
              </div>
            </div>
          </Card>
          <Card className="inv-mover-card">
            <div className="eyebrow">Top Loser (24h)</div>
            <div className="inv-mover-body">
              <div>
                <div style={{ fontWeight: 700 }}>{inv.worstPerformer.name}</div>
                <div className="inv-meta">{inv.worstPerformer.ticker}</div>
              </div>
              <div className={`num inv-mover-pct ${inv.worstPerformer.changePct >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                {inv.worstPerformer.changePct >= 0 ? '+' : ''}
                {inv.worstPerformer.changePct.toFixed(2)}%
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card className="inv-alloc-card">
        <div className="section-head">
          <span className="card-title-text">Asset Allocation</span>
          <button type="button" className="btn inv-btn--muted btn--compact" disabled title="Coming soon">
            Rebalance
            <span className="coming-soon-tag">Coming soon</span>
          </button>
        </div>
        <div className="inv-alloc-bar" role="img" aria-label={`Allocation by sector: ${inv.allocation.map((a) => `${a.sector} ${Math.round(a.pct)}%`).join(', ')}`}>
          {inv.allocation.map((a) => (
            <span key={a.sector} className="inv-alloc-seg" style={{ width: `${a.pct}%`, background: a.color }} />
          ))}
        </div>
        <ul className="inv-alloc-list">
          {inv.allocation.map((a) => (
            <li key={a.sector} className="inv-alloc-row">
              <span className="inv-alloc-name">
                <span className="swatch" style={{ background: a.color }} />
                {a.sector}
              </span>
              <span className="faint num">{a.pct.toFixed(1)}%</span>
              <span className="num inv-alloc-val">{formatMoney(a.marketValue, { withCents: false })}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="section-head inv-section-head">
        <span className="card-title-text">Holdings</span>
        <span className="faint">{inv.holdings.length} positions</span>
      </div>
      <Card className="inv-holdings-card">
        <div className="inv-holdings-table" role="table" aria-label="Holdings">
          <div className="inv-holdings-row inv-holdings-head" role="row">
            <span role="columnheader">Asset</span>
            <span role="columnheader">Ticker</span>
            <span role="columnheader" className="inv-col-right">
              Units
            </span>
            <span role="columnheader" className="inv-col-right">
              Avg Cost
            </span>
            <span role="columnheader" className="inv-col-right">
              Current Price
            </span>
            <span role="columnheader" className="inv-col-right">
              Market Value
            </span>
            <span role="columnheader" className="inv-col-right">
              Total Return
            </span>
            <span role="columnheader" className="inv-col-right">
              Daily Return
            </span>
          </div>
          {inv.holdings.map((h) => (
            <div className="inv-holdings-row" role="row" key={h.ticker}>
              <span role="cell">
                <div style={{ fontWeight: 600 }}>{h.name}</div>
                <div className="inv-meta">{h.sector}</div>
              </span>
              <span role="cell" className="num">
                {h.ticker}
              </span>
              <span role="cell" className="num inv-col-right">
                {h.units}
              </span>
              <span role="cell" className="num inv-col-right">
                {formatMoney(h.averageCost)}
              </span>
              <span role="cell" className="num inv-col-right">
                {formatMoney(h.price)}
              </span>
              <span role="cell" className="num inv-col-right">
                {formatMoney(h.marketValue, { withCents: false })}
              </span>
              <span role="cell" className={`num inv-col-right ${h.totalReturn >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                {formatMoney(h.totalReturn, { withCents: false })}
                <div className="inv-meta">
                  {h.totalReturn >= 0 ? '+' : ''}
                  {h.totalReturnPct.toFixed(2)}%
                </div>
              </span>
              <span role="cell" className={`num inv-col-right ${h.dailyReturn >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                {formatMoney(h.dailyReturn, { withCents: false })}
                <div className="inv-meta">
                  {h.changePct >= 0 ? '+' : ''}
                  {h.changePct}%
                </div>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <ul className="inv-holdings-mobile">
        {inv.holdings.map((h) => (
          <li className="inv-holdings-mobile-card" key={h.ticker}>
            <div className="inv-holdings-mobile-top">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {h.name} <span className="faint num">{h.ticker}</span>
                </div>
                <div className="inv-meta">{h.sector}</div>
              </div>
              <Sparkline
                values={h.history}
                width={72}
                height={22}
                color={h.changePct >= 0 ? 'var(--teal)' : 'var(--red)'}
                strokeWidth={2}
              />
            </div>
            <div className="inv-holdings-mobile-grid">
              <div>
                <div className="inv-meta">Units</div>
                <div className="num">{h.units}</div>
              </div>
              <div>
                <div className="inv-meta">Avg Cost</div>
                <div className="num">{formatMoney(h.averageCost)}</div>
              </div>
              <div>
                <div className="inv-meta">Current Price</div>
                <div className="num">{formatMoney(h.price)}</div>
              </div>
              <div>
                <div className="inv-meta">Market Value</div>
                <div className="num">{formatMoney(h.marketValue, { withCents: false })}</div>
              </div>
              <div>
                <div className="inv-meta">Total Return</div>
                <div className={`num ${h.totalReturn >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                  {formatMoney(h.totalReturn, { withCents: false })} ({h.totalReturnPct.toFixed(1)}%)
                </div>
              </div>
              <div>
                <div className="inv-meta">Daily Return</div>
                <div className={`num ${h.dailyReturn >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                  {formatMoney(h.dailyReturn, { withCents: false })} ({h.changePct >= 0 ? '+' : ''}
                  {h.changePct}%)
                </div>
              </div>
            </div>
            <button type="button" className="btn inv-btn--outline btn--compact" disabled title="Coming soon">
              Set price alert
              <span className="coming-soon-tag">Coming soon</span>
            </button>
          </li>
        ))}
      </ul>

      {inv.closedPositions.length > 0 && (
        <>
          <div className="section-head inv-section-head">
            <span className="card-title-text">Closed Positions</span>
            <span className="faint">{inv.closedPositions.length} closed</span>
          </div>
          <Card className="inv-closed-card">
            <ul className="inv-closed-list">
              {inv.closedPositions.map((c) => (
                <li className="inv-closed-row" key={c.ticker}>
                  <span>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="inv-meta">
                      {c.ticker} · {c.sector}
                    </div>
                  </span>
                  <span className={`num inv-col-right ${c.realizedPnl >= 0 ? 'inv-pos' : 'inv-neg'}`}>
                    {formatMoney(c.realizedPnl, { withCents: false })}
                    <div className="inv-meta">
                      {c.realizedPnlPct == null ? 'Realized P&L' : `${c.realizedPnlPct >= 0 ? '+' : ''}${c.realizedPnlPct.toFixed(2)}%`}
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <div className="inv-split">
        <Card>
          <div className="section-head">
            <span className="card-title-text">Investment Transactions</span>
            <button type="button" className="add-link" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>
              + Log transaction
            </button>
          </div>
          {logOpen && (
            <LogTransactionForm tickers={inv.tickers} todayIso={finance.todayIso} onLog={handleLog} onClose={() => setLogOpen(false)} />
          )}
          <ul className="inv-tx-list">
            {inv.transactions.map((t) =>
              editingTxId === t.id ? (
                <li className="inv-tx-row" key={t.id} style={{ display: 'block' }}>
                  <EditTransactionForm
                    transaction={t}
                    todayIso={finance.todayIso}
                    onSave={(input) => handleEditTrade(t.id, input)}
                    onClose={() => setEditingTxId(null)}
                  />
                </li>
              ) : (
                <li className="inv-tx-row" key={t.id}>
                  <Tag tone={t.type === 'buy' ? 'income' : 'transfer'}>{TX_TYPE_LABEL[t.type]}</Tag>
                  <div className="inv-tx-mid">
                    <div style={{ fontWeight: 600 }}>
                      {t.ticker} · {t.units} units @ {formatMoney(t.price)}
                    </div>
                    <div className="inv-meta">
                      {formatDateLabel(t.date)}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                  </div>
                  <span className="num inv-tx-amt">{formatMoney(t.amount, { withCents: false })}</span>
                  <div className="inv-tx-actions">
                    <button type="button" className="btn btn--ghost btn--compact" onClick={() => setEditingTxId(t.id)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleDeleteTrade(t.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </Card>

        <Card>
          <div className="section-head">
            <span className="card-title-text">Dividends</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="num" style={{ fontSize: 14 }}>
                {formatMoney(inv.totalDividends, { withCents: false })}
              </span>
              <button type="button" className="add-link" aria-expanded={divLogOpen} onClick={() => setDivLogOpen((v) => !v)}>
                + Log dividend
              </button>
            </span>
          </div>
          {divLogOpen && (
            <LogDividendForm tickers={inv.tickers} todayIso={finance.todayIso} onLog={handleLogDividend} onClose={() => setDivLogOpen(false)} />
          )}
          <ul className="inv-div-list">
            {inv.dividends.map((d) => (
              <li className="inv-div-row" key={d.id}>
                <span style={{ fontWeight: 600 }}>{d.ticker}</span>
                <span className="faint">{formatDateLabel(d.date)}</span>
                <span className="num inv-pos">{formatMoney(d.amount)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn inv-btn--muted btn--compact" disabled title="Coming soon" style={{ marginTop: 10 }}>
            Download tax statement
            <span className="coming-soon-tag">Coming soon</span>
          </button>
        </Card>
      </div>

      <Card className="inv-perf-card">
        <CardTitle action={<span className="faint">Aggregate value, last {inv.performanceHistory.length} sessions</span>}>Performance History</CardTitle>
        <div className="inv-perf-line">
          {inv.performanceHistory.length === 0 ? (
            <p className="faint">No performance history yet - add a position to start tracking it.</p>
          ) : (
            <Sparkline
              values={inv.performanceHistory}
              width={700}
              height={130}
              strokeWidth={2.8}
              color="var(--cyan)"
              className="inv-perf-spark"
            />
          )}
          <div className="inv-perf-labels">
            {perfLabels.map((label, i) => (
              <span key={label + i} className={i === perfLabels.length - 1 ? 'num' : undefined}>
                {label}
              </span>
            ))}
          </div>
          <ul className="visually-hidden">
            {inv.performanceHistory.map((v, i) => (
              <li key={i}>
                {perfLabels[i]}: {formatMoney(v, { withCents: false })}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  )
}
