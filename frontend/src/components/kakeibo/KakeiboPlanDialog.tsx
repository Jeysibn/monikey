import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { InlineNotice } from '@/components/InlineNotice'
import { KakeiboPlanForm } from '@/components/kakeibo/KakeiboPlanForm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DataSource } from '@/dataSource'
import { monthLabel } from '@/lib/finance'
import { planValues } from '@/lib/kakeibo'
import type { KakeiboPlan, KakeiboPlanValues } from '@/types'

/*
 * Create or edit a month's plan. Like Edit account, the dialog reads the stored plan fresh when it opens
 * (GET /api/kakeibo/months/{month}), so it never edits figures that another tab has since changed. While that
 * read is on its way the dialog says so; if it fails, Try again reads it once more. Escape and outside clicks
 * are ignored while saving, and an outside click is ignored once something has been typed.
 */
type LoadState =
  | { month: string; status: 'loading' }
  | { month: string; status: 'error' }
  | { month: string; status: 'ready'; plan: KakeiboPlan | null }

export function KakeiboPlanDialog({
  month,
  source,
  onSubmit,
  onOpenChange,
  onClosed,
}: {
  month: string | null // null while closed
  source: DataSource
  onSubmit: (month: string, values: KakeiboPlanValues, existed: boolean) => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed: (event: Event) => void
}) {
  const [loadState, setLoadState] = useState<LoadState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const current = month !== null && loadState?.month === month ? loadState : null

  useEffect(() => {
    if (month === null) return
    const controller = new AbortController()
    source.loadKakeiboPlan(month, controller.signal).then(
      (plan) => setLoadState({ month, status: 'ready', plan }),
      () => {
        if (!controller.signal.aborted) setLoadState({ month, status: 'error' })
      },
    )
    return () => controller.abort()
  }, [month, attempt, source])

  useEffect(() => {
    if (current?.status === 'ready') firstRef.current?.focus()
  }, [current])

  return (
    <Dialog
      open={month !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onOpenChange(false)
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          setDirty(false)
          if (current?.status === 'ready') firstRef.current?.focus()
          else titleRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
        onInteractOutside={(event) => (saving || dirty) && event.preventDefault()}
        onCloseAutoFocus={onClosed}
      >
        {month !== null && current?.status === 'ready' ? (
          <KakeiboPlanForm
            key={month}
            month={month}
            mode={current.plan ? 'edit' : 'create'}
            initial={planValues(current.plan)}
            firstRef={firstRef}
            onDirty={() => setDirty(true)}
            onSavingChange={setSaving}
            onSubmit={(values) => onSubmit(month, values, current.plan !== null)}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle ref={titleRef} tabIndex={-1}>
                {month ? `${monthLabel(month)} plan` : 'Plan'}
              </DialogTitle>
              <DialogDescription className="sr-only">Load this month&rsquo;s plan to edit it.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {current?.status === 'error' ? (
                <InlineNotice tone="error">Couldn&rsquo;t load this month&rsquo;s plan. Check your connection and try again.</InlineNotice>
              ) : (
                <p role="status" aria-live="polite" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Loading the plan…
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" className="grow" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {current?.status === 'error' && month !== null && (
                <Button
                  type="button"
                  className="grow"
                  onClick={() => {
                    setLoadState({ month, status: 'loading' })
                    setAttempt((value) => value + 1)
                  }}
                >
                  Try again
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
