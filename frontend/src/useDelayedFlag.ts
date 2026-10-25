import { useEffect, useState } from 'react'

/**
 * True once `active` has been true for `ms` milliseconds without a break, false again as soon as it stops.
 * Used so a short wait shows nothing (no flicker) and a long one shows a notice ("Updating…", "taking longer than usual").
 */
export function useDelayedFlag(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setElapsed(true), ms)
    return () => {
      window.clearTimeout(timer)
      setElapsed(false)
    }
  }, [active, ms])
  return active && elapsed
}
