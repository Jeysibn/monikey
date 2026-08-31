export type Quote = { ticker: string; priceMinor: number; source: string; fetchedAt: string; stale: boolean }

export interface QuoteProvider {
  getQuotes(tickers: string[]): Promise<Map<string, { priceMinor: number; source: string }>>
}

/** Deterministic default used by local/CI runs; no external quota is consumed. */
export class StubQuoteProvider implements QuoteProvider {
  async getQuotes(): Promise<Map<string, { priceMinor: number; source: string }>> { return new Map() }
}

export function isQuoteStale(fetchedAt: Date, now = new Date(), maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  return now.getTime() - fetchedAt.getTime() > maxAgeMs
}
