import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { Moki, type MokiPose } from '@/components/Moki'
import { addBlocked, addLabel } from '@/components/addState'
import { Button } from '@/components/ui/button'
import type { AddState } from '@/types'

/*
 * Page title (a noun) on the left; actions on the right. The "Add transaction" button lives here from
 * 768px up; on phones the bottom bar carries Add instead, so this one is hidden below 768px.
 * The h1 can take focus (tabIndex -1) so the shell can move keyboard users to it after navigation.
 */
export function PageHeader({
  title,
  children,
  onAdd,
  addState = 'ready',
  mascot,
}: {
  title: string
  children?: ReactNode
  onAdd: () => void
  addState?: AddState
  /** A decorative Moki beside the title. Only on pages that are not about money figures first. */
  mascot?: MokiPose
}) {
  return (
    <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-3">
        {mascot && <Moki pose={mascot} size="header" />}
        <h1 tabIndex={-1} className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] md:text-[1.75rem]">
          {title}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {children}
        <Button className="hidden md:inline-flex" onClick={onAdd} disabled={addBlocked(addState)}>
          <Plus aria-hidden="true" />
          {addLabel(addState)}
        </Button>
      </div>
    </div>
  )
}
