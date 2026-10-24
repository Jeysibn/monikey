import { Banknote, Landmark, Smartphone, TriangleAlert, type LucideIcon } from 'lucide-react'

import { MoneyText } from '@/components/MoneyText'
import type { AccountBalance, LiquidAccountType } from '@/types'

/*
 * One cash, bank or e-wallet account: a plain icon, the name, its type in words, and the balance.
 * A balance below zero is shown as a negative amount (never clamped) with a words-and-icon flag, so the
 * warning does not depend on colour.
 */
const types: Record<LiquidAccountType, { Icon: LucideIcon; label: string }> = {
  cash: { Icon: Banknote, label: 'Cash' },
  bank: { Icon: Landmark, label: 'Bank account' },
  ewallet: { Icon: Smartphone, label: 'E-wallet' },
}

export function AccountRow({ item }: { item: AccountBalance }) {
  const { account, balance } = item
  const { Icon, label } = types[account.type]

  return (
    <li className="grid min-h-[68px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3.5 border-t border-rule py-2.5 first:border-t-0">
      <Icon aria-hidden="true" className="size-[22px] text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate text-base font-medium">{account.name}</div>
        <div className="text-sm text-muted-foreground">
          {label}
          {balance < 0 && (
            <span className="ml-1.5 inline-flex items-center gap-1 font-semibold text-warning-ink">
              <TriangleAlert aria-hidden="true" className="size-4" />
              Below zero
            </span>
          )}
        </div>
      </div>
      <MoneyText centavos={balance} className="text-lg font-semibold tracking-[-0.01em]" />
    </li>
  )
}
