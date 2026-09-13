import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'

type ConfirmRequest = { title: string; message: string; confirmLabel?: string }

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  function confirm(next: ConfirmRequest) {
    return new Promise<boolean>((resolve) => {
      setRequest(next)
      setResolver(() => resolve)
    })
  }

  function close(value: boolean) {
    resolver?.(value)
    setResolver(null)
    setRequest(null)
  }

  return {
    confirm,
    dialog: request ? (
      <ConfirmDialog
        open
        title={request.title}
        message={request.message}
        confirmLabel={request.confirmLabel}
        onConfirm={() => close(true)}
        onClose={() => close(false)}
      />
    ) : null,
  }
}
