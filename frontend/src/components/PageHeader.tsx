import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

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
}: {
  title: string
  children?: ReactNode
  onAdd: () => void
  addState?: AddState
}) {
  return (
    <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h1 tabIndex={-1} className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] md:text-[1.75rem]">
        {title}
      </h1>
      <div className="flex items-center gap-2.5">
        {children}
        <Button className="hidden md:inline-flex" onClick={onAdd} disabled={addBlocked(addState)}>
          <Plus aria-hidden="true" />
          {addLabel(addState)}
        </Button>
      </div>
    </div>
  )
}
