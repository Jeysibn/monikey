import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { AccountForm } from '@/components/AccountForm'
import { InlineNotice } from '@/components/InlineNotice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DataSource } from '@/dataSource'
import type { AccountValues } from '@/lib/accountForm'
import type { LedgerSnapshot } from '@/types'

type LoadState =
  | { id: number; status: 'loading' }
  | { id: number; status: 'error' }
  | { id: number; status: 'ready'; values: AccountValues }

export function EditAccountDialog({
  accountId,
  source,
  snapshot,
  onSubmit,
  onOpenChange,
  onClosed,
}: {
  accountId: number | null
  source: DataSource
  snapshot: LedgerSnapshot
  onSubmit: (id: number, values: AccountValues) => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed: (event: Event) => void
}) {
  const [loadState, setLoadState] = useState<LoadState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const current = accountId !== null && loadState?.id === accountId ? loadState : null

  useEffect(() => {
    if (accountId === null) return
    const controller = new AbortController()
    source.loadAccountForEdit(accountId, controller.signal).then(
      (values) => setLoadState({ id: accountId, status: 'ready', values }),
      () => {
        if (!controller.signal.aborted) setLoadState({ id: accountId, status: 'error' })
      },
    )
    return () => controller.abort()
  }, [accountId, attempt, source])

  useEffect(() => {
    if (current?.status !== 'ready') return
    nameRef.current?.focus()
  }, [current])

  return (
    <Dialog
      open={accountId !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onOpenChange(false)
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (current?.status === 'ready') nameRef.current?.focus()
          else titleRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
        onInteractOutside={(event) => (saving || dirty) && event.preventDefault()}
        onCloseAutoFocus={onClosed}
      >
        {current?.status === 'ready' ? (
          <AccountForm
            key={`${current.id}:${current.values.type}`}
            mode="edit"
            excludeAccountId={current.id}
            snapshot={snapshot}
            initial={current.values}
            nameRef={nameRef}
            onDirty={() => setDirty(true)}
            onSavingChange={setSaving}
            onSubmit={(values) => onSubmit(current.id, values)}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle ref={titleRef} tabIndex={-1}>Edit account</DialogTitle>
              <DialogDescription className="sr-only">Load or edit this account&rsquo;s saved starting values.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {current?.status === 'error' ? (
                <InlineNotice tone="error">Couldn&rsquo;t load this account. Check your connection and try again.</InlineNotice>
              ) : (
                <p role="status" aria-live="polite" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Loading account details…
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" className="grow" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {current?.status === 'error' && (
                <Button
                  type="button"
                  className="grow"
                  onClick={() => {
                    setLoadState({ id: current.id, status: 'loading' })
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
