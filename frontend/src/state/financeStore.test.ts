import { describe, expect, it, vi } from 'vitest'
import { createFinanceStore } from './financeStore'
import type { FinanceState } from '../domain/finance'

// TR-006: the store replaces the old render-phase `stateRef` synchronization.
// These tests pin the two properties that pattern existed to provide, now
// held by a plain external store with no React involved at all.
function stateWith(n: number): FinanceState {
  return { transactions: Array.from({ length: n }, (_, i) => ({ id: `t${i}` })) } as unknown as FinanceState
}

describe('createFinanceStore', () => {
  it('exposes the seeded state and installs a mutation result', () => {
    const store = createFinanceStore(stateWith(0))
    expect(store.getState().transactions).toHaveLength(0)

    const result = store.run((s) => ({ state: { ...s, transactions: [...s.transactions, { id: 'new' }] } as FinanceState, result: 'ok' }))
    expect(result).toBe('ok')
    expect(store.getState().transactions).toHaveLength(1)
  })

  it('gives each mutation the previous mutation’s result, not a stale snapshot', () => {
    const store = createFinanceStore(stateWith(0))
    const append = () =>
      store.run((s) => ({ state: { ...s, transactions: [...s.transactions, { id: 'x' }] } as FinanceState, result: s.transactions.length }))

    // Back-to-back, with no re-render (and no React) in between.
    expect(append()).toBe(0)
    expect(append()).toBe(1)
    expect(store.getState().transactions).toHaveLength(2)
  })

  it('propagates a mutation throw to the caller and leaves the state untouched', () => {
    const store = createFinanceStore(stateWith(3))
    const listener = vi.fn()
    store.subscribe(listener)

    expect(() =>
      store.run(() => {
        throw new Error('rejected by the repository')
      }),
    ).toThrow('rejected by the repository')

    expect(store.getState().transactions).toHaveLength(3)
    // A rejected mutation must not even notify subscribers.
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies subscribers on every successful mutation and stops after unsubscribe', () => {
    const store = createFinanceStore(stateWith(0))
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.run((s) => ({ state: s, result: undefined }))
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.run((s) => ({ state: s, result: undefined }))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
