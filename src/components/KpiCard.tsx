import type { ReactNode } from 'react'
import { Card } from './Card'
import './KpiCard.css'

export function KpiCard({
  icon,
  label,
  value,
  delta,
  deltaTone = 'up',
  iconTone,
}: {
  icon: ReactNode
  label: string
  value: string
  delta?: string
  deltaTone?: 'up' | 'down' | 'neutral'
  iconTone?: string
}) {
  return (
    <Card className="kpi-card">
      <div className="kpi-icon" style={iconTone ? { color: iconTone } : undefined} aria-hidden="true">
        {icon}
      </div>
      <div className="kpi-body">
        <div className="eyebrow">{label}</div>
        <div className="kpi-value num">{value}</div>
        {delta && <div className={`kpi-delta kpi-delta--${deltaTone}`}>{delta}</div>}
      </div>
    </Card>
  )
}
