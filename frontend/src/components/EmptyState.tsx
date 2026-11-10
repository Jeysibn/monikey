import type { ReactNode } from 'react'
import { cn } from 'cn'

/* A section that has nothing to show keeps its frame and says so in one plain sentence. */
export function EmptyState({
  message,
  action,
  illustration,
  className,
}: {
  message: string
  action?: ReactNode
  illustration?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-control border-[1.5px] border-dashed border-input p-[18px] text-center text-muted-foreground',
        className,
      )}
    >
      {illustration && <div className="mb-2 flex justify-center">{illustration}</div>}
      <p>{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
