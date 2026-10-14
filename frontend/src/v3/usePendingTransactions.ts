import { useEffect, useState } from 'react'
import { localFirstStore } from '../services/localFirstStore'

export const OUTBOX_CHANGED_EVENT = 'monikey:outbox-changed'

/** Counts offline-queued transactions that are not yet posted to the ledger (pending / syncing / failed / conflict). */
export function usePendingTransactions(): { waiting: number; needsAttention: number } {
  const [counts, setCounts] = useState({ waiting: 0, needsAttention: 0 })
  useEffect(() => {
    let alive = true
    const read = () => {
      void localFirstStore.outbox().then((ops) => {
        if (!alive) return
        const tx = ops.filter((o) => o.operationType === 'create_transaction')
        const next = { waiting: tx.filter((o) => o.status === 'pending' || o.status === 'syncing').length, needsAttention: tx.filter((o) => o.status === 'failed' || o.status === 'conflict').length }
        setCounts((c) => (c.waiting === next.waiting && c.needsAttention === next.needsAttention ? c : next))
      }).catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, 2000)
    window.addEventListener(OUTBOX_CHANGED_EVENT, read)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener(OUTBOX_CHANGED_EVENT, read) }
  }, [])
  return counts
}
