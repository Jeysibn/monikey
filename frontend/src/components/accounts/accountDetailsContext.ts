import { createContext } from 'react'

import type { ActivityItem } from '@/types'

/*
 * What the account details panel needs from the app, supplied once by App so the same panel works from the Accounts
 * grid, the Accounts list and the Overview deck. Every action is an existing flow (Quick Add on this account, the
 * transfer and card-payment forms, Edit account, Activity filtered to this account); the panel adds no new money
 * behavior. When no provider is present the panel still shows the account's figures, just without actions.
 */
export interface AccountDetailsServices {
  version: number // changes after a save, so the recent list refreshes
  loadRecent: (accountId: number, signal: AbortSignal) => Promise<ActivityItem[]>
  onAddExpense: (accountId: number) => void
  onAddIncome: (accountId: number) => void
  onTransfer: (accountId: number) => void
  onPayCard: (cardId: number) => void
  onEdit: (accountId: number, from: HTMLElement) => void
  onViewActivity: (accountId: number) => void
}

export const AccountDetailsContext = createContext<AccountDetailsServices | null>(null)
