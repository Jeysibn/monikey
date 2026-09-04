import { FinanceApiError } from './apiFinanceGateway'

export type AuthMode = 'register' | 'login'

export async function authenticate(mode: AuthMode, input: { email: string; password: string; displayName?: string }): Promise<void> {
  const response = await fetch(`/api/v1/auth/${mode}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mode === 'register'
      ? { email: input.email, password: input.password, displayName: input.displayName }
      : { email: input.email, password: input.password }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
    throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? 'Authentication failed.', payload?.error?.field)
  }
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok && response.status !== 401) {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
    throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? 'Could not sign out.', payload?.error?.field)
  }
}
