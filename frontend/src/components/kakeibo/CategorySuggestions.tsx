import { useState } from 'react'
import { LoaderCircle, Tags } from 'lucide-react'

import { InlineNotice } from '@/components/InlineNotice'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ENVELOPES, ENVELOPE_INFO, envelopeLabel } from '@/lib/kakeibo'
import type { Category, KakeiboEnvelope } from '@/types'

/*
 * Category suggestions (ADR-021): for each expense category, the envelope Quick Add suggests for a new
 * expense, or none. A suggestion never changes an expense already saved, and income categories have none.
 * Only the categories that changed are sent (PATCH /api/categories/{id}/default-kakeibo-envelope), one at a
 * time; if some fail, the dialog stays open with those still changed, and says how many were saved.
 */
type Choice = KakeiboEnvelope | ''

function Body({
  categories,
  onSave,
  onClose,
  onBusyChange,
}: {
  categories: Category[]
  onSave: (changes: { id: number; envelope: KakeiboEnvelope | null }[]) => Promise<number[]> // resolves with the ids that failed
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const expense = categories.filter((c) => c.type === 'expense' && !c.archived)
  const [choices, setChoices] = useState<Record<number, Choice>>(() => Object.fromEntries(expense.map((c) => [c.id, c.defaultEnvelope ?? ''])))
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const changes = expense
    .filter((c) => (choices[c.id] || null) !== (c.defaultEnvelope ?? null))
    .map((c) => ({ id: c.id, envelope: (choices[c.id] || null) as KakeiboEnvelope | null }))

  const save = async () => {
    if (saving || changes.length === 0) return
    setSaving(true)
    onBusyChange(true)
    setFailure(null)
    const failed = await onSave(changes)
    onBusyChange(false)
    setSaving(false)
    if (failed.length > 0) {
      setFailure(`${changes.length - failed.length} of ${changes.length} saved. ${failed.length} couldn't be saved; they're still changed below. Try again.`)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Category suggestions</DialogTitle>
        <DialogDescription>
          When you pick a category in Quick Add, its suggested envelope is chosen for you until you pick one yourself.
          Changing a suggestion never changes expenses you&rsquo;ve already saved.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-3 border-0 p-0">
          <legend className="sr-only">Suggested envelope for each expense category</legend>
          {failure && <InlineNotice tone="error">{failure}</InlineNotice>}
          {expense.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <label htmlFor={`cs-${category.id}`} className="text-[0.9375rem] font-medium">{category.name}</label>
              <select
                id={`cs-${category.id}`}
                value={choices[category.id] ?? ''}
                onChange={(event) => setChoices((c) => ({ ...c, [category.id]: event.target.value as Choice }))}
                className="h-11 w-44 cursor-pointer rounded-control border border-input bg-card pl-3 text-base text-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg"
              >
                {ENVELOPES.map((e) => <option key={e} value={e}>{ENVELOPE_INFO[e].label}</option>)}
                <option value="">No suggestion</option>
              </select>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">Income categories never get an envelope.</p>
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" className="grow" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" className="grow-[1.4]" onClick={() => void save()} disabled={saving || changes.length === 0}>
          {saving ? <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Saving…</> : changes.length === 0 ? 'No changes' : `Save ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`}
        </Button>
      </DialogFooter>
    </>
  )
}

export function CategorySuggestionsCard({
  categories,
  onSave,
  onOpen,
  onClosed,
}: {
  categories: Category[] | undefined
  onSave: (changes: { id: number; envelope: KakeiboEnvelope | null }[]) => Promise<number[]>
  onOpen: () => void
  onClosed: (event: Event) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const expense = categories?.filter((c) => c.type === 'expense' && !c.archived) ?? []
  const set = expense.filter((c) => c.defaultEnvelope)

  return (
    <Card role="region" aria-labelledby="kakeibo-suggestions-title" className="min-w-0">
      <CardTitle id="kakeibo-suggestions-title" tabIndex={-1}>Category suggestions</CardTitle>
      <CardDescription>
        {set.length === 0
          ? 'No category suggests an envelope yet.'
          : set.map((c) => `${c.name}: ${envelopeLabel(c.defaultEnvelope)}`).join(' · ')}
      </CardDescription>
      <Button variant="secondary" className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={!categories} onClick={() => { onOpen(); setOpen(true) }}>
        <Tags aria-hidden="true" />
        Edit suggestions
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && setOpen(false)}>
        {open && categories && (
          <DialogContent
            onEscapeKeyDown={(event) => busy && event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onCloseAutoFocus={onClosed}
          >
            <Body
              categories={categories}
              onClose={() => setOpen(false)}
              onBusyChange={setBusy}
              onSave={async (changes) => {
                const failed = await onSave(changes)
                if (failed.length === 0) setOpen(false)
                return failed
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </Card>
  )
}
