import type { ReactNode } from 'react'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { cn } from 'cn'

/*
 * A short message inside a form. "warning" never blocks anything (it says what will happen);
 * "error" is announced at once (role="alert"). Both carry an icon, so colour is never the only cue.
 */
const tones = {
  warning: { box: 'bg-warning-soft text-warning-ink', Icon: TriangleAlert },
  error: { box: 'bg-error-soft text-error-ink', Icon: CircleAlert },
} as const

export function InlineNotice({
  tone,
  children,
  className,
}: {
  tone: keyof typeof tones
  children: ReactNode
  className?: string
}) {
  const { box, Icon } = tones[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('flex items-start gap-2 rounded-control px-3.5 py-3 text-sm leading-snug', box, className)}
    >
      <Icon aria-hidden="true" className="mt-px size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
