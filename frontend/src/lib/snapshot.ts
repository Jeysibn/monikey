import type { AccountInfo, CardStatus, Centavos, LedgerSnapshot } from '../types.ts'

/*
 * Small lookups on a LedgerSnapshot (what the screens and forms read). Nothing here calculates money:
 * balances, owed, credit and available credit all come from the data source, which will be the API.
 */
export const accountById = (s: LedgerSnapshot, id: number | null): AccountInfo | undefined =>
  id === null ? undefined : s.accounts.find((a) => a.id === id)

export const liquidBalanceOf = (s: LedgerSnapshot, id: number | null): Centavos | undefined =>
  s.liquid.find((l) => l.account.id === id)?.balance

export const cardOf = (s: LedgerSnapshot, id: number | null): CardStatus | undefined =>
  s.cards.find((c) => c.account.id === id)
