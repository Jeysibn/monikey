import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/*
 * The single confirmation message at the top of a screen after a save. The live region is always in the
 * page (an empty live region announces nothing), so adding text to it is read out politely.
 * One message at a time: a new one replaces the old. It can be dismissed and clears itself (App.tsx).
 */
export interface StatusNote {
  text: string
  action?: { label: string; run: () => void }
}

export function StatusMessage({ note, onDismiss }: { note: StatusNote | null; onDismiss: () => void }): ReactNode {
  return (
    <div role="status" aria-live="polite">
      {note && (
        <div className="mb-[18px] flex items-start gap-2 rounded-control bg-success-soft py-2 pr-1.5 pl-4 text-[15px] text-income-ink">
          <p className="min-w-0 flex-1 py-1.5">
            {note.text}
            {note.action && (
              <>
                {' '}
                <Button variant="link" className="min-h-0 px-0 align-baseline text-[15px] text-income-ink underline" onClick={note.action.run}>
                  {note.action.label}
                </Button>
              </>
            )}
          </p>
          <Button variant="ghost" size="icon" aria-label="Dismiss message" onClick={onDismiss} className="shrink-0 hover:bg-white/60">
            <X aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
