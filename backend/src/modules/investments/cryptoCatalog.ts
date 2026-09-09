/** Server-only CoinGecko catalog boundary. Provider URLs and keys never cross it. */
export type CryptoCatalogCoin = {
  providerAssetId: string
  symbol: string
  name: string
  imageUrl: string | null
  marketCapRank: number | null
}

export type CryptoMarketSnapshot = CryptoCatalogCoin & {
  currentPrice: string | null
  change1hPct: number | null
  change24hPct: number | null
  change7dPct: number | null
  fetchedAt: string
}

export type CryptoPricePoint = { timestamp: string; price: string }
export type CryptoHistoryRange = '1d' | '7d' | '1m' | '3m' | '1y' | 'all'
export type CryptoCatalogFetcher = (input: string, init?: RequestInit) => Promise<Response>
export type CryptoCatalogQuotaGate = () => Promise<boolean>

export class CryptoProviderUnavailableError extends Error {
  readonly code = 'CRYPTO_PROVIDER_UNAVAILABLE' as const
  constructor(message = 'Crypto market data is temporarily unavailable.') { super(message) }
}

type CacheEntry<T> = { value: T; expiresAt: number }

export class CoinGeckoCryptoCatalog {
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  constructor(
    private readonly apiKey?: string,
    private readonly baseUrl = 'https://api.coingecko.com/api/v3',
    private readonly fetcher: CryptoCatalogFetcher = fetch,
    private readonly now: () => number = Date.now,
    private readonly quotaGate?: CryptoCatalogQuotaGate,
  ) {}

  async searchCoins(query: string): Promise<CryptoCatalogCoin[]> {
    const normalized = query.trim()
    if (!normalized) return []
    return this.cached(`search:${normalized.toLowerCase()}`, 10 * 60_000, async () => {
      const body = await this.request('/search', { query: normalized }) as { coins?: Array<{ id?: string; symbol?: string; name?: string; large?: string | null; thumb?: string | null; market_cap_rank?: number | null }> }
      return (body.coins ?? []).flatMap((coin) => coin.id && coin.symbol && coin.name
        ? [{ providerAssetId: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name, imageUrl: coin.large ?? coin.thumb ?? null, marketCapRank: coin.market_cap_rank ?? null }]
        : [])
    })
  }

  async getMarkets(ids: string[], currency: string): Promise<CryptoMarketSnapshot[]> {
    const uniqueIds = [...new Set(ids.filter(Boolean))]
    if (uniqueIds.length === 0) return []
    const vsCurrency = currency.toLowerCase()
    return this.cached(`markets:${vsCurrency}:${uniqueIds.slice().sort().join(',')}`, 60_000, async () => {
      const body = await this.request('/coins/markets', {
        vs_currency: vsCurrency,
        ids: uniqueIds.join(','),
        price_change_percentage: '1h,24h,7d',
      }) as Array<{ id?: string; symbol?: string; name?: string; image?: string | null; market_cap_rank?: number | null; current_price?: number | null; price_change_percentage_1h_in_currency?: number | null; price_change_percentage_24h_in_currency?: number | null; price_change_percentage_7d_in_currency?: number | null }>
      const fetchedAt = new Date(this.now()).toISOString()
      return body.filter((coin) => coin.id && coin.symbol && coin.name).map((coin) => ({
        providerAssetId: coin.id!, symbol: coin.symbol!.toUpperCase(), name: coin.name!, imageUrl: coin.image ?? null,
        marketCapRank: coin.market_cap_rank ?? null, currentPrice: finiteDecimalString(coin.current_price),
        change1hPct: finiteNumber(coin.price_change_percentage_1h_in_currency),
        change24hPct: finiteNumber(coin.price_change_percentage_24h_in_currency),
        change7dPct: finiteNumber(coin.price_change_percentage_7d_in_currency), fetchedAt,
      }))
    })
  }

  async getHistory(id: string, currency: string, range: CryptoHistoryRange): Promise<CryptoPricePoint[]> {
    const days = ({ '1d': '1', '7d': '7', '1m': '30', '3m': '90', '1y': '365', all: 'max' } as const)[range]
    const ttl = range === '1d' ? 60_000 : range === '7d' ? 5 * 60_000 : 15 * 60_000
    return this.cached(`history:${id}:${currency.toLowerCase()}:${range}`, ttl, async () => {
      const body = await this.request(`/coins/${encodeURIComponent(id)}/market_chart`, { vs_currency: currency.toLowerCase(), days }) as { prices?: Array<[number, number]> }
      return (body.prices ?? []).filter(([timestamp, price]) => Number.isFinite(timestamp) && Number.isFinite(price)).map(([timestamp, price]) => ({ timestamp: new Date(timestamp).toISOString(), price: String(price) }))
    })
  }

  private async request(path: string, query: Record<string, string>): Promise<unknown> {
    if (this.quotaGate && !(await this.quotaGate())) throw new CryptoProviderUnavailableError('Crypto market-data quota is temporarily exhausted.')
    const url = new URL(path.replace(/^\//, ''), this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    let response: Response
    try { response = await this.fetcher(url.toString(), { headers: this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : {} }) }
    catch { throw new CryptoProviderUnavailableError() }
    if (!response.ok) throw new CryptoProviderUnavailableError(`CoinGecko returned ${response.status}.`)
    try { return await response.json() } catch { throw new CryptoProviderUnavailableError('CoinGecko returned an invalid response.') }
  }

  private async cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(key) as CacheEntry<T> | undefined
    if (existing && existing.expiresAt > this.now()) return existing.value
    const value = await load()
    this.cache.set(key, { value, expiresAt: this.now() + ttlMs })
    return value
  }
}

function finiteNumber(value: number | null | undefined): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function finiteDecimalString(value: number | null | undefined): string | null { return finiteNumber(value) === null ? null : String(value) }
