import { FinanceApiError } from './apiFinanceGateway'

/** Transport-only gateway for the Crypto page. Domain mapping stays at the page boundary. */
export class CryptoApiGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.baseUrl = baseUrl
    this.fetcher = fetcher
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { signal })
  }

  async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: 'POST', signal, body: JSON.stringify(body) })
  }

  async delete<T = void>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', signal })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      credentials: 'include',
      ...init,
      headers: { ...(init.body !== undefined && { 'content-type': 'application/json' }), ...init.headers },
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
      throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Monikey API request failed: ${response.status}`, payload?.error?.field)
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
  }
}

export const cryptoApi = new CryptoApiGateway()
