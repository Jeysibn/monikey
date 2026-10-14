import type { FinanceState } from './finance'

export const MAX_FAVORITES = 4

/** Selected favorite ids in rank order. Only active (non-archived) accounts exist in state, so archived ones can never appear. */
export function favoriteIds(state: FinanceState): string[] {
  return [...state.accounts, ...state.creditCards]
    .filter((a) => typeof a.favoriteRank === 'number')
    .sort((a, b) => a.favoriteRank! - b.favoriteRank!)
    .map((a) => a.id)
}

/** Applies a saved selection locally (after the server accepted it). Empty list = configured with nothing pinned. */
export function withFavorites(state: FinanceState, ids: string[]): FinanceState {
  const rank = (id: string) => { const i = ids.indexOf(id); return i === -1 ? null : i + 1 }
  return {
    ...state,
    favoritesConfigured: true,
    accounts: state.accounts.map((a) => ({ ...a, favoriteRank: rank(a.id) })),
    creditCards: state.creditCards.map((c) => ({ ...c, favoriteRank: rank(c.id) })),
  }
}
