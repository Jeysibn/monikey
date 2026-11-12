import { useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InlineNotice } from '@/components/InlineNotice'
import { SLOW_SAVE_MS } from '@/lib/apiErrors'
import { useDelayedFlag } from '@/useDelayedFlag'

/*
 * The compact destructive-action confirmation (spec §8.2, class 2): a title that names the thing, one or two
 * sentences saying exactly what changes and what does not, Cancel (which has focus first, so Enter never
 * confirms by accident) and the confirming button. It is only the content: it sits inside a dialog, either
 * its own (ConfirmDialog) or swapped into another dialog's body so there is never a second dialog on top.
 * While working, both buttons are disabled and `onBusyChange` lets the parent ignore Escape and outside clicks.
 */
export function ConfirmPanel({
  title,
  children,
  confirmLabel,
  busyLabel,
  tone = 'destructive',
  onConfirm,
  onCancel,
  onBusyChange,
}: {
  title: string
  children: ReactNode // what will happen, and what will not
  confirmLabel: string
  busyLabel: string
  tone?: 'destructive' | 'default'
  onConfirm: () => Promise<void>
  onCancel: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slow = useDelayedFlag(busy, SLOW_SAVE_MS)

  const confirm = async () => {
    setError(null)
    setBusy(true)
    onBusyChange?.(true)
    try {
      await onConfirm()
      setBusy(false) // done: the parent normally closes now, but never leave the guard stuck on
      onBusyChange?.(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't finish. Nothing was changed. Try again.")
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <div aria-busy={busy} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">Confirm this change.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-3">
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          {slow && (
            <InlineNotice tone="warning">
              <span role="status">This is taking longer than usual. Keep this open.</span>
            </InlineNotice>
          )}
          <div className="grid gap-2 text-[0.9375rem] text-muted-foreground">{children}</div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" className="grow" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button type="button" variant={tone === 'destructive' ? 'destructive' : 'default'} className="grow-[1.4]" onClick={confirm} disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              {busyLabel}
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
