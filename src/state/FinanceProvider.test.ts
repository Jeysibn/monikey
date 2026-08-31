import { describe, expect, it } from 'vitest'
import { createReducer } from './FinanceProvider'
import type { FinanceState } from '../domain/finance'

// SR-005 correction: the reducer is now a trivial `SET_STATE` installer with
// no repository calls of its own, so it can never throw mid-dispatch — the
// repository call (and any validation throw) happens in the `useCallback`s
// in FinanceProvider.tsx, on the *caller's* stack, before `dispatch` is ever
// invoked. This test only proves the reducer itself is pure and inert; the
// real regression coverage (stale-closure fix + catchable validation errors
// through the actual provider wiring) lives in FinanceProvider.wiring.test.tsx.
describe('FinanceProvider reducer — SET_STATE', () => {
  it('replaces state wholesale and cannot throw', () => {
    const reducer = createReducer()
    const initial = { transactions: [] } as unknown as FinanceState
    const next = { transactions: [{ id: 't1' }] } as unknown as FinanceState

    expect(reducer(initial, { type: 'SET_STATE', state: next })).toBe(next)
  })

  it('ignores unknown action types and returns state unchanged', () => {
    const reducer = createReducer()
    const initial = { transactions: [] } as unknown as FinanceState

    // @ts-expect-error deliberately exercising the default branch
    expect(reducer(initial, { type: 'NOPE' })).toBe(initial)
  })
})
