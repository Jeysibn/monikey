import { useEffect, useRef, useState } from 'react'

import { DeleteConfirm } from '@/components/DeleteConfirm'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { TransactionForm } from '@/components/TransactionForm'
import type { EntryValues } from '@/lib/entryForm'
import { deleteSummary } from '@/lib/entryText'
import type { EntryTarget, LedgerSnapshot } from '@/types'

/*
 * Quick Add, Edit and Delete in one dialog (a bottom sheet on phones, see ui/dialog.tsx). The content is
 * mounted only while a session is open, so each opening starts fresh. Focus goes to Amount first (or to
 * Cancel when the dialog opens straight on the delete confirmation). Escape and outside clicks are ignored
 * while saving or deleting, and a click outside is ignored once something has been typed; Cancel and the
 * close button always work (except while saving). Focus returning to the opener is handled by `onClosed`.
 * In edit mode "Delete" swaps the content for the confirmation; Cancel there goes back to the form with
 * everything still typed (the form stays mounted, only hidden).
 */
export interface EntrySession {
  mode: 'add' | 'edit'
  values: EntryValues
  target?: EntryTarget // edit only
  confirmFirst?: boolean // open on the delete confirmation (the desktop row's Delete button)
}

function Body({
  session,
  snapshot,
  month,
  today,
  recentAccountId,
  recentPayFromId,
  amountRef,
  onDirty,
  onSavingChange,
  onSubmit,
  onDelete,
  onClose,
}: {
  session: EntrySession
  snapshot: LedgerSnapshot
  month: string
  today: string
  recentAccountId: number | null
  recentPayFromId: number | null
  amountRef: React.RefObject<HTMLInputElement | null>
  onDirty: () => void
  onSavingChange: (saving: boolean) => void
  onSubmit: (values: EntryValues, target?: EntryTarget) => Promise<void>
  onDelete: (target: EntryTarget) => Promise<void>
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(session.confirmFirst === true)
  const wasConfirming = useRef(confirming)
  const { target } = session
  const summary = target ? deleteSummary(snapshot, session.values, month) : null

  // Back from the confirmation: put focus on the form's Delete button, where the person was.
  useEffect(() => {
    if (wasConfirming.current && !confirming) document.getElementById('qa-delete')?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  return (
    <>
      <TransactionForm
        mode={session.mode}
        hidden={confirming}
        snapshot={snapshot}
        today={today}
        recentAccountId={recentAccountId}
        recentPayFromId={recentPayFromId}
        initial={session.values}
        amountRef={amountRef}
        onDirty={onDirty}
        onSavingChange={onSavingChange}
        onSubmit={(values) => onSubmit(values, target)}
        onCancel={onClose}
        onDeleteRequest={() => setConfirming(true)}
      />
      {confirming && target && summary && (
        <DeleteConfirm
          summary={summary}
          onCancel={() => (session.confirmFirst ? onClose() : setConfirming(false))}
          onConfirm={() => onDelete(target)}
          onSavingChange={onSavingChange}
        />
      )}
    </>
  )
}

export function QuickAddDialog({
  session,
  snapshot,
  month,
  today,
  recentAccountId,
  recentPayFromId,
  onSubmit,
  onDelete,
  onOpenChange,
  onClosed,
}: {
  session: EntrySession | null // null while the dialog is closed
  snapshot: LedgerSnapshot
  month: string // the month being viewed: the delete text only mentions "this month" for entries in it
  today: string // the Asia/Manila calendar date (the data source's), for the date shortcuts
  recentAccountId: number | null // the account used last, listed first in the account picker
  recentPayFromId: number | null // the same for "Pay from" on a card payment
  onSubmit: (values: EntryValues, target?: EntryTarget) => Promise<void>
  onDelete: (target: EntryTarget) => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed: (event: Event) => void
}) {
  const amountRef = useRef<HTMLInputElement>(null)
  const guard = useRef({ dirty: false, saving: false })

  return (
    <Dialog
      open={session !== null}
      onOpenChange={(next) => {
        if (!next && guard.current.saving) return
        onOpenChange(next)
      }}
    >
      {session && (
        <DialogContent
          size="wide"
          onOpenAutoFocus={(e) => {
            guard.current = { dirty: false, saving: false }
            if (session.confirmFirst) return // Cancel takes focus itself
            e.preventDefault()
            amountRef.current?.focus()
          }}
          // Escape inside an open account list closes only that list (the picker handles it).
          onEscapeKeyDown={(e) => (guard.current.saving || (e.target instanceof Element && e.target.closest('[data-account-picker][data-open]'))) && e.preventDefault()}
          onInteractOutside={(e) => (guard.current.saving || guard.current.dirty) && e.preventDefault()}
          onCloseAutoFocus={onClosed}
        >
          <Body
            // a fresh form (and confirmation) for every opening
            key={`${session.mode}-${session.target?.table}-${session.target?.id}-${session.confirmFirst}-${session.values.kind}-${session.values.cardId}-${session.values.accountId}`}
            session={session}
            snapshot={snapshot}
            month={month}
            today={today}
            recentAccountId={recentAccountId}
            recentPayFromId={recentPayFromId}
            amountRef={amountRef}
            onDirty={() => (guard.current.dirty = true)}
            onSavingChange={(saving) => (guard.current.saving = saving)}
            onSubmit={onSubmit}
            onDelete={onDelete}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
