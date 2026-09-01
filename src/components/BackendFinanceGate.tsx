import { useState, type FormEvent, type ReactNode } from 'react'
import { useAsyncFinance } from '../state/asyncFinanceContext'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { authenticate, logout as logoutRequest, type AuthMode } from '../services/apiAuth'
import { BackendAuthContext } from './BackendAuthContext'

function AuthScreen() {
  const { retry } = useAsyncFinance()
  const [mode, setMode] = useState<AuthMode>('register')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      await authenticate(mode, {
        email: String(fields.get('email') ?? ''),
        password: String(fields.get('password') ?? ''),
        displayName: mode === 'register' ? String(fields.get('displayName') ?? '') : undefined,
      })
      retry()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="app-loading" aria-labelledby="auth-title">
      <section className="auth-gate">
        <p className="eyebrow">Monikey</p>
        <h1 id="auth-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
        <p>{mode === 'register' ? 'Start securely syncing your finances in Monikey.' : 'Sign in to load your finances.'}</p>
        <div role="group" aria-label="Authentication mode">
          <button type="button" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(null) }}>Register</button>
          <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(null) }}>Sign in</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && <label>Display name<input name="displayName" autoComplete="name" required maxLength={120} /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required /></label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  )
}

export function BackendFinanceGate({ children }: { children: ReactNode }) {
  const { status, error, retry } = useAsyncFinance()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  async function logout() {
    setLogoutError(null)
    try {
      await logoutRequest()
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : 'Could not sign out.')
    } finally {
      retry()
    }
  }
  if (status === 'loading') return <main className="app-loading" aria-live="polite">Loading your finances…</main>
  if (status === 'error' && error instanceof FinanceApiError && (error.status === 401 || error.status === 403)) return <AuthScreen />
  if (status === 'error') return <main className="app-loading" role="alert"><p>We couldn’t load your finances.</p><button type="button" onClick={retry}>Retry</button>{error ? <small>{error.message}</small> : null}</main>
  return <BackendAuthContext.Provider value={{ logout }}><>{children}</>{logoutError && <p role="alert">{logoutError}</p>}</BackendAuthContext.Provider>
}
