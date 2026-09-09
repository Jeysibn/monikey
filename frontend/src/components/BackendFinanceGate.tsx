import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useAsyncFinance } from '../state/asyncFinanceContext'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { authenticate, logout as logoutRequest, requestPasswordReset, resetPassword, type AuthMode } from '../services/apiAuth'
import { BackendAuthContext } from './BackendAuthContext'
import './BackendFinanceGate.css'

type ScreenMode = AuthMode | 'forgot' | 'reset'

/** A `?resetToken=` link (from the reset-password email) drops straight into reset mode, skipping register/login. */
function resetTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('resetToken')
}

function AuthScreen() {
  const { retry } = useAsyncFinance()
  const initialResetToken = useMemo(resetTokenFromUrl, [])
  const [mode, setMode] = useState<ScreenMode>(initialResetToken ? 'reset' : 'register')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchMode(next: ScreenMode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(String(fields.get('email') ?? ''))
        setNotice('If that email has an account, a reset link is on its way. Check your inbox.')
        return
      }
      if (mode === 'reset') {
        const password = String(fields.get('password') ?? '')
        const confirmPassword = String(fields.get('confirmPassword') ?? '')
        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          return
        }
        await resetPassword(initialResetToken ?? '', password)
        setNotice('Password reset. You can now sign in.')
        // Drop the token from the URL so a refresh/back-nav can't replay it.
        window.history.replaceState(null, '', window.location.pathname)
        switchMode('login')
        return
      }
      await authenticate(mode, {
        email: String(fields.get('email') ?? ''),
        password: String(fields.get('password') ?? ''),
        displayName: mode === 'register' ? String(fields.get('displayName') ?? '') : undefined,
      })
      retry()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  const titles: Record<ScreenMode, string> = {
    register: 'Create your account',
    login: 'Welcome back',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }
  const intros: Record<ScreenMode, string> = {
    register: 'Start securely syncing your finances in Monikey.',
    login: 'Sign in to load your finances.',
    forgot: "Enter your account email and we'll send you a link to reset your password.",
    reset: 'Enter a new password for your account.',
  }
  const submitLabels: Record<ScreenMode, string> = {
    register: 'Create account',
    login: 'Sign in',
    forgot: 'Send reset link',
    reset: 'Reset password',
  }

  return (
    <main className="auth-gate-page" aria-labelledby="auth-title">
      <section className="auth-gate">
        <p className="eyebrow auth-gate__brand">Monikey</p>
        <h1 className="auth-gate__title" id="auth-title">{titles[mode]}</h1>
        <p className="auth-gate__intro">{intros[mode]}</p>
        {(mode === 'register' || mode === 'login') && (
          <div className="auth-gate__modes" role="group" aria-label="Authentication mode">
            <button className="auth-gate__mode" type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>Register</button>
            <button className="auth-gate__mode" type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>Sign in</button>
          </div>
        )}
        <form className="auth-gate__form" onSubmit={submit}>
          {mode === 'register' && <label className="auth-gate__field">Display name<input className="auth-gate__input" name="displayName" autoComplete="name" required maxLength={120} /></label>}
          {(mode === 'register' || mode === 'login' || mode === 'forgot') && (
            <label className="auth-gate__field">Email<input className="auth-gate__input" name="email" type="email" autoComplete="email" required /></label>
          )}
          {(mode === 'register' || mode === 'login') && (
            <label className="auth-gate__field">Password<input className="auth-gate__input" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required /></label>
          )}
          {mode === 'reset' && (
            <>
              <label className="auth-gate__field">New password<input className="auth-gate__input" name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
              <label className="auth-gate__field">Confirm new password<input className="auth-gate__input" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
            </>
          )}
          {error && <p className="auth-gate__error" role="alert">{error}</p>}
          {notice && <p className="auth-gate__notice" role="status">{notice}</p>}
          <button className="btn btn--primary auth-gate__submit" type="submit" disabled={pending}>{pending ? 'Please wait…' : submitLabels[mode]}</button>
        </form>
        {mode === 'login' && (
          <button className="auth-gate__link" type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button className="auth-gate__link" type="button" onClick={() => switchMode('login')}>Back to sign in</button>
        )}
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
