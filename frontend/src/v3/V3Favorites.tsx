import { useState } from 'react'
import { favoriteIds, MAX_FAVORITES } from '../domain/favorites'
import type { FinanceState } from '../domain/finance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'

export interface FavoriteControls {
  ids: string[]
  busy: boolean
  message: string | null
  error: string | null
  full: boolean
  toggle: (id: string, name: string) => void
  move: (id: string, name: string, delta: -1 | 1) => void
  nameOf: (id: string) => string
}

/** Persisted favorite selection (backend mode only). Every change replaces the whole ordered list on the server. */
export function useFavoriteControls(state: FinanceState): FavoriteControls | null {
  const asyncFinance = useAsyncFinanceOptional()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!asyncFinance) return null
  const ids = favoriteIds(state)
  const names = new Map([...state.accounts, ...state.creditCards].map((a) => [a.id, a.name]))

  async function save(next: string[], done: string) {
    setBusy(true); setError(null); setMessage(null)
    try { await asyncFinance!.setFavorites(next); setMessage(done) }
    catch (err) { setError(err instanceof Error ? `Could not save favorites: ${err.message}` : 'Could not save favorites.') }
    finally { setBusy(false) }
  }
  return {
    ids, busy, message, error, full: ids.length >= MAX_FAVORITES,
    nameOf: (id) => names.get(id) ?? 'Account',
    toggle: (id, name) => {
      if (busy) return
      if (ids.includes(id)) void save(ids.filter((x) => x !== id), `${name} removed from favorites.`)
      else if (ids.length < MAX_FAVORITES) void save([...ids, id], `${name} added to favorites.`)
    },
    move: (id, name, delta) => {
      const i = ids.indexOf(id)
      const j = i + delta
      if (busy || i < 0 || j < 0 || j >= ids.length) return
      const next = [...ids]; [next[i], next[j]] = [next[j]!, next[i]!]
      void save(next, `${name} moved to position ${j + 1}.`)
    },
  }
}

export function FavoritesPanel({ state, controls }: { state: FinanceState; controls: FavoriteControls }) {
  const { ids, busy, message, error, move, toggle, nameOf } = controls
  return (
    <section className="v3-card v3-fav-panel" aria-labelledby="v3-fav-title" data-testid="v3-fav-panel">
      <h2 id="v3-fav-title" className="v3-h2">Overview favorites</h2>
      <p className="v3-secondary">
        {ids.length} of {MAX_FAVORITES} selected. Favorites appear on Overview in this order.
        {!state.favoritesConfigured && ' You have not chosen any yet, so Overview shows suggested accounts.'}
      </p>
      {ids.length === 0
        ? <p className="v3-secondary" data-testid="v3-fav-empty">{state.favoritesConfigured ? 'No favorites. Overview shows none.' : 'Use “Add to favorites” on an account below.'}</p>
        : (
          <ol className="v3-fav-list" aria-label="Favorite accounts in Overview order">
            {ids.map((id, i) => {
              const name = nameOf(id)
              return (
                <li key={id} className="v3-fav-item">
                  <span className="v3-fav-item__name"><span className="v3-fav-rank" aria-hidden="true">{i + 1}</span>{name}</span>
                  <span className="v3-fav-item__actions">
                    <button type="button" className="v3-btn v3-btn--secondary" disabled={busy || i === 0} onClick={() => move(id, name, -1)} aria-label={`Move ${name} up, currently position ${i + 1} of ${ids.length}`}>Move up</button>
                    <button type="button" className="v3-btn v3-btn--secondary" disabled={busy || i === ids.length - 1} onClick={() => move(id, name, 1)} aria-label={`Move ${name} down, currently position ${i + 1} of ${ids.length}`}>Move down</button>
                    <button type="button" className="v3-btn v3-btn--secondary" disabled={busy} onClick={() => toggle(id, name)} aria-label={`Remove ${name} from favorites`}>Remove</button>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      <p role="status" aria-live="polite" className="v3-secondary v3-fav-status" data-testid="v3-fav-status">{busy ? 'Saving…' : message ?? ''}</p>
      {error && <p role="alert" className="v3-secondary v3-act-error">{error}</p>}
    </section>
  )
}

export function FavoriteToggle({ id, name, controls }: { id: string; name: string; controls: FavoriteControls }) {
  const rank = controls.ids.indexOf(id) + 1
  const selected = rank > 0
  const blocked = !selected && controls.full
  return (
    <button
      type="button"
      className={`v3-btn v3-btn--secondary v3-fav-toggle${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      disabled={controls.busy || blocked}
      onClick={() => controls.toggle(id, name)}
      aria-label={selected ? `${name} is favorite number ${rank}. Remove from favorites` : blocked ? `${name}: favorites are full (4 of 4). Remove one first` : `Add ${name} to favorites`}
    >
      {selected ? `★ Favorite ${rank}` : blocked ? '☆ Favorites full' : '☆ Add to favorites'}
    </button>
  )
}
