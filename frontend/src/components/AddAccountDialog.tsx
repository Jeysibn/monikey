import { useRef } from 'react'

import { AccountForm } from '@/components/AccountForm'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { AccountValues } from '@/lib/accountForm'
import type { LedgerSnapshot } from '@/types'

/*
 * Add account as a dialog (a bottom sheet on phones). Same closing rules as Quick Add: Escape and outside
 * clicks are ignored while saving, a click outside is ignored once something has been typed, Cancel and the
 * close button always work (except while saving). Focus goes to Name first.
 */
export function AddAccountDialog({
  initial,
  snapshot,
  onSubmit,
  onOpenChange,
  onClosed,
}: {
  initial: AccountValues | null // what the form starts with; null while the dialog is closed
  snapshot: LedgerSnapshot
  onSubmit: (values: AccountValues) => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed: (event: Event) => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const guard = useRef({ dirty: false, saving: false })

  return (
    <Dialog
      open={initial !== null}
      onOpenChange={(next) => {
        if (!next && guard.current.saving) return
        onOpenChange(next)
      }}
    >
      {initial && (
        <DialogContent
          onOpenAutoFocus={(e) => {
            guard.current = { dirty: false, saving: false }
            e.preventDefault()
            nameRef.current?.focus()
          }}
          onEscapeKeyDown={(e) => guard.current.saving && e.preventDefault()}
          onInteractOutside={(e) => (guard.current.saving || guard.current.dirty) && e.preventDefault()}
          onCloseAutoFocus={onClosed}
        >
          <AccountForm
            key={initial.type}
            snapshot={snapshot}
            initial={initial}
            nameRef={nameRef}
            onDirty={() => (guard.current.dirty = true)}
            onSavingChange={(saving) => (guard.current.saving = saving)}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
