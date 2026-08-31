import type { ReactNode } from 'react'
import { useAsyncFinance } from '../state/asyncFinanceContext'

export function BackendFinanceGate({ children }: { children: ReactNode }) {
  const { status, error, retry } = useAsyncFinance()
  if (status === 'loading') return <main className="app-loading" aria-live="polite">Loading your finances…</main>
  if (status === 'error') return <main className="app-loading" role="alert"><p>We couldn’t load your finances.</p><button type="button" onClick={retry}>Retry</button>{error ? <small>{error.message}</small> : null}</main>
  return <>{children}</>
}
