import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InlineNotice } from '@/components/InlineNotice'
import type { DeleteSummary } from '@/lib/entryText'

/*
 * "Are you sure?" for deleting one entry (UI_UX_SPEC section 10). It names the entry and says what
 * deleting changes, in the spec's words. Cancel has focus first, so Enter never deletes by accident.
 * Shown inside the same dialog as the edit form (no second dialog on top).
 */
export function DeleteConfirm({
  summary,
  onCancel,
  onConfirm,
  onSavingChange,
}: {
  summary: DeleteSummary
  onCancel: () => void
  onConfirm: () => Promise<void>
  onSavingChange: (saving: boolean) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setError(null)
    setDeleting(true)
    onSavingChange(true)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't delete. Nothing was changed. Try again.")
      setDeleting(false)
      onSavingChange(false)
    }
  }

  return (
    <div aria-busy={deleting} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{summary.title}</DialogTitle>
        <DialogDescription className="sr-only">Confirm deleting this entry.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-3.5">
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          <p className="text-base font-semibold">{summary.entry}</p>
          <p className="text-[0.9375rem] text-muted-foreground">{summary.effect}</p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" className="grow" onClick={onCancel} disabled={deleting} autoFocus>
          Cancel
        </Button>
        <Button type="button" variant="destructive" className="grow-[1.4]" onClick={confirm} disabled={deleting}>
          {deleting ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Deleting…
            </>
          ) : (
            summary.button
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
