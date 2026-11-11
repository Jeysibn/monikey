import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'

import { CategoryBadge } from '@/components/CategoryBadge'
import { CategoryIconPicker } from '@/components/CategoryIconPicker'
import { CategoryColorPicker } from '@/components/categories/CategoryColorPicker'
import { ConfirmPanel } from '@/components/ConfirmPanel'
import { FormField } from '@/components/FormField'
import { InlineNotice } from '@/components/InlineNotice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isCategoryColorKey, type CategoryColorKey } from '@/lib/categoryColors'
import { isCategoryIconKey, type CategoryIconKey } from '@/lib/categoryIconRegistry'
import { canDeleteCategory, usageText } from '@/lib/categoryList'
import { ENVELOPES, ENVELOPE_INFO, envelopeLabel } from '@/lib/kakeibo'
import type { Category, CategoryType, KakeiboEnvelope } from '@/types'

/*
 * Add / Edit Category (spec §5.3): name, type (chosen when adding, fixed afterwards), icon, color, default
 * Kakeibo envelope (expense only) and a live preview of how the category will look in lists. Saving is the
 * parent's job; `onSubmit` resolves on success or rejects with the message to show. The default envelope is a
 * suggestion for FUTURE expenses only and the note says so. In edit mode, Delete swaps the dialog's content for
 * a confirmation (and is offered only while no transaction uses the category; otherwise the dialog says why).
 */
export interface CategoryFormValues {
  name: string
  type: CategoryType
  defaultEnvelope: KakeiboEnvelope | null
  iconKey: CategoryIconKey | null
  colorKey: CategoryColorKey | null
}

const SELECT =
  'h-12 w-full min-w-0 cursor-pointer rounded-control border border-input bg-card pl-3.5 text-base text-foreground disabled:cursor-not-allowed disabled:bg-disabled-bg'

function Editor({
  category,
  initialType,
  onSubmit,
  onDelete,
  onCancel,
  onBusyChange,
}: {
  category: Category | null
  initialType: CategoryType
  onSubmit: (values: CategoryFormValues) => Promise<void>
  onDelete: (category: Category) => Promise<void>
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const editing = category !== null
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType>(category?.type ?? initialType)
  const [envelope, setEnvelope] = useState<KakeiboEnvelope | ''>(category?.defaultEnvelope ?? '')
  const [iconKey, setIconKey] = useState<CategoryIconKey | null>(isCategoryIconKey(category?.iconKey) ? category.iconKey : null)
  const [colorKey, setColorKey] = useState<CategoryColorKey | null>(isCategoryColorKey(category?.colorKey) ? category.colorKey : null)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Move focus to the name field once it can take it: the fieldset is disabled while saving.
  useEffect(() => {
    if (nameError && !saving) nameRef.current?.focus()
  }, [nameError, saving])

  const isExpense = type === 'expense'
  const previewMeta = isExpense ? `Expense · ${envelope ? envelopeLabel(envelope) : 'Not classified'}` : 'Income'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const normalized = name.trim().replace(/\s+/g, ' ')
    if (!normalized) {
      setNameError('Enter a category name.')
      return
    }
    setNameError(null)
    setFormError(null)
    setSaving(true)
    onBusyChange(true)
    try {
      await onSubmit({ name: normalized, type, defaultEnvelope: isExpense ? envelope || null : null, iconKey, colorKey })
      setSaving(false)
      onBusyChange(false) // saved: never leave the dialog's Escape and outside-click guard stuck on
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this category. Try again.'
      if (error instanceof Error && 'field' in error && error.field === 'name') {
        setNameError(message)
      } else setFormError(message)
      setSaving(false)
      onBusyChange(false)
    }
  }

  return (
    <>
      <form id="category-form" noValidate hidden={confirmingDelete} onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col">
        {!confirmingDelete && (
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${category.name}` : 'Add category'}</DialogTitle>
            <DialogDescription>Names are unique within expense or income categories.</DialogDescription>
          </DialogHeader>
        )}
        <DialogBody>
          <fieldset disabled={saving} className="m-0 grid min-w-0 gap-4 border-0 p-0">
            {formError && <InlineNotice tone="error">{formError}</InlineNotice>}

            <FormField id="category-name" label="Name" error={nameError ?? undefined}>
              <Input
                id="category-name"
                ref={nameRef}
                autoComplete="off"
                maxLength={60}
                value={name}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'category-name-error' : undefined}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
              />
            </FormField>

            {editing ? (
              <p className="text-sm text-muted-foreground">
                Type: <span className="font-semibold text-foreground">{category.type === 'expense' ? 'Expense' : 'Income'}</span> · fixed after creation
              </p>
            ) : (
              <FormField id="category-type" label="Type">
                <select id="category-type" value={type} onChange={(e) => setType(e.target.value as CategoryType)} className={SELECT}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </FormField>
            )}

            <CategoryIconPicker value={iconKey} onChange={setIconKey} />
            <CategoryColorPicker value={colorKey} onChange={setColorKey} disabled={saving} />

            {isExpense && (
              <FormField
                id="category-envelope"
                label="Default Kakeibo envelope"
                helper="Suggested for new expenses in this category. Expenses you already saved keep their own envelope."
              >
                <select id="category-envelope" value={envelope} onChange={(e) => setEnvelope(e.target.value as KakeiboEnvelope | '')} className={SELECT}>
                  <option value="">No default</option>
                  {ENVELOPES.map((key) => (
                    <option key={key} value={key}>
                      {ENVELOPE_INFO[key].label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div aria-label="Appearance preview" role="group" className="grid gap-1.5">
              <p className="text-sm font-medium">Preview</p>
              <div className="flex items-center gap-3 rounded-control border border-border bg-surface-raised px-3 py-2.5">
                <CategoryBadge iconKey={iconKey} colorKey={colorKey} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{name.trim() || 'Category name'}</p>
                  <p className="truncate text-sm text-muted-foreground">{previewMeta}</p>
                </div>
              </div>
            </div>

            {editing && !canDeleteCategory(category) && (
              <p className="text-sm text-muted-foreground">
                {usageText(category) || 'Usage is unknown right now.'}, so it can’t be deleted. Archive it instead to hide it from new transactions; past ones keep it.
              </p>
            )}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {editing && canDeleteCategory(category) && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-error-soft hover:text-error-ink" disabled={saving} onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
          <Button type="button" variant="secondary" className="grow" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="grow-[1.4]" disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                Saving…
              </>
            ) : editing ? (
              'Save changes'
            ) : (
              'Create category'
            )}
          </Button>
        </DialogFooter>
      </form>

      {confirmingDelete && category && (
        <ConfirmPanel
          title={`Delete “${category.name}”?`}
          confirmLabel="Delete category"
          busyLabel="Deleting…"
          onConfirm={() => onDelete(category)}
          onCancel={() => setConfirmingDelete(false)}
          onBusyChange={onBusyChange}
        >
          <p>This permanently removes the category. No transaction uses it, so no history changes.</p>
          <p>This can’t be undone. To keep it but hide it from new transactions, archive it instead.</p>
        </ConfirmPanel>
      )}
    </>
  )
}

export function CategoryFormDialog({
  open,
  category,
  initialType,
  onSubmit,
  onDelete,
  onOpenChange,
  onClosed,
}: {
  open: boolean
  category: Category | null // null: adding
  initialType: CategoryType
  onSubmit: (values: CategoryFormValues) => Promise<void>
  onDelete: (category: Category) => Promise<void>
  onOpenChange: (open: boolean) => void
  onClosed?: (event: Event) => void
}) {
  const busy = useRef(false)
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || !busy.current) onOpenChange(next) }}>
      {open && (
        <DialogContent
          onOpenAutoFocus={(e) => {
            busy.current = false // a fresh opening is never busy
            e.preventDefault()
            document.getElementById('category-name')?.focus()
          }}
          onEscapeKeyDown={(e) => busy.current && e.preventDefault()}
          onInteractOutside={(e) => busy.current && e.preventDefault()}
          onCloseAutoFocus={onClosed}
        >
          <Editor
            key={category?.id ?? 'new'}
            category={category}
            initialType={initialType}
            onSubmit={onSubmit}
            onDelete={onDelete}
            onCancel={() => onOpenChange(false)}
            onBusyChange={(b) => (busy.current = b)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
