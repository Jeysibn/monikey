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
import './Investments.css'

const TX_TYPE_LABEL: Record<InvestmentTransactionType, string> = { buy: 'Buy', sell: 'Sell' }

const TX_FIELDS = ['ticker', 'units', 'price', 'date'] as const
type TxField = (typeof TX_FIELDS)[number]

function LogTransactionForm({
  tickers,
  todayIso,
  onLog,
  onClose,
}: {
  tickers: string[]
  todayIso: string
  onLog: (input: { ticker: string; type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }) => void
  onClose: () => void
}) {
  const [ticker, setTicker] = useState(tickers[0] ?? '')
  const [type, setType] = useState<InvestmentTransactionType>('buy')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState('')
  const { errors, field, errorId, fail } = useFieldErrors<TxField>(TX_FIELDS)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker) {
      fail({ ticker: 'Select a ticker.' })
      return
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
      fail({ date: 'Date can’t be in the future.' })
      return
    }
    onLog({ ticker, type, units: unitsResult.value, price: priceResult.value, date, note: note.trim() || undefined })
    onClose()
  }

  return (
    <form className="log-tx-form" onSubmit={handleSubmit} noValidate>
      <div className="log-tx-row">
        <label className="new-category-field">
          <span className="tx-label">Ticker</span>
          <select className="tx-input" value={ticker} aria-label="Ticker" {...field('ticker', (e) => setTicker(e.target.value))}>
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
      <p className="form-help">This logs the trade to your activity feed only — it does not change the sample holding units or price shown above.</p>
      <div className="new-category-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Log transaction
        </button>
      </div>
    </form>
  )
}

export function Investments() {
  const finance = useFinance()
  const inv = useInvestments()
  const [logOpen, setLogOpen] = useState(false)

  const perfLabels = inv.performanceHistory.map((_, i) => (i === inv.performanceHistory.length - 1 ? 'Today' : `T-${inv.performanceHistory.length - 1 - i}`))

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Investments</h1>
      </div>

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
          <div className="eyebrow">Today’s Change</div>
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

      <div className="inv-split">
        <Card>
          <div className="section-head">
            <span className="card-title-text">Investment Transactions</span>
            <button type="button" className="add-link" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>
              + Log transaction
            </button>
          </div>
          {logOpen && (
            <LogTransactionForm tickers={inv.tickers} todayIso={finance.todayIso} onLog={inv.logTransaction} onClose={() => setLogOpen(false)} />
          )}
          <ul className="inv-tx-list">
            {inv.transactions.map((t) => (
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
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="section-head">
            <span className="card-title-text">Dividends</span>
            <span className="num" style={{ fontSize: 14 }}>
              {formatMoney(inv.totalDividends, { withCents: false })}
            </span>
          </div>
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
          <Sparkline
            values={inv.performanceHistory}
            width={700}
            height={130}
            strokeWidth={2.8}
            color="var(--cyan)"
            className="inv-perf-spark"
          />
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
