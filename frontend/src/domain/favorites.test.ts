import { describe, expect, it } from 'vitest'
import { mockFinanceRepository } from '../services/mockFinanceRepository'
import { favoriteIds, withFavorites } from './favorites'

const state = mockFinanceRepository.getInitialState()

describe('favorites selection', () => {
  it('has no favorites before configuration', () => {
    expect(state.favoritesConfigured).toBeFalsy()
    expect(favoriteIds(state)).toEqual([])
  })
  it('applies an ordered selection across accounts and cards and marks it configured', () => {
    const [a, b] = state.accounts
    const card = state.creditCards[0]!
    const next = withFavorites(state, [card.id, b!.id, a!.id])
    expect(next.favoritesConfigured).toBe(true)
    expect(favoriteIds(next)).toEqual([card.id, b!.id, a!.id])
    expect(next.creditCards[0]!.favoriteRank).toBe(1)
  })
  it('an empty selection is configured with nothing pinned, and replaces earlier ranks', () => {
    const pinned = withFavorites(state, [state.accounts[0]!.id])
    const cleared = withFavorites(pinned, [])
    expect(cleared.favoritesConfigured).toBe(true)
    expect(favoriteIds(cleared)).toEqual([])
  })
})
