import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import './Crypto.css'

type Coin = { instrumentId?: string; providerAssetId: string | null; symbol: string; name: string; imageUrl: string | null; marketCapRank: number | null; quantity?: string; currentPrice?: string | null; marketValue?: string | null; averageCost?: string; costBasis?: string; realizedPnl?: string; unrealizedPnl?: string | null; totalPnl?: string | null; allocationPct?: string }
type Summary = { portfolioValue: string; change24h?: string; change24hPct?: string | null; costBasis: string; realizedPnl: string; unrealizedPnl: string; totalPnl: string; baseCurrency: string }
type Location = { id: string; name: string; type: 'exchange' | 'wallet' | 'other' }
type Activity = { id: string; instrumentId?: string; type: 'buy' | 'sell' | 'transfer'; symbol: string; name: string; units: string; priceAmount?: string; feeAmount?: string; currencyCode?: string; location?: string | null; fromLocation?: string; toLocation?: string; networkFeeUnits?: string; occurredOn: string; occurredTime: string | null; note: string | null }
type HistoryPoint = { timestamp: string; valueAmount: string }
type TransactionPrefill = Partial<Pick<Activity, 'units' | 'priceAmount' | 'feeAmount' | 'occurredOn' | 'occurredTime' | 'note' | 'location' | 'fromLocation' | 'toLocation' | 'networkFeeUnits'>> & { locationId?: string; fromLocationId?: string; toLocationId?: string }
const DEMO_COINS: Coin[] = [
  { providerAssetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', imageUrl: null, marketCapRank: 1 },
  { providerAssetId: 'ethereum', symbol: 'ETH', name: 'Ethereum', imageUrl: null, marketCapRank: 2 },
  { providerAssetId: 'solana', symbol: 'SOL', name: 'Solana', imageUrl: null, marketCapRank: 5 },
  { providerAssetId: 'ripple', symbol: 'XRP', name: 'XRP', imageUrl: null, marketCapRank: 7 },
]
const DEMO_SUMMARY: Summary = { portfolioValue: '184392.54', costBasis: '155572.72', realizedPnl: '2430.11', unrealizedPnl: '26389.71', totalPnl: '28819.82', baseCurrency: 'PHP' }

function backendEnabled() { return import.meta.env.VITE_FINANCE_BACKEND === 'true' }

export function Crypto() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Coin[]>([])
  const [tracked, setTracked] = useState<Coin[]>(backendEnabled() ? [] : DEMO_COINS)
  const [summary, setSummary] = useState<Summary | null>(backendEnabled() ? null : DEMO_SUMMARY)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [locations, setLocations] = useState<Location[]>(backendEnabled() ? [] : [{ id: 'demo-binance', name: 'Binance', type: 'exchange' }, { id: 'demo-ledger', name: 'Ledger', type: 'wallet' }])
  const [transactionCoin, setTransactionCoin] = useState<Coin | null>(null)
  const [transactionPrefill, setTransactionPrefill] = useState<TransactionPrefill | undefined>()
  const [detailCoin, setDetailCoin] = useState<Coin | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'chart' | 'transactions'>('overview')
  const [activities, setActivities] = useState<Activity[]>([])
  const [activityType, setActivityType] = useState<'all' | 'buy' | 'sell' | 'transfer'>('all')
  const [activityQuery, setActivityQuery] = useState('')
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [historyRange, setHistoryRange] = useState('1m')

  useEffect(() => {
    if (!backendEnabled()) return
    const controller = new AbortController()
    void fetch('/api/v1/crypto', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { baseCurrency?: string; summary?: Omit<Summary, 'baseCurrency'>; coins?: Array<Coin & { market?: Partial<Coin> | null }>; marketStatus?: { stale?: boolean } }
        if (!response.ok) throw new Error('Could not load your crypto portfolio.')
        setTracked((body.coins ?? []).map((coin) => ({ ...coin, imageUrl: coin.imageUrl ?? coin.market?.imageUrl ?? null, marketCapRank: coin.marketCapRank ?? coin.market?.marketCapRank ?? null })))
        if (body.summary && body.baseCurrency) setSummary({ ...body.summary, baseCurrency: body.baseCurrency })
        if (body.marketStatus?.stale) setMessage('Market prices are temporarily unavailable. Your tracked coins are still available.')
      })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not load your crypto portfolio.') })
    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    if (!backendEnabled()) return
    const controller = new AbortController()
    void fetch('/api/v1/crypto/locations', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { locations?: Location[] }
        if (!response.ok) throw new Error('Could not load crypto locations.')
        setLocations(body.locations ?? [])
      }).catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not load crypto locations.') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!backendEnabled() || !query.trim()) { setResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(`/api/v1/crypto/search?q=${encodeURIComponent(query)}`, { credentials: 'include', signal: controller.signal })
        const body = await response.json() as { coins?: Coin[]; error?: { message?: string } }
        if (!response.ok) throw new Error(body.error?.message ?? 'Could not search crypto right now.')
        setResults(body.coins ?? [])
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not search crypto right now.') }
      finally { if (!controller.signal.aborted) setSearching(false) }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query])

  useEffect(() => {
    if (!backendEnabled() || activeTab !== 'transactions') return
    const controller = new AbortController()
    void fetch(`/api/v1/crypto/activities?type=${activityType}&q=${encodeURIComponent(activityQuery)}`, { credentials: 'include', signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { activities?: Activity[] }
      if (!response.ok) throw new Error('Could not load crypto transactions.')
      setActivities(body.activities ?? [])
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not load crypto transactions.') })
    return () => controller.abort()
  }, [activeTab, refreshKey, activityType, activityQuery])

  useEffect(() => {
    if (!backendEnabled() || activeTab !== 'chart') return
    const controller = new AbortController()
    void fetch(`/api/v1/crypto/history?range=${historyRange}`, { credentials: 'include', signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { points?: HistoryPoint[]; error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not load portfolio history.')
      setHistory(body.points ?? [])
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not load portfolio history.') })
    return () => controller.abort()
  }, [activeTab, historyRange])

  const visibleCoins = useMemo(() => query.trim() ? results : tracked, [query, results, tracked])
  async function track(coin: Coin) {
    if (!coin.providerAssetId) { setMessage('This legacy coin needs a CoinGecko market-data link before it can be re-tracked.'); return }
    if (!backendEnabled()) { setTracked((current) => current.some((item) => item.providerAssetId === coin.providerAssetId) ? current : [...current, coin]); setMessage(`${coin.name} is now tracked.`); return }
    const response = await fetch('/api/v1/crypto/coins', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ providerAssetId: coin.providerAssetId }) })
    const body = await response.json() as { coin?: { instrumentId: string }; error?: { message?: string } }
    if (!response.ok) { setMessage(body.error?.message ?? 'Could not track this coin.'); return }
    setTracked((current) => current.some((item) => item.providerAssetId === coin.providerAssetId) ? current : [...current, { ...coin, instrumentId: body.coin?.instrumentId }])
    setQuery(''); setResults([]); setMessage(`${coin.name} is now tracked.`)
  }
  async function deleteActivity(activity: Activity) {
    if (!window.confirm(`Delete this ${activity.type} record for ${activity.symbol}?`)) return
    if (!backendEnabled()) { setActivities((current) => current.filter((item) => item.id !== activity.id)); setMessage(`${activity.symbol} ${activity.type} removed from mock activity.`); return }
    const resource = activity.type === 'transfer' ? 'transfers' : 'trades'
    const response = await fetch(`/api/v1/crypto/${resource}/${activity.id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) { const body = await response.json() as { error?: { message?: string } }; setMessage(body.error?.message ?? 'Could not delete this transaction.'); return }
    setActivities((current) => current.filter((item) => item.id !== activity.id)); setRefreshKey((key) => key + 1); setMessage(`${activity.symbol} ${activity.type} deleted.`)
  }

  return <section className="crypto-page" aria-labelledby="crypto-title">
    <header className="crypto-header">
      <div><p className="eyebrow">Investments</p><h1 id="crypto-title">Crypto Portfolio</h1><p className="crypto-subtitle">Track what you hold. Monikey never sends an order to an exchange.</p>{summary && <div className="crypto-balance"><strong>{formatMoney(summary.portfolioValue, summary.baseCurrency)}</strong>{summary.change24h !== undefined && <span className={Number(summary.change24h) >= 0 ? 'positive' : 'negative'}>{Number(summary.change24h) >= 0 ? '+' : ''}{formatMoney(summary.change24h, summary.baseCurrency)} {summary.change24hPct ? `(${Number(summary.change24hPct).toFixed(2)}%) ` : ''}24h</span>}<span className={Number(summary.totalPnl) >= 0 ? 'positive' : 'negative'}>{Number(summary.totalPnl) >= 0 ? '+' : ''}{formatMoney(summary.totalPnl, summary.baseCurrency)} all time</span></div>}</div>
      <label className="crypto-search"><span className="sr-only">Search crypto</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search and add a coin" /></label>
    </header>
    {message && <p className="crypto-status" role="status">{message}</p>}
    <div className="crypto-tabs" role="tablist" aria-label="Crypto portfolio views"><button type="button" role="tab" aria-selected={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</button><button type="button" role="tab" aria-selected={activeTab === 'chart'} onClick={() => setActiveTab('chart')}>Chart</button><button type="button" role="tab" aria-selected={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')}>Transactions</button></div>
    {activeTab === 'overview' ? <section className="crypto-empty" aria-live="polite">
      <h2>{query.trim() ? (searching ? 'Searching CoinGecko…' : 'Search results') : tracked.length ? 'My Coins' : 'Your crypto portfolio is empty'}</h2>
      {!query.trim() && tracked.length === 0 && <p>Track coins and record transactions to see your holdings and performance.</p>}
      <div className="crypto-coins">
        {visibleCoins.map((coin) => <article className="crypto-coin" key={coin.providerAssetId}>
          <div className="crypto-avatar" aria-hidden="true">{coin.symbol.slice(0, 1)}</div><div><button type="button" className="crypto-coin-open" onClick={() => setDetailCoin(coin)}>{coin.name}</button><span>{coin.symbol}{coin.marketCapRank ? ` · #${coin.marketCapRank}` : ''}{coin.currentPrice ? ` · ${formatMoney(coin.currentPrice, summary?.baseCurrency ?? 'PHP')}` : ''}</span>{coin.quantity && <small>{coin.quantity} {coin.symbol} · {coin.marketValue ? formatMoney(coin.marketValue, summary?.baseCurrency ?? 'PHP') : 'Price unavailable'}</small>}</div>
          {tracked.some((item) => item.providerAssetId === coin.providerAssetId)
            ? <button type="button" className="btn btn--primary btn--compact" onClick={() => setTransactionCoin(tracked.find((item) => item.providerAssetId === coin.providerAssetId) ?? coin)}>Add Transaction</button>
            : <button type="button" className="btn btn--primary btn--compact" onClick={() => void track(coin)} disabled={coin.providerAssetId === null}>Add Coin</button>}
        </article>)}
      </div>
      {!query.trim() && tracked.some((coin) => coin.allocationPct && Number(coin.allocationPct) > 0) && <section className="crypto-allocation" aria-labelledby="crypto-allocation-title"><h3 id="crypto-allocation-title">Portfolio Allocation</h3>{tracked.filter((coin) => coin.allocationPct && Number(coin.allocationPct) > 0).map((coin) => <div key={coin.providerAssetId} className="crypto-allocation-row"><span>{coin.symbol}</span><div aria-hidden="true"><i style={{ width: `${Math.min(100, Number(coin.allocationPct))}%` }} /></div><strong>{Number(coin.allocationPct).toFixed(1)}%</strong></div>)}</section>}
    </section> : activeTab === 'chart' ? <section className="crypto-empty crypto-chart"><div className="crypto-chart-head"><h2>Portfolio History</h2><div role="group" aria-label="Portfolio history range">{(['1d', '7d', '1m', '3m', '1y', 'all'] as const).map((range) => <button key={range} type="button" className={historyRange === range ? 'active' : ''} onClick={() => setHistoryRange(range)}>{range.toUpperCase()}</button>)}</div></div>{backendEnabled() ? <PortfolioChart points={history} currency={summary?.baseCurrency ?? 'PHP'} /> : <PortfolioChart points={[{ timestamp: '2026-09-01T00:00:00.000Z', valueAmount: '150000' }, { timestamp: '2026-09-05T00:00:00.000Z', valueAmount: '171000' }, { timestamp: '2026-09-09T00:00:00.000Z', valueAmount: '184392.54' }]} currency="PHP" />}</section> : <section className="crypto-empty crypto-activity" aria-live="polite"><h2>Transactions</h2><div className="crypto-activity-controls"><div role="group" aria-label="Transaction type filter">{(['all', 'buy', 'sell', 'transfer'] as const).map((type) => <button type="button" key={type} className={activityType === type ? 'active' : ''} onClick={() => setActivityType(type)}>{type[0]!.toUpperCase() + type.slice(1)}</button>)}</div><label><span className="sr-only">Search transactions</span><input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Search transactions" /></label></div>{activities.length === 0 ? <p>No crypto transactions have been recorded yet.</p> : <div className="crypto-activity-list">{activities.map((activity) => <article key={activity.id}><div><strong>{activity.type.toUpperCase()} · {activity.name}</strong><span>{activity.units} {activity.symbol} · {activity.occurredOn}{activity.occurredTime ? ` ${activity.occurredTime}` : ''}</span></div><div>{activity.type === 'transfer' ? <span>{activity.fromLocation} → {activity.toLocation}{activity.networkFeeUnits !== '0' ? ` · Fee ${activity.networkFeeUnits} ${activity.symbol}` : ''}</span> : <span>{activity.location ?? 'No location'} · {activity.priceAmount} {activity.currencyCode}</span>}<button type="button" className="crypto-text-action" onClick={() => void deleteActivity(activity)}>Delete</button></div></article>)}</div>}</section>}
    {transactionCoin && <CryptoTransactionDialog coin={transactionCoin} prefill={transactionPrefill} locations={locations} baseCurrency={summary?.baseCurrency ?? 'PHP'} onClose={() => { setTransactionCoin(null); setTransactionPrefill(undefined) }} onMessage={setMessage} onLocations={setLocations} onRefresh={() => setRefreshKey((key) => key + 1)} />}
    {detailCoin && <CryptoCoinDetail coin={detailCoin} baseCurrency={summary?.baseCurrency ?? 'PHP'} onClose={() => setDetailCoin(null)} onAddTransaction={() => { setTransactionCoin(detailCoin); setDetailCoin(null) }} onRemove={async () => {
      if (!detailCoin.instrumentId || !window.confirm(`Remove ${detailCoin.name} from My Coins? Its transaction history will remain.`)) return
      if (!backendEnabled()) { setTracked((current) => current.filter((coin) => coin.providerAssetId !== detailCoin.providerAssetId)); setDetailCoin(null); return }
      const response = await fetch(`/api/v1/crypto/coins/${detailCoin.instrumentId}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) { setMessage('Could not remove this coin.'); return }
      setDetailCoin(null); setRefreshKey((key) => key + 1); setMessage(`${detailCoin.name} was removed from My Coins. Its history was retained.`)
    }} />}
  </section>
}

function PortfolioChart({ points, currency }: { points: HistoryPoint[]; currency: string }) {
  if (points.length === 0) return <p>No portfolio history is available for this range yet.</p>
  const values = points.map((point) => Number(point.valueAmount)); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1
  const polyline = points.map((point, index) => `${(index / Math.max(1, points.length - 1)) * 100},${100 - ((Number(point.valueAmount) - min) / span) * 100}`).join(' ')
  return <><svg className="crypto-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Portfolio value changed from ${formatMoney(points[0]!.valueAmount, currency)} to ${formatMoney(points.at(-1)!.valueAmount, currency)} over the selected range`}><polyline points={polyline} fill="none" stroke="var(--cyan)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><p>{formatMoney(points.at(-1)!.valueAmount, currency)} · {points.length} valuation points</p></>
}

function CryptoCoinDetail({ coin, baseCurrency, onClose, onAddTransaction, onRemove }: { coin: Coin; baseCurrency: string; onClose: () => void; onAddTransaction: () => void; onRemove: () => void | Promise<void> }) {
  const [whereHeld, setWhereHeld] = useState<Array<{ locationId: string; name: string; type: string; units: string }>>([])
  const [coinActivities, setCoinActivities] = useState<Activity[]>([])
  const [coinHistory, setCoinHistory] = useState<HistoryPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  useEffect(() => {
    if (!backendEnabled() || !coin.instrumentId) { setWhereHeld([{ locationId: 'demo-binance', name: 'Binance', type: 'exchange', units: coin.quantity ?? '0' }]); return }
    const controller = new AbortController()
    void fetch(`/api/v1/crypto/coins/${coin.instrumentId}`, { credentials: 'include', signal: controller.signal }).then(async (response) => { const body = await response.json() as { coin?: { whereHeld?: typeof whereHeld }; error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? 'Could not load location balances.'); setWhereHeld(body.coin?.whereHeld ?? []) }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load location balances.') })
    return () => controller.abort()
  }, [coin.instrumentId, coin.quantity])
  useEffect(() => {
    if (!backendEnabled() || !coin.instrumentId) return
    const controller = new AbortController()
    void fetch(`/api/v1/crypto/activities?instrumentId=${encodeURIComponent(coin.instrumentId)}`, { credentials: 'include', signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { activities?: Activity[] }
      if (!response.ok) throw new Error('Could not load coin transaction history.')
      setCoinActivities(body.activities ?? [])
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load coin transaction history.') })
    return () => controller.abort()
  }, [coin.instrumentId])
  useEffect(() => {
    if (!backendEnabled() || !coin.instrumentId) return
    const controller = new AbortController()
    void fetch(`/api/v1/crypto/coins/${coin.instrumentId}/history?range=1m`, { credentials: 'include', signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { points?: HistoryPoint[] }
      if (!response.ok) throw new Error('Could not load coin price history.')
      setCoinHistory(body.points ?? [])
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load coin price history.') })
    return () => controller.abort()
  }, [coin.instrumentId])
  return <div className="crypto-dialog-backdrop" role="presentation"><aside className="crypto-detail" role="dialog" aria-modal="true" aria-labelledby="crypto-detail-title"><header><div><h2 id="crypto-detail-title">{coin.name}</h2><p>{coin.symbol}{coin.currentPrice ? ` · ${formatMoney(coin.currentPrice, baseCurrency)}` : ''}</p></div><button className="icon-btn" type="button" aria-label="Close coin detail" onClick={onClose}>×</button></header><div className="crypto-detail-metrics"><Metric label="Your holding" value={coin.marketValue ? formatMoney(coin.marketValue, baseCurrency) : '—'} detail={coin.quantity ? `${coin.quantity} ${coin.symbol}` : undefined} /><Metric label="Average cost" value={coin.averageCost ? formatMoney(coin.averageCost, baseCurrency) : '—'} /><Metric label="Cost basis" value={coin.costBasis ? formatMoney(coin.costBasis, baseCurrency) : '—'} /><Metric label="Unrealized" value={coin.unrealizedPnl ? formatMoney(coin.unrealizedPnl, baseCurrency) : '—'} /><Metric label="Realized" value={coin.realizedPnl ? formatMoney(coin.realizedPnl, baseCurrency) : '—'} /></div><section><h3>Price history</h3>{backendEnabled() ? <PortfolioChart points={coinHistory} currency={baseCurrency} /> : <PortfolioChart points={[{ timestamp: '2026-09-01T00:00:00.000Z', valueAmount: coin.currentPrice ?? '0' }, { timestamp: '2026-09-09T00:00:00.000Z', valueAmount: coin.currentPrice ?? '0' }]} currency={baseCurrency} />}</section><section><h3>Where held</h3>{error ? <p role="alert" className="crypto-error">{error}</p> : whereHeld.length ? <ul className="crypto-held-list">{whereHeld.map((location) => <li key={location.locationId}><span>{location.name}<small>{location.type}</small></span><strong>{location.units} {coin.symbol}</strong></li>)}</ul> : <p>No location balance is recorded.</p>}</section><section><h3>Transaction history</h3>{coinActivities.length ? <ul className="crypto-held-list">{coinActivities.map((activity) => <li key={activity.id}><span>{activity.type.toUpperCase()}<small>{activity.occurredOn}</small></span><strong>{activity.units} {coin.symbol}</strong></li>)}</ul> : <p>No transactions recorded.</p>}</section><div className="crypto-detail-actions"><button type="button" className="btn btn--primary" onClick={onAddTransaction}>Add Transaction</button><button type="button" className="crypto-text-action" onClick={() => void onRemove()}>Remove coin</button></div></aside></div>
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div> }

function CryptoTransactionDialog({ coin, prefill, locations, baseCurrency, onClose, onMessage, onLocations, onRefresh }: { coin: Coin; prefill?: TransactionPrefill; locations: Location[]; baseCurrency: string; onClose: () => void; onMessage: (message: string) => void; onLocations: (locations: Location[]) => void; onRefresh: () => void }) {
  const [kind, setKind] = useState<'buy' | 'sell' | 'transfer'>('buy')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLocation, setShowLocation] = useState(false)
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const draft = { name: String(data.get('name') ?? ''), type: String(data.get('type') ?? 'exchange') as Location['type'] }
    if (!backendEnabled()) { onLocations([...locations, { id: `demo-${draft.name}`, ...draft }]); setShowLocation(false); return }
    const response = await fetch('/api/v1/crypto/locations', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) }); const body = await response.json() as { location?: Location; error?: { message?: string } }
    if (!response.ok || !body.location) { setError(body.error?.message ?? 'Could not add this location.'); return }; onLocations([...locations, body.location]); setShowLocation(false)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); const data = new FormData(event.currentTarget); const units = String(data.get('units') || prefill?.units || ''); const locationId = String(data.get('locationId') || prefill?.locationId || '')
    if (!units || !locationId) { setError('Quantity and location are required.'); return }
    if (!backendEnabled()) { onMessage(`${coin.symbol} ${kind} recorded in mock mode. No order was sent.`); onClose(); return }
    if (!coin.instrumentId) { setError('Reload this tracked coin before recording a transaction.'); return }
    const payload = kind === 'transfer'
      ? { instrumentId: coin.instrumentId, fromLocationId: locationId, toLocationId: String(data.get('toLocationId') ?? ''), units, networkFeeUnits: String(data.get('networkFeeUnits') ?? '0'), occurredOn: String(data.get('occurredOn')), occurredTime: String(data.get('occurredTime') || '') || null, note: String(data.get('note') || '') || null }
      : { instrumentId: coin.instrumentId, type: kind, units, priceAmount: String(data.get('priceAmount') || prefill?.priceAmount || ''), feeAmount: String(data.get('feeAmount') || prefill?.feeAmount || '0'), currencyCode: baseCurrency, locationId, occurredOn: String(data.get('occurredOn') || prefill?.occurredOn || ''), occurredTime: String(data.get('occurredTime') || prefill?.occurredTime || '') || null, note: String(data.get('note') || prefill?.note || '') || null }
    setPending(true)
    try { const response = await fetch(`/api/v1/crypto/${kind === 'transfer' ? 'transfers' : 'trades'}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const body = await response.json() as { error?: { message?: string } }; if (!response.ok) throw new Error(body.error?.message ?? 'Could not record this transaction.'); onMessage(`${coin.symbol} ${kind} recorded. No order was sent.`); onRefresh(); onClose() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record this transaction.') } finally { setPending(false) }
  }
  const calculateQuantityFromAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const form = event.currentTarget.form
    const price = form?.elements.namedItem('priceAmount') as HTMLInputElement | null
    const quantity = form?.elements.namedItem('units') as HTMLInputElement | null
    if (!price || !quantity || Number(event.currentTarget.value) <= 0 || Number(price.value) <= 0) return
    quantity.value = (Number(event.currentTarget.value) / Number(price.value)).toFixed(18).replace(/0+$/, '').replace(/\.$/, '')
  }
  return <div className="crypto-dialog-backdrop" role="presentation"><section className="crypto-dialog" role="dialog" aria-modal="true" aria-labelledby="crypto-transaction-title"><header><div><h2 id="crypto-transaction-title">{coin.name}</h2><p>{coin.symbol} · Tracking only</p></div><button type="button" className="icon-btn" aria-label="Close transaction dialog" onClick={onClose}>×</button></header><div className="crypto-kind" role="tablist" aria-label="Transaction type">{(['buy', 'sell', 'transfer'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={kind === value} onClick={() => setKind(value)}>{value.toUpperCase()}</button>)}</div>{locations.length === 0 || showLocation ? <form className="crypto-form" onSubmit={addLocation}><p>Create an exchange or wallet location before recording activity.</p><label>Name<input name="name" required maxLength={120} placeholder="Binance or Ledger" /></label><label>Type<select name="type"><option value="exchange">Exchange</option><option value="wallet">Wallet</option><option value="other">Other</option></select></label><button className="btn btn--primary" type="submit">Add Location</button></form> : <form className="crypto-form" onSubmit={submit}><label>Quantity<input name="units" inputMode="decimal" required placeholder={`0.001 ${coin.symbol}`} /></label>{kind !== 'transfer' && <><label>Price per {coin.symbol}<input name="priceAmount" inputMode="decimal" required placeholder={`0.00 ${baseCurrency}`} /></label><label>I spent / received ({baseCurrency})<input inputMode="decimal" onChange={calculateQuantityFromAmount} placeholder="Amount-first calculator" /></label><small>Enter an amount and price to calculate up to 18 decimal places of {coin.symbol}.</small><label>Fee<input name="feeAmount" inputMode="decimal" defaultValue="0" /></label></>}<label>{kind === 'transfer' ? 'From location' : 'Location'}<select name="locationId" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>{kind === 'transfer' && <><label>To location<select name="toLocationId" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Network fee ({coin.symbol})<input name="networkFeeUnits" inputMode="decimal" defaultValue="0" /></label></>}<label>Date<input name="occurredOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Time<input name="occurredTime" type="time" /></label><label>Notes<textarea name="note" maxLength={500} /></label><button type="button" className="btn btn--ghost" onClick={() => setShowLocation(true)}>Add another location</button>{error && <p className="crypto-error" role="alert">{error}</p>}<button className="btn btn--primary" type="submit" disabled={pending}>{pending ? 'Recording…' : `Record ${kind}`}</button></form>}</section></div>
}

export function formatMoney(value: string, currency: string) {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return `${currency} ${value}`
  const negative = match[1] === '-'
  const whole = match[2]!
  const fraction = (match[3] ?? '').padEnd(2, '0').slice(0, 2)
  const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(0)
  const currencyPart = parts.find((part) => part.type === 'currency')?.value ?? currency
  const decimal = new Intl.NumberFormat(undefined).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.'
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${currencyPart}${grouped}${decimal}${fraction}`
}
