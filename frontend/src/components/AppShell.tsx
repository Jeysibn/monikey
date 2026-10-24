import type { ReactNode } from 'react'
import { House, List, Plus, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'

/*
 * The frame around every screen (DESIGN.md section D). One set of three destinations, shown three ways:
 *   < 768px      bottom bar (Overview, Activity, Accounts and a filled Add item)
 *   768-1023px   80px left rail (icon over label); Add transaction is in each page header
 *   >= 1024px    224px sidebar (mark, wordmark, labelled items); Add transaction is in the page header
 * Navigation is plain React state in App.tsx: no router. The active item has aria-current="page".
 * The phone and the sidebar navs are both landmarks named "Main"; CSS hides whichever does not apply,
 * and hidden elements are removed from the accessibility tree, so only one is ever announced.
 */
export type View = 'overview' | 'activity' | 'accounts'

const destinations: { view: View; label: string; Icon: LucideIcon }[] = [
  { view: 'overview', label: 'Overview', Icon: House },
  { view: 'activity', label: 'Activity', Icon: List },
  { view: 'accounts', label: 'Accounts', Icon: Wallet },
]

/* Key-and-coin mark: a ring holding the peso sign, with a short key shaft and two teeth. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="16" r="9" />
      <path strokeWidth="2" d="M9.4 21V11h4.1a2.6 2.6 0 0 1 0 5.2H9.4M7.4 13.3h8M7.4 15.4h8" />
      <path d="M21 16h9M25.5 16v4.5M29 16v3" />
    </svg>
  )
}

function NavButton({ view, label, Icon, active, onNavigate }: { view: View; label: string; Icon: LucideIcon; active: boolean; onNavigate: (view: View) => void }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(view)}
      className={cn(
        'flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs font-semibold text-muted-foreground hover:text-foreground',
        'md:min-h-[60px] md:gap-1',
        'lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-2.5 lg:text-[15px] lg:hover:bg-secondary',
        active && 'text-foreground lg:bg-primary-soft lg:text-primary-ink lg:hover:bg-primary-soft',
      )}
    >
      <span
        className={cn(
          'grid h-[30px] w-[54px] place-items-center rounded-full',
          'lg:h-auto lg:w-auto',
          active && 'bg-primary-soft text-primary-ink lg:bg-transparent',
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span>{label}</span>
    </button>
  )
}

export function AppShell({
  view,
  onNavigate,
  onAdd,
  addDisabled = false,
  children,
}: {
  view: View
  onNavigate: (view: View) => void
  onAdd: () => void
  addDisabled?: boolean
  children: ReactNode
}) {
  const items = destinations.map((d) => (
    <NavButton key={d.view} {...d} active={view === d.view} onNavigate={onNavigate} />
  ))

  return (
    <div className="min-h-dvh">
      {/* Tablet rail and desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col gap-1.5 border-r border-border bg-background px-2 py-[18px] md:flex lg:w-56 lg:px-3.5 lg:py-[22px]">
        <div className="mb-[18px] flex flex-col items-center gap-1 text-primary lg:mb-6 lg:flex-row lg:gap-2.5 lg:px-2.5">
          <BrandMark className="size-8" />
          <span className="hidden text-[19px] font-bold tracking-[-0.015em] text-foreground lg:inline">MoniKey</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1.5">
          {items}
        </nav>
      </aside>

      <main className="px-4 pt-3.5 pb-[calc(96px+env(safe-area-inset-bottom))] md:ml-20 md:px-6 md:pt-7 md:pb-8 lg:ml-56 lg:pt-9 lg:pb-12">
        <div className="mx-auto max-w-[1032px]">
          {/* The sidebar names the product from 768px up; phones get it here. */}
          <div className="mb-3.5 flex items-center gap-2 text-lg font-bold tracking-[-0.015em] md:hidden">
            <BrandMark className="size-[30px] text-primary" />
            MoniKey
          </div>
          {children}
        </div>
      </main>

      {/* Phone bottom bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(68px+env(safe-area-inset-bottom))] grid-cols-[repeat(3,1fr)_1.3fr] gap-1.5 border-t border-border bg-card px-2.5 pt-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items}
        <Button
          className="h-[52px] self-center rounded-[14px] text-[15px]"
          onClick={onAdd}
          disabled={addDisabled}
          aria-label={addDisabled ? 'Add transaction (add an account first)' : 'Add transaction'}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </nav>
    </div>
  )
}
