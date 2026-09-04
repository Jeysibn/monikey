import type { CSSProperties, ReactNode } from 'react'
import './Card.css'

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  style,
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
  style?: CSSProperties
}) {
  return (
    <Tag className={`card ${className}`} style={style}>
      {children}
    </Tag>
  )
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-title">
      <span>{children}</span>
      {action}
    </div>
  )
}
