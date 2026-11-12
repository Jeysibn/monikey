import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from 'cn'

import { Moki } from '@/components/Moki'
import { Button } from '@/components/ui/button'
import { loadFailureText } from '@/lib/apiErrors'
import { moveFocusTo } from '@/lib/focus'

/*
 * A block that could not load (UI_UX_SPEC sections 4-6): one plain sentence, when the figures on this screen last
 * arrived (if they ever did), and a Retry button. Only the block that failed shows this; the rest of the screen stays.
 * `what` completes "Couldn't load ___": "your summary", "activity", "accounts". `updatedAt` is the time of the
 * request that failed, never of another one.
 *
 * Retry removes this block at once (a new request starts), which would drop keyboard focus onto nothing, so the
 * button first moves focus to `focusAfter`: a selector for a stable heading nearby (a card title, or the page h1).
 * `live` is false for a second copy of the same failure on a screen, so a screen reader announces it only once.
 */
export function ErrorBlock({
  what,
  updatedAt,
  onRetry,
  focusAfter = 'main h1',
  live = true,
  mascot = false,
  className,
}: {
  what: string
  updatedAt: Date | null
  onRetry: () => void
  focusAfter?: string
  live?: boolean
  /** A whole page or large section that failed gets Moki; small inline blocks stay plain. */
  mascot?: boolean
  className?: string
}) {
  return (
    <div
      role={live ? 'alert' : undefined}
      className={cn('rounded-control border-[1.5px] border-dashed border-input p-[18px] text-center text-muted-foreground', mascot && 'sm:flex sm:items-center sm:justify-center sm:gap-5 sm:text-left', className)}
    >
      {mascot && <div className="mb-2 flex justify-center sm:mb-0 sm:shrink-0"><Moki pose="serverError" size="medium" /></div>}
      <div className="min-w-0">
        <p className={cn('flex items-start justify-center gap-2', mascot && 'sm:justify-start')}>
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{loadFailureText(what, updatedAt)}</span>
        </p>
        <div className="mt-3">
          <Button
            variant="secondary"
            aria-label={`Retry loading ${what}`}
            onClick={() => {
              moveFocusTo(focusAfter)
              onRetry()
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The same failure, small, for a single figure that could not load (a total next to rows that did).
 * Not a live region unless `live` is set: put it on exactly one copy of the same failure on a screen.
 */
export function InlineFailure({
  what,
  onRetry,
  focusAfter = 'main h1',
  live = false,
}: {
  what: string
  onRetry: () => void
  focusAfter?: string
  live?: boolean // announce it (set on exactly one copy per screen)
}) {
  return (
    <span role={live ? 'alert' : undefined} className="text-sm text-muted-foreground">
      Couldn&rsquo;t load {what}.{' '}
      <Button
        variant="link"
        className="min-h-11 align-baseline text-sm"
        aria-label={`Retry loading ${what}`}
        onClick={() => {
          moveFocusTo(focusAfter)
          onRetry()
        }}
      >
        Retry
      </Button>
    </span>
  )
}

/** A quiet "Updating…" that shows only after a short wait; the live region is always present so it is announced. */
export function UpdatingStamp({ show, className }: { show: boolean; className?: string }): ReactNode {
  return (
    <span role="status" aria-live="polite" className={cn('text-sm text-muted-foreground', className)}>
      {show ? 'Updating…' : ''}
    </span>
  )
}
