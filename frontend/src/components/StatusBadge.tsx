import type { ReactNode } from 'react'
import type { BudgetStatus } from '../domain/finance'
import './StatusBadge.css'

const LABELS: Record<BudgetStatus, string> = {
  safe: 'Safe',
  on_track: 'On Track',
  near_limit: 'Near Limit',
  over_budget: 'Over Budget',
}

export function StatusBadge({ status }: { status: BudgetStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{LABELS[status]}</span>
}

export function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}
