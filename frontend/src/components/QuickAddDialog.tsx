import { useRef } from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { TransactionForm } from '@/components/TransactionForm'
import type { EntryValues } from '@/lib/entryForm'
import type { MockData } from '@/types'

/*
 * Quick Add as a dialog (a bottom sheet on phones, see ui/dialog.tsx). It mounts the form only while open,
 * so each opening starts fresh from `initial`. Focus goes to Amount first. Escape and clicks outside are
 * ignored while saving, and a click outside is ignored once something has been typed; Cancel and the
 * close button always work (except while saving). Focus returning to the opener is handled by `onClosed`.
 */
export function QuickAddDialog({
  data,
  initial,
  onSubmit,
  onOpenChange,
  onClosed,
}: {
  data: MockData
  initial: EntryValues | null // what the form starts with; null while the dialog is closed
  onSubmit: (values: EntryValues) => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed: (event: Event) => void
}) {
  const amountRef = useRef<HTMLInputElement>(null)
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
            amountRef.current?.focus()
          }}
          onEscapeKeyDown={(e) => guard.current.saving && e.preventDefault()}
          onInteractOutside={(e) => (guard.current.saving || guard.current.dirty) && e.preventDefault()}
          onCloseAutoFocus={onClosed}
        >
          <TransactionForm
            // a fresh form (and guard) for every opening
            key={`${initial.kind}-${initial.cardId}-${initial.accountId}`}
            data={data}
            initial={initial}
            amountRef={amountRef}
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
