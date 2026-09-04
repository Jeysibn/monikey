import type { SettingsState } from '../domain/settings'
import { FinanceApiError } from './apiFinanceGateway'

type ApiSettings = {
  displayName: string
  email: string
  billDueReminders: boolean
  budgetNearLimitWarnings: boolean
  weeklySummaryEmail: boolean
  hideCents: boolean
}

export interface SettingsGateway {
  load(): Promise<SettingsState>
  save(settings: SettingsState): Promise<SettingsState>
}

export class ApiSettingsGateway implements SettingsGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.baseUrl = baseUrl
    this.fetcher = fetcher
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
      throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Monikey API request failed: ${response.status}`, payload?.error?.field)
    }
    return response.json() as Promise<T>
  }

  async load(): Promise<SettingsState> {
    return this.map(await this.request<ApiSettings>('/settings'))
  }

  async save(settings: SettingsState): Promise<SettingsState> {
    return this.map(await this.request<ApiSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ displayName: settings.profile.displayName, billDueReminders: settings.notifications.billDueReminders, budgetNearLimitWarnings: settings.notifications.budgetNearLimitWarnings, weeklySummaryEmail: settings.notifications.weeklySummaryEmail, hideCents: settings.display.hideCents }),
    }))
  }

  private map(value: ApiSettings): SettingsState {
    return { profile: { displayName: value.displayName, email: value.email }, notifications: { billDueReminders: value.billDueReminders, budgetNearLimitWarnings: value.budgetNearLimitWarnings, weeklySummaryEmail: value.weeklySummaryEmail }, display: { hideCents: value.hideCents } }
  }
}
