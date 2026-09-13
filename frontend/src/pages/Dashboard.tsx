import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { Sparkline } from '../components/Sparkline'
import { MoneyPosition } from '../components/MoneyPosition'
import { Link } from 'react-router-dom'
import { useFinance } from '../hooks/useFinance'
import { formatMoney } from '../utils/currency'
import { formatDateLabel, formatDueDateLabel, formatTimeLabel } from '../utils/date'
import './Dashboard.css'

type CryptoCoinPreview = { instrumentId?: string; symbol: string; name: string; quantity?: string; currentPrice?: string | null; marketValue?: string | null; change24hPct?: number | null }
type CryptoSummaryPreview = { portfolioValue: string; totalPnl: string; totalPnlPct?: string | null }
const DEMO_CRYPTO_COINS: CryptoCoinPreview[] = [
  { symbol: 'BTC', name: 'Bitcoin', quantity: '0.42', currentPrice: '4906411', marketValue: '2060812.62', change24hPct: -1.09 },
  { symbol: 'ETH', name: 'Ethereum', quantity: '6.1', currentPrice: '155455', marketValue: '948275.5', change24hPct: -0.46 },
  { symbol: 'SOL', name: 'Solana', quantity: '38', currentPrice: '9280', marketValue: '352640', change24hPct: 2.14 },
]
const DEMO_CRYPTO_SUMMARY: CryptoSummaryPreview = { portfolioValue: '3361728.12', totalPnl: '28819.82', totalPnlPct: '18.5' }
function backendEnabled() { return import.meta.env.VITE_FINANCE_BACKEND === 'true' }

type ExpensesPeriod = 'daily' | 'weekly' | 'monthly'
const PERIOD_LABEL: Record<ExpensesPeriod, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
// Label for the trailing bucket's total — the bucket that always ends today,
// regardless of period — so the indicator stays meaningful when the user
// switches away from Daily instead of disappearing (TR-005 companion fix).
const PERIOD_SUFFIX: Record<ExpensesPeriod, string> = { daily: 'today', weekly: 'in the last 7 days', monthly: 'this month' }

export function Dashboard() {
  const finance = useFinance()
  const { accounts, creditCards } = finance.state
  const previewAccounts = accounts.slice(0, 4)
  const activeGoalsPreview = finance.activeGoals
  const completedCount = finance.completedGoals.length
  const recent = finance.state.transactions.slice(0, 5)
  const [period, setPeriod] = useState<ExpensesPeriod>('daily')
  // TR-005: the chart title and the buckets come from the same selector, so
  // the words always describe the exact window the data covers.
  const expensesByDay = finance.expensesTrend(period)
  const expensesTitle = finance.expensesTrendTitle(period)
  const expensesRange = finance.expensesTrendRangeLabel(expensesByDay)
  const maxDay = Math.max(1, ...expensesByDay.map((d) => d.amount))
  // The last bucket in every period always ends today, so its amount is the
  // correct "so far" figure for whichever period is currently selected.
  const latestBucketAmount = expensesByDay.length > 0 ? expensesByDay[expensesByDay.length - 1].amount : null

  const [cryptoCoins, setCryptoCoins] = useState<CryptoCoinPreview[]>(backendEnabled() ? [] : DEMO_CRYPTO_COINS)
  const [cryptoSummary, setCryptoSummary] = useState<CryptoSummaryPreview | null>(backendEnabled() ? null : DEMO_CRYPTO_SUMMARY)
  const [cryptoStale, setCryptoStale] = useState(false)
  useEffect(() => {
    if (!backendEnabled()) return
    const controller = new AbortController()
    void fetch('/api/v1/crypto', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { summary?: CryptoSummaryPreview; coins?: CryptoCoinPreview[]; marketStatus?: { stale?: boolean } }
        if (!response.ok) throw new Error('Could not load crypto portfolio.')
        setCryptoSummary(body.summary ?? null)
        setCryptoCoins(body.coins ?? [])
        setCryptoStale(Boolean(body.marketStatus?.stale))
      })
      .catch(() => { if (!controller.signal.aborted) setCryptoStale(true) })
    return () => controller.abort()
  }, [])
  const topCryptoCoins = [...cryptoCoins]
    .sort((a, b) => Number(b.marketValue ?? 0) - Number(a.marketValue ?? 0))
    .slice(0, 4)

  return (
    <div className="dashboard">
      <MoneyPosition />

      <div className="dash-grid">
        <Card className="area-balance balance-card">
          <div className="eyebrow">Available Cash</div>
          <div className="bal-amount num">{formatMoney(finance.totalAvailableCash, { withCents: true })}</div>
          <div className="faint">
            Across {accounts.length} cash sources
            {typeof finance.availableCashMonthlyChangePct === 'number' && (
              <>
                {' · '}
                <span className={finance.availableCashMonthlyChangePct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                  {finance.availableCashMonthlyChangePct >= 0 ? '+' : ''}
                  {finance.availableCashMonthlyChangePct}% in {finance.activePeriodLabel}
                </span>
              </>
            )}
          </div>

          <div className="flow-row">
            <div>
              <div className="flow-amt num">{formatMoney(finance.netCashFlow)}</div>
              <div className="eyebrow">Net Cash Flow · {finance.activePeriodLabel}</div>
            </div>
            <span className="badge">Budget used {finance.budgetUsedPct}%</span>
          </div>

          <div className="acct-preview">
            <div className="acct-preview-head">
              <span style={{ fontWeight: 600 }}>Accounts</span>
              <span className="faint">
                {previewAccounts.length} of {accounts.length} shown
              </span>
            </div>
            {previewAccounts.map((a) => (
              <div className="bal-acct-row" key={a.id}>
                <div className="bal-acct-mid">
                  <div className="bal-acct-name">
                    {a.name}
                    {a.lastFour ? ` ••${a.lastFour}` : ''}
                  </div>
                  <div className="bal-acct-type faint">{a.institution ?? a.type}</div>
                </div>
                <div className="bal-acct-amt num">{formatMoney(a.balance, { withCents: false })}</div>
              </div>
            ))}
            <Link to="/accounts" className="see-all">
              View all accounts →
            </Link>
          </div>
        </Card>

        <Card className="area-expenses">
          <CardTitle
            action={
              <div className="expenses-head-right">
                <div className="seg" role="group" aria-label="Expenses period">
                  {(['daily', 'weekly', 'monthly'] as ExpensesPeriod[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={period === p}
                      className={`pill seg-pill${period === p ? ' pill--active' : ''}`}
                      onClick={() => setPeriod(p)}
                    >
                      {PERIOD_LABEL[p]}
                    </button>
                  ))}
                </div>
                {latestBucketAmount !== null && (
                  <span className="num" style={{ fontSize: 14 }}>
                    {formatMoney(latestBucketAmount, { withCents: false })} {PERIOD_SUFFIX[period]}
                  </span>
                )}
              </div>
            }
          >
            Expenses · {expensesTitle}
          </CardTitle>
          <div className="expenses-range">{expensesRange}</div>
          <div className="expenses-line">
            <Sparkline
              key={period}
              values={expensesByDay.map((d) => d.amount)}
              width={700}
              height={130}
              strokeWidth={2.8}
              className="expenses-spark"
            />
            <div className="months">
              {expensesByDay.map((d, i) => (
                <span
                  key={d.startIso}
                  className={i === expensesByDay.length - 1 ? 'num expenses-line-today' : undefined}
                  title={`${d.day}: ${d.rangeLabel}`}
                >
                  {d.day}
                </span>
              ))}
            </div>
            {/* Each bucket announces the exact dates it covers, so `W1`–`W4`
                never has to be guessed at (TR-005). */}
            <ul className="visually-hidden">
              {expensesByDay.map((d) => (
                <li key={d.startIso}>
                  {d.day} ({d.rangeLabel}): {formatMoney(d.amount, { withCents: false })}, {Math.round((d.amount / maxDay) * 100)}% of the
                  highest point shown
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="area-budget">
          <CardTitle action={<span className="num" style={{ fontSize: 14 }}>{formatMoney(finance.state.totalBudgetAllocated, { withCents: false })}</span>}>
            Budget · {finance.activePeriodLabel}
          </CardTitle>
          <div className="faint" style={{ marginTop: -4, marginBottom: 8 }}>
            {formatMoney(finance.totalBudgetRemaining, { withCents: false })} remaining
          </div>
          <ProgressBar pct={finance.budgetUsedPct} label="Total budget used" />
          <ul className="mini-list">
            <li>
              On track <span className="num">{finance.budgetOnTrackCount} categories</span>
            </li>
            <li>
              Near limit <span className="num">{finance.budgetNearLimitCount} categories</span>
            </li>
            <li>
              Over budget <span className="num">{finance.budgetOverCount} categories</span>
            </li>
            <li>
              Unallocated <span className="num">{formatMoney(finance.budgetUnallocated, { withCents: false })}</span>
            </li>
          </ul>
          <Link to="/budget" className="see-all">
            View budget →
          </Link>
        </Card>

        <Card className="area-goals">
          <CardTitle action={<span className="faint">{activeGoalsPreview.length} active</span>}>Goals</CardTitle>
          <ul className="mini-list mini-list--goals">
            {activeGoalsPreview.map((g) => (
              <li key={g.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <div className="dash-meta">
                    {g.status === 'behind_pace' ? 'Behind pace' : g.status === 'on_track' ? 'On track' : 'Just started'}
                  </div>
                </div>
                <span className="num">{finance.goalProgressPct(g)}%</span>
              </li>
            ))}
          </ul>
          <Link to="/goals" className="see-all" style={{ display: 'block', textAlign: 'left' }}>
            {completedCount} goals completed · View all →
          </Link>
        </Card>

        <Card className="area-spend">
          <CardTitle action={<span className="faint">{finance.activePeriodLabel}</span>}>Spend Mix</CardTitle>
          <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
            {formatMoney(finance.spendMixTotal, { withCents: false })}
          </div>
          <ul className="mini-list">
            {finance.spendMix.map((s) => (
              <li key={s.categoryId}>
                <span>
                  <span className="swatch" style={{ background: s.color }} /> {s.category}
                </span>
                <span className="num">{formatMoney(s.amount, { withCents: false })}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="area-credit">
          <CardTitle action={<span className="faint">{creditCards.length} cards · {formatMoney(finance.totalCreditOwed, { withCents: false })} owed</span>}>
            Credit Cards
          </CardTitle>
          <div className="cc-row">
            {creditCards.map((c) => (
              <div className="cc-item" key={c.id}>
                <div className={`cc-plastic cc-plastic--${c.network}`}>
                  <div className="cc-chip" />
                  <div className="cc-num">•••• •••• •••• {c.lastFour}</div>
                </div>
                <div className="cc-info">
                  <div style={{ fontWeight: 600 }}>
                    {c.name} ••{c.lastFour}
                  </div>
                  <div className="dash-meta">
                    Due {formatDueDateLabel(c.dueDate)} · min {formatMoney(c.minPayment, { withCents: false })}
                  </div>
                  <ProgressBar
                    pct={(c.balance / c.limit) * 100}
                    color="var(--amber)"
                    label={`${c.name} used`}
                    valueText={`${Math.round((c.balance / c.limit) * 100)}% used, ${formatMoney(c.balance, { withCents: false })} of ${formatMoney(c.limit, { withCents: false })}`}
                  />
                  <div className="dash-meta">
                    {formatMoney(c.balance, { withCents: false })} used of {formatMoney(c.limit, { withCents: false })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="area-portfolio">
          <CardTitle action={<Link to="/investments" className="see-all">See all</Link>}>Crypto Portfolio</CardTitle>
          {cryptoSummary ? (
            <div className="dash-meta" style={{ marginTop: -6, marginBottom: 6 }}>
              {formatMoney(Number(cryptoSummary.portfolioValue), { withCents: true })} total
              {cryptoSummary.totalPnlPct != null && (
                <>
                  {' · '}
                  <span className={Number(cryptoSummary.totalPnl) >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                    {Number(cryptoSummary.totalPnl) >= 0 ? '+' : ''}
                    {Number(cryptoSummary.totalPnlPct).toFixed(1)}% all-time
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="dash-meta" style={{ marginTop: -6, marginBottom: 6 }}>
              {backendEnabled() ? (cryptoStale ? 'Market prices are temporarily unavailable.' : 'No coins tracked yet.') : 'Sample data'}
            </div>
          )}
          {topCryptoCoins.length > 0 ? (
            <div className="portfolio-grid">
              {topCryptoCoins.map((coin) => (
                <div className="portfolio-tile" key={coin.instrumentId ?? coin.symbol}>
                  <div className="num" style={{ fontWeight: 700 }}>
                    {coin.currentPrice ? formatMoney(Number(coin.currentPrice), { withCents: true }) : '—'}
                  </div>
                  {typeof coin.change24hPct === 'number' && (
                    <div className={coin.change24hPct >= 0 ? 'kpi-delta--up' : 'kpi-delta--down'}>
                      {coin.change24hPct >= 0 ? '+' : ''}
                      {coin.change24hPct.toFixed(2)}%
                    </div>
                  )}
                  <div className="portfolio-foot">
                    <span title={coin.name}>{coin.symbol}</span>
                    {coin.quantity && <span className="faint">Units {coin.quantity}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Link to="/investments" className="see-all" style={{ display: 'block', textAlign: 'left' }}>
              Add your first coin →
            </Link>
          )}
        </Card>

        <Card className="area-recent">
          <CardTitle action={<span className="faint">Most recent</span>}>Recent Transactions</CardTitle>
          <table className="tx-table">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="dash-meta">
                      {finance.transactionSourceLabel(t)} · {formatDateLabel(t.date)}
                      {t.time ? ` · ${formatTimeLabel(t.time)}` : ''}
                    </div>
                    {finance.transferFeeReconciliationLabel(t) && (
                      <div className="dash-meta">{finance.transferFeeReconciliationLabel(t)}</div>
                    )}
                    {finance.cardPaymentReconciliationLabel(t) && (
                      <div className="dash-meta">{finance.cardPaymentReconciliationLabel(t)}</div>
                    )}
                  </td>
                  <td>
                    {t.categoryId ? (
                      <span
                        className="tx-tag"
                        style={{ color: finance.categoryColor(t.categoryId), background: `color-mix(in oklch, ${finance.categoryColor(t.categoryId)} 16%, transparent)` }}
                      >
                        {finance.categoryName(t.categoryId)}
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    <span className="tx-acct">
                      <span className="tx-acct-dot" style={{ background: finance.transactionAccountDotColor(t) }} />
                      <span className="faint">{finance.transactionAccountLabel(t)}</span>
                    </span>
                  </td>
                  <td className={`num tx-amt tx-amt--${t.amount < 0 ? 'out' : 'in'}`}>{formatMoney(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
