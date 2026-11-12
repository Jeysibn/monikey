import { useRef, type ReactNode } from 'react'

import { ConfirmPanel } from '@/components/ConfirmPanel'
import { Dialog, DialogContent } from '@/components/ui/dialog'

/*
 * A ConfirmPanel in its own dialog, for confirmations that start from a list row (for example Archive).
 * Escape and outside clicks are ignored while the action is running. `onClosed` runs after the dialog has
 * closed, so the caller can put focus back on the control that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  tone,
  onConfirm,
  onOpenChange,
  onClosed,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  tone?: 'destructive' | 'default'
  onConfirm: () => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed?: (event: Event) => void
}) {
  const busy = useRef(false)
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || !busy.current) onOpenChange(next) }}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={() => (busy.current = false)} // a fresh opening is never busy (Cancel still takes focus)
        onEscapeKeyDown={(e) => busy.current && e.preventDefault()}
        onInteractOutside={(e) => busy.current && e.preventDefault()}
        onCloseAutoFocus={onClosed}
      >
        <ConfirmPanel
          title={title}
          confirmLabel={confirmLabel}
          busyLabel={busyLabel}
          tone={tone}
          onConfirm={onConfirm}
          onCancel={() => onOpenChange(false)}
          onBusyChange={(b) => (busy.current = b)}
        >
          {children}
        </ConfirmPanel>
      </DialogContent>
    </Dialog>
  )
}
