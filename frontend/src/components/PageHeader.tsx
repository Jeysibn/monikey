import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

/*
 * Page title (a noun) on the left; actions on the right. The "Add transaction" button lives here from
 * 768px up; on phones the bottom bar carries Add instead, so this one is hidden below 768px.
 * The h1 can take focus (tabIndex -1) so the shell can move keyboard users to it after navigation.
 */
export function PageHeader({
  title,
  children,
  onAdd,
  addDisabled = false,
}: {
  title: string
  children?: ReactNode
  onAdd: () => void
  addDisabled?: boolean
}) {
  return (
    <div className="mb-[18px] flex items-center justify-between gap-3">
      <h1 tabIndex={-1} className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] md:text-[28px]">
        {title}
      </h1>
      <div className="flex items-center gap-2.5">
        {children}
        <Button className="hidden md:inline-flex" onClick={onAdd} disabled={addDisabled}>
          <Plus aria-hidden="true" />
          {addDisabled ? 'Add an account first' : 'Add transaction'}
        </Button>
      </div>
    </div>
  )
}
