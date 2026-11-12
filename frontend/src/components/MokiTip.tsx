import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

import { Moki, type MokiPose } from '@/components/Moki'
import { Button } from '@/components/ui/button'
import { moveFocusTo } from '@/lib/focus'
import { dismissTip, readDismissedTips, type MokiTipId } from '@/lib/mokiTips'

/*
 * A short, dismissible hint from Moki. It sits under a page title, never over figures or controls, never blocks
 * an action, and once dismissed stays away (remembered in this browser). It is a plain labelled region, so it is
 * read in order and skipped easily. Not used on Overview or Accounts, where the money comes first.
 */
export function MokiTip({ id, pose, title, children, className }: { id: MokiTipId; pose: MokiPose; title: string; children: ReactNode; className?: string }) {
  const [hidden, setHidden] = useState(() => readDismissedTips().includes(id))
  if (hidden) return null
  const headingId = `moki-tip-${id}`
  return (
    <aside aria-labelledby={headingId} data-moki-tip={id} className={`mb-4 flex items-center gap-2.5 rounded-card border border-primary/25 bg-primary/10 py-2.5 pr-1 pl-3 sm:gap-4 md:p-4 ${className ?? ''}`}>
      <Moki pose={pose} size="tip" className="max-[359px]:hidden drop-shadow-sm" />
      <div className="min-w-0 flex-1">
        <p id={headingId} className="text-[0.9375rem] leading-snug font-semibold">{title}</p>
        <p className="text-[0.8125rem] leading-snug text-muted-foreground sm:text-sm">{children}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 self-start"
        aria-label={`Dismiss tip: ${title}`}
        onClick={() => {
          dismissTip(id)
          moveFocusTo('main h1') // the button is about to disappear; keep the keyboard where the page begins
          setHidden(true)
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </aside>
  )
}
