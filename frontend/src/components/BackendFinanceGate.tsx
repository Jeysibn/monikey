import { useState, type FormEvent, type ReactNode } from 'react'
import { useAsyncFinance } from '../state/asyncFinanceContext'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { authenticate, logout as logoutRequest, type AuthMode } from '../services/apiAuth'
import { BackendAuthContext } from './BackendAuthContext'
import './BackendFinanceGate.css'

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
    <main className="auth-gate-page" aria-labelledby="auth-title">
      <section className="auth-gate">
        <p className="eyebrow auth-gate__brand">Monikey</p>
        <h1 className="auth-gate__title" id="auth-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-gate__intro">{mode === 'register' ? 'Start securely syncing your finances in Monikey.' : 'Sign in to load your finances.'}</p>
        <div className="auth-gate__modes" role="group" aria-label="Authentication mode">
          <button className="auth-gate__mode" type="button" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(null) }}>Register</button>
          <button className="auth-gate__mode" type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(null) }}>Sign in</button>
        </div>
        <form className="auth-gate__form" onSubmit={submit}>
          {mode === 'register' && <label className="auth-gate__field">Display name<input className="auth-gate__input" name="displayName" autoComplete="name" required maxLength={120} /></label>}
          <label className="auth-gate__field">Email<input className="auth-gate__input" name="email" type="email" autoComplete="email" required /></label>
          <label className="auth-gate__field">Password<input className="auth-gate__input" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required /></label>
          {error && <p className="auth-gate__error" role="alert">{error}</p>}
          <button className="btn btn--primary auth-gate__submit" type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
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
