// TR-006: the finance state container, in a plain non-component module.
//
// Two behaviors have to hold at once, and they are what shaped this:
//
// 1. A repository validation error must be synchronously catchable by the
//    form that triggered the mutation. So the repository call happens on the
//    caller's own stack, inside `run` below — nothing is routed through
//    React's dispatch machinery, where a throw would surface as an uncaught
//    error and unmount the tree instead of landing in the caller's
//    `try/catch`.
// 2. Two mutations issued back-to-back, before React has re-rendered, must
//    both apply — the second has to see the first one's result, not a stale
//    render-time snapshot.
//
// The previous implementation got (2) by reading and writing a ref DURING
// render, which React tooling flags (`react(refs)`) and which is genuinely
// unsafe under concurrent rendering. This is the React-safe replacement: an
// external store with `subscribe`/`getState`, consumed through
// `useSyncExternalStore`. The authoritative state lives in the store's own
// closure, so a mutation always reads the latest value without any
// render-phase ref access, and React is notified through the documented
// external-store contract.
//
// It also lives here, outside `FinanceProvider.tsx`, so that component
// module exports only its component (`react(only-export-components)`).

import type { FinanceState } from '../domain/finance'

export interface FinanceStore {
  getState(): FinanceState
  subscribe(listener: () => void): () => void
  /**
   * Runs one repository mutation against the store's current state and
   * installs the result. The mutation runs synchronously on the caller's
   * stack: if it throws, nothing is installed, no listener is notified, and
   * the error propagates to the caller unchanged — a rejected mutation
   * leaves the store's state completely untouched.
   */
  run<T>(mutate: (state: FinanceState) => { state: FinanceState; result: T }): T
}

export function createFinanceStore(initialState: FinanceState): FinanceStore {
  let state = initialState
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    run(mutate) {
      const { state: next, result } = mutate(state)
      state = next
      for (const listener of listeners) listener()
      return result
    },
  }
}
